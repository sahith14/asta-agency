/**
 * AgencyOS — Billing quote status actions (Phase 3).
 * POST /api/billing/quotes/[id]/status  { action: "send" | "accept" | "reject" | "cancel" }
 *
 * AgencyOS does NOT email clients. "send" is the operator's explicit record
 * that the quote went out (e.g. emailed manually); "accept" freezes an
 * immutable snapshot of the commercial terms. All transitions are
 * server-validated against the frozen QUOTE_TRANSITIONS map.
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { requireFounder } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { getBillingSettings } from "@/lib/billing/settings";
import { startOfToday } from "@/lib/billing/invoice-math";
import { lineInputsFromRows, quoteInclude, toQuoteRecord } from "@/lib/billing/record";
import { computeTotals } from "@/lib/money";
import { label, QUOTE_TRANSITIONS } from "@/lib/types";

const statusSchema = z.object({
  action: z.enum(["send", "accept", "reject", "cancel"]),
  /** Human-readable acceptor name recorded on acceptance (optional). */
  acceptedByName: z.string().trim().max(120).optional(),
});

const ACTION_TARGET: Record<string, string> = {
  send: "SENT",
  accept: "ACCEPTED",
  reject: "REJECTED",
  cancel: "CANCELLED",
};

export const POST = withAuth(async (req, user, { params }) => {
  // RBAC: quote lifecycle actions (send/accept/reject/cancel) are founder-only.
  requireFounder(user);
  const { id } = await params;
  const body = await parseBody(req, statusSchema);
  const settings = await getBillingSettings();
  const target = ACTION_TARGET[body.action];

  const quote = await db.quote.findUnique({
    where: { id },
    include: { lines: { orderBy: { position: "asc" } } },
  });
  if (!quote) throw new NotFoundError("Quote not found.");

  const display = `${settings.quotePrefix}${String(quote.number).padStart(4, "0")}`;
  const allowed = QUOTE_TRANSITIONS[quote.status] ?? [];
  if (!allowed.includes(target)) {
    throw new BadRequestError(
      `Cannot move quote from ${label(quote.status)} to ${label(target)}. Allowed: ${allowed.map(label).join(", ") || "nothing"}.`
    );
  }

  const now = new Date();
  let updated;

  switch (body.action) {
    case "send": {
      if (quote.lines.length === 0 || quote.totalMinor <= 0) {
        throw new BadRequestError("Add at least one line with a positive total before sending the quote.");
      }
      updated = await db.quote.update({ where: { id }, data: { status: "SENT", sentAt: now } });
      await logActivity({
        action: "QUOTE_MARKED_SENT",
        kind: "AUDIT",
        entityType: "QUOTE",
        entityId: quote.id,
        entityLabel: display,
        summary: `Quote ${display} marked as sent (AgencyOS does not email the client — this records that the quote was delivered).`,
        actor: user,
        clientId: quote.clientId,
        websiteId: quote.websiteId,
        projectId: quote.projectId,
      });
      break;
    }

    case "accept": {
      const today = startOfToday();
      if (quote.expiryDate && quote.expiryDate.getTime() < today.getTime()) {
        throw new BadRequestError("This quote has passed its expiry date — extend it or create a new quote.");
      }
      // Immutable commercial snapshot: raw line inputs + server-computed totals.
      const rawLines = lineInputsFromRows(quote.lines);
      const totals = computeTotals(rawLines, quote.taxInclusive);
      const acceptedByName = body.acceptedByName?.trim() || user.displayName;
      const snapshot = JSON.stringify({
        lines: rawLines,
        totals,
        acceptedAt: now.toISOString(),
        acceptedByName,
      });
      updated = await db.quote.update({
        where: { id },
        data: { status: "ACCEPTED", acceptedAt: now, acceptedByName, acceptedSnapshot: snapshot },
      });
      await logActivity({
        action: "QUOTE_ACCEPTED",
        kind: "AUDIT",
        entityType: "QUOTE",
        entityId: quote.id,
        entityLabel: display,
        summary: `Quote ${display} accepted${acceptedByName ? ` by ${acceptedByName}` : ""} — terms frozen in an immutable snapshot.`,
        actor: user,
        clientId: quote.clientId,
        websiteId: quote.websiteId,
        projectId: quote.projectId,
      });
      break;
    }

    case "reject": {
      updated = await db.quote.update({ where: { id }, data: { status: "REJECTED", rejectedAt: now } });
      await logActivity({
        action: "QUOTE_REJECTED",
        kind: "AUDIT",
        entityType: "QUOTE",
        entityId: quote.id,
        entityLabel: display,
        summary: `Quote ${display} marked as rejected.`,
        actor: user,
        clientId: quote.clientId,
        websiteId: quote.websiteId,
        projectId: quote.projectId,
      });
      break;
    }

    case "cancel": {
      updated = await db.quote.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: now } });
      await logActivity({
        action: "QUOTE_CANCELLED",
        kind: "AUDIT",
        entityType: "QUOTE",
        entityId: quote.id,
        entityLabel: display,
        summary: `Quote ${display} cancelled.`,
        actor: user,
        clientId: quote.clientId,
        websiteId: quote.websiteId,
        projectId: quote.projectId,
      });
      break;
    }
  }

  const full = await db.quote.findUnique({ where: { id }, include: quoteInclude });
  if (!full) throw new NotFoundError("Quote not found.");
  return jsonOk(toQuoteRecord(full, settings.quotePrefix));
});
