/**
 * AgencyOS — Billing quote detail API (Phase 3).
 * GET   /api/billing/quotes/[id] → QuoteDetailData (quote + lines + activity +
 *       linked invoices + allowed transitions + parsed acceptedSnapshot)
 * PATCH /api/billing/quotes/[id] → DRAFT-only edits. A sent/accepted quote is
 *       preserved as its own commercial record and can never be rewritten.
 */
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { requireModule, requireFounder } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { getBillingSettings } from "@/lib/billing/settings";
import { QUOTE_TRANSITIONS } from "@/lib/types";
import {
  computeLineData,
  lineInputsFromRows,
  loadEntityActivity,
  quoteInclude,
  toBillingLineRecord,
  toQuoteRecord,
} from "@/lib/billing/record";
import { currencyInput, dateInput, linesSchema } from "@/lib/billing/validate";
import type { BillingLineRecord, LineItemInput, QuoteDetailData } from "@/lib/types";

// ---------------------------------------------------------------------------
// GET /api/billing/quotes/[id]
// ---------------------------------------------------------------------------

export const GET = withAuth(async (_req, user, { params }) => {
  // RBAC: commercial records are founder + support/finance read.
  requireModule(user, "billing");
  const { id } = await params;
  const settings = await getBillingSettings();

  const quote = await db.quote.findUnique({
    where: { id },
    include: { ...quoteInclude, lines: true, invoices: { select: { id: true, number: true, status: true, totalMinor: true, currency: true } } },
  });
  if (!quote) throw new NotFoundError("Quote not found.");

  const activity = await loadEntityActivity("QUOTE", quote.id);

  const acceptedSnapshot = parseAcceptedSnapshot(quote.acceptedSnapshot);

  const data: QuoteDetailData = {
    quote: toQuoteRecord(quote, settings.quotePrefix),
    lines: quote.lines.sort((a, b) => a.position - b.position).map((l) => toBillingLineRecord(l)),
    activity,
    invoices: quote.invoices
      .map((inv) => ({
        id: inv.id,
        displayNumber: `${settings.invoicePrefix}${String(inv.number).padStart(4, "0")}`,
        status: inv.status,
        totalMinor: inv.totalMinor,
        currency: inv.currency,
      }))
      .sort((a, b) => a.displayNumber.localeCompare(b.displayNumber)),
    allowedTransitions: [...(QUOTE_TRANSITIONS[quote.status] ?? [])],
    acceptedSnapshot,
  };
  return jsonOk(data);
});

function parseAcceptedSnapshot(raw: string | null): QuoteDetailData["acceptedSnapshot"] {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      "lines" in parsed &&
      "totals" in parsed &&
      Array.isArray((parsed as { lines: unknown }).lines)
    ) {
      return parsed as NonNullable<QuoteDetailData["acceptedSnapshot"]>;
    }
  } catch {
    // fall through
  }
  return null;
}

// ---------------------------------------------------------------------------
// PATCH /api/billing/quotes/[id] — DRAFT only
// ---------------------------------------------------------------------------

const patchQuoteSchema = z.object({
  clientId: z.string().min(1).optional(),
  projectId: z.string().min(1).nullish(),
  websiteId: z.string().min(1).nullish(),
  issueDate: dateInput,
  expiryDate: dateInput,
  currency: currencyInput.optional(),
  taxInclusive: z.boolean().optional(),
  scope: z.string().max(5000).nullish(),
  terms: z.string().max(5000).nullish(),
  lines: linesSchema.optional(), // replace-all when provided
});

export const PATCH = withAuth(async (req, user, { params }) => {
  // RBAC: quote edits are founder-only.
  requireFounder(user);
  const { id } = await params;
  const body = await parseBody(req, patchQuoteSchema);
  const settings = await getBillingSettings();

  const existing = await db.quote.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!existing) throw new NotFoundError("Quote not found.");
  if (existing.status !== "DRAFT") {
    throw new BadRequestError(
      "Only draft quotes can be edited — this quote is accepted/sent and is preserved as its own commercial record."
    );
  }

  // --- linked record validation (on change) ----------------------------------
  const effectiveClientId = body.clientId ?? existing.clientId;
  if (body.clientId) {
    const client = await db.client.findUnique({ where: { id: body.clientId }, select: { id: true } });
    if (!client) throw new BadRequestError("Client not found.");
  }
  if (body.websiteId) {
    const website = await db.website.findUnique({ where: { id: body.websiteId }, select: { id: true, clientId: true } });
    if (!website) throw new BadRequestError("Website not found.");
    if (website.clientId !== effectiveClientId) {
      throw new BadRequestError("Website does not belong to the selected client.");
    }
  }
  if (body.projectId) {
    const project = await db.project.findUnique({ where: { id: body.projectId }, select: { id: true, clientId: true } });
    if (!project) throw new BadRequestError("Project not found.");
    if (project.clientId !== effectiveClientId) {
      throw new BadRequestError("Project does not belong to the selected client.");
    }
  }

  // Totals depend on lines + tax mode only; recompute whenever either changes.
  const taxInclusive = body.taxInclusive ?? existing.taxInclusive;
  const rawLines: LineItemInput[] = body.lines
    ? body.lines
    : taxInclusive !== existing.taxInclusive
      ? lineInputsFromRows(existing.lines.sort((a, b) => a.position - b.position))
      : [];
  const { rows, totals } = rawLines.length > 0 ? computeLineData(rawLines, taxInclusive) : { rows: [], totals: null };

  const updated = await db.$transaction(async (tx) => {
    const data: Prisma.QuoteUpdateInput = {
      ...(body.clientId !== undefined ? { client: { connect: { id: body.clientId } } } : {}),
      ...(body.projectId !== undefined ? { project: body.projectId ? { connect: { id: body.projectId } } : { disconnect: true } } : {}),
      ...(body.websiteId !== undefined ? { website: body.websiteId ? { connect: { id: body.websiteId } } : { disconnect: true } } : {}),
      ...(body.issueDate !== undefined ? { issueDate: body.issueDate ?? new Date() } : {}),
      ...(body.expiryDate !== undefined ? { expiryDate: body.expiryDate } : {}),
      ...(body.currency !== undefined ? { currency: body.currency } : {}),
      ...(body.taxInclusive !== undefined ? { taxInclusive: body.taxInclusive } : {}),
      ...(body.scope !== undefined ? { scope: body.scope ?? null } : {}),
      ...(body.terms !== undefined ? { terms: body.terms ?? null } : {}),
      ...(totals
        ? {
            subtotalMinor: totals.subtotalMinor,
            taxMinor: totals.taxMinor,
            totalMinor: totals.totalMinor,
          }
        : {}),
    };
    const quote = await tx.quote.update({ where: { id }, data });

    if (body.lines) {
      await tx.quoteLineItem.deleteMany({ where: { quoteId: id } });
      await tx.quoteLineItem.createMany({ data: rows.map((row) => ({ ...row, quoteId: id })) });
    }
    return quote;
  });

  await logActivity({
    action: "QUOTE_UPDATED",
    entityType: "QUOTE",
    entityId: updated.id,
    entityLabel: `${settings.quotePrefix}${String(updated.number).padStart(4, "0")}`,
    summary: `Updated draft quote ${settings.quotePrefix}${String(updated.number).padStart(4, "0")}.`,
    actor: user,
    clientId: updated.clientId,
    websiteId: updated.websiteId,
    projectId: updated.projectId,
    metadata: { fields: Object.keys(body), linesReplaced: Boolean(body.lines) },
  });

  const full = await db.quote.findUnique({ where: { id }, include: { ...quoteInclude, lines: true } });
  if (!full) throw new BadRequestError("Quote could not be loaded after update.");
  const record = toQuoteRecord(full, settings.quotePrefix);
  record.lines = full.lines
    .sort((a, b) => a.position - b.position)
    .map((l): BillingLineRecord => toBillingLineRecord(l));
  return jsonOk(record);
});
