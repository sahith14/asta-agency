/**
 * AgencyOS — Ticket messages API (Task 2-c).
 * GET  /api/tickets/[id]/messages → TicketMessageRecord[] (asc, author refs)
 * POST /api/tickets/[id]/messages → TicketMessageRecord (201)
 *
 * POST is a discriminated union:
 *  - { kind: "INTERNAL_NOTE", body }            → permanent operator note
 *  - { kind: "REPLY", to|toEmails, cc?, subject?, body, saveDraft? }
 *
 * LEAK GUARD: internal note bodies live ONLY in TicketMessage rows and are
 * never copied into activity logs (summary is fixed text), outgoing emails or
 * any other surface. A REPLY post ALWAYS creates a DRAFT — `saveDraft` is
 * accepted for API compatibility but has no effect: sending happens exclusively
 * through POST .../messages/[messageId]/send.
 */
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { requireModule, requireRoles, assertTicketAccess } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import type { SessionUser } from "@/lib/auth";
import { ticketMessageInclude, toTicketMessageRecord } from "../../record";
import { parseRecipients } from "./recipients";

const noteSchema = z.object({
  kind: z.literal("INTERNAL_NOTE"),
  body: z.string().trim().min(1, "Note text is required."),
});

const replySchema = z.object({
  kind: z.literal("REPLY"),
  to: z.string().min(1).optional(),
  toEmails: z.array(z.string()).optional(),
  cc: z.union([z.string(), z.array(z.string())]).optional(),
  ccEmails: z.union([z.string(), z.array(z.string())]).optional(),
  subject: z.string().trim().max(200, "Subject must be at most 200 characters.").optional(),
  body: z.string().trim().min(1, "Reply body is required."),
  saveDraft: z.boolean().optional(), // accepted; semantically identical (POST never sends)
});

const postSchema = z.discriminatedUnion("kind", [noteSchema, replySchema]);

function ticketNumberLabel(number: number): string {
  return `TKT-${String(number).padStart(4, "0")}`;
}

async function loadTicket(id: string) {
  const ticket = await db.ticket.findUnique({ where: { id } });
  if (!ticket) throw new NotFoundError("Ticket not found.");
  return ticket;
}

// ---------------------------------------------------------------------------
// GET /api/tickets/[id]/messages
// ---------------------------------------------------------------------------

export const GET = withAuth(async (req, user, { params }) => {
  const { id } = await params;
  await loadTicket(id);
  // RBAC: message read follows ticket read — founder/support; developers assigned/created.
  await assertTicketAccess(user, id, false);

  const rows = await db.ticketMessage.findMany({
    where: { ticketId: id },
    include: ticketMessageInclude,
    orderBy: { createdAt: "asc" },
  });
  return jsonOk(rows.map(toTicketMessageRecord));
});

// ---------------------------------------------------------------------------
// POST /api/tickets/[id]/messages
// ---------------------------------------------------------------------------

export const POST = withAuth(async (req, user: SessionUser, { params }) => {
  const { id } = await params;
  const ticket = await loadTicket(id);
  const body = await parseBody(req, postSchema);
  // RBAC: REPLY becomes a client-facing email — support + founder only;
  // developers assigned to the ticket may add INTERNAL_NOTE context only.
  if (body.kind === "REPLY") {
    requireRoles(user, ["SUPPORT_FINANCE"]);
  } else {
    requireModule(user, "support");
    await assertTicketAccess(user, id, false);
  }
  const label = ticketNumberLabel(ticket.number);

  if (body.kind === "INTERNAL_NOTE") {
    // Internal notes never touch awaitingReply/firstResponse — they are pure
    // operator context and their content never leaves the support workspace.
    const created = await db.ticketMessage.create({
      data: {
        ticketId: id,
        kind: "INTERNAL_NOTE",
        authorType: "OPERATOR",
        authorUserId: user.id,
        bodyText: body.body,
      },
    });

    // Fixed summary by design: note content must not leak into the activity feed.
    await logActivity({
      action: "TICKET_NOTE_ADDED",
      entityType: "TICKET",
      entityId: id,
      entityLabel: ticket.subject,
      summary: `Internal note added to ticket ${label}.`,
      actor: user,
      clientId: ticket.clientId,
      metadata: { ticketMessageId: created.id },
    });

    const row = await db.ticketMessage.findUnique({ where: { id: created.id }, include: ticketMessageInclude });
    if (!row) throw new NotFoundError("Message not found.");
    return jsonOk(toTicketMessageRecord(row), { status: 201 });
  }

  // --- REPLY (always persisted as a DRAFT) ------------------------------------
  const { to, cc } = parseRecipients(body);
  if (to.length === 0) {
    throw new BadRequestError("At least one recipient is required.");
  }
  const subject = body.subject && body.subject.length > 0 ? body.subject : ticket.subject;

  const created = await db.ticketMessage.create({
    data: {
      ticketId: id,
      kind: "REPLY",
      authorType: "OPERATOR",
      authorUserId: user.id,
      bodyText: body.body,
      toEmails: JSON.stringify(to),
      ccEmails: JSON.stringify(cc),
      subject,
      // Idempotency key used as our RFC-5322 Message-ID for reconciliation.
      providerMessageIdKey: randomBytes(16).toString("hex"),
      deliveryStatus: "DRAFT",
    },
  });

  await logActivity({
    action: "TICKET_REPLY_DRAFTED",
    entityType: "TICKET",
    entityId: id,
    entityLabel: ticket.subject,
    summary: `Reply draft created for ticket ${label}.`,
    actor: user,
    clientId: ticket.clientId,
    metadata: { ticketMessageId: created.id, to },
  });

  const row = await db.ticketMessage.findUnique({ where: { id: created.id }, include: ticketMessageInclude });
  if (!row) throw new NotFoundError("Message not found.");
  return jsonOk(toTicketMessageRecord(row), { status: 201 });
});
