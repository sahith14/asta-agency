/**
 * AgencyOS — Single ticket message API (Task 2-c).
 * GET    /api/tickets/[id]/messages/[messageId] → TicketMessageRecord (status polling)
 * PATCH  → edit a REPLY DRAFT (to/cc/subject/body) OR acknowledge an UNCERTAIN
 *           delivery as FAILED (operator's explicit, risk-acknowledged action)
 * DELETE → delete a REPLY DRAFT only
 *
 * INTERNAL_NOTE rows are immutable and permanent for audit integrity — editing
 * or deleting them is always a 400.
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { assertTicketAccess } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import type { SessionUser } from "@/lib/auth";
import { ticketMessageInclude, toTicketMessageRecord } from "../../../record";
import { parseRecipients } from "../recipients";

const editSchema = z.object({
  to: z.string().min(1).optional(),
  toEmails: z.array(z.string()).optional(),
  cc: z.union([z.string(), z.array(z.string())]).optional(),
  ccEmails: z.union([z.string(), z.array(z.string())]).optional(),
  subject: z.string().trim().max(200, "Subject must be at most 200 characters.").optional(),
  body: z.string().trim().min(1, "Reply body is required.").optional(),
  // Operator decision after checking Gmail by hand: an UNCERTAIN delivery is
  // acknowledged as FAILED. Any other transition is rejected.
  deliveryStatus: z.literal("FAILED").optional(),
});

async function loadMessage(ticketId: string, messageId: string) {
  const message = await db.ticketMessage.findUnique({ where: { id: messageId } });
  // Scoped to the ticket in the URL — no cross-ticket access.
  if (!message || message.ticketId !== ticketId) throw new NotFoundError("Message not found.");
  return message;
}

function ticketNumberLabel(number: number): string {
  return `TKT-${String(number).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------
// GET — delivery status polling
// ---------------------------------------------------------------------------

export const GET = withAuth(async (req, user, { params }) => {
  const { id, messageId } = await params;
  await loadMessage(id, messageId);
  // RBAC: delivery status follows ticket read — founder/support; developers assigned/created.
  await assertTicketAccess(user, id, false);
  const row = await db.ticketMessage.findUnique({
    where: { id: messageId },
    include: ticketMessageInclude,
  });
  if (!row) throw new NotFoundError("Message not found.");
  return jsonOk(toTicketMessageRecord(row));
});

// ---------------------------------------------------------------------------
// PATCH — draft edit OR mark-uncertain-failed
// ---------------------------------------------------------------------------

export const PATCH = withAuth(async (req, user: SessionUser, { params }) => {
  const { id, messageId } = await params;
  const message = await loadMessage(id, messageId);
  // RBAC: draft edits/mark-failed — founder/support; developers on assigned/created tickets.
  await assertTicketAccess(user, id, true);
  const body = await parseBody(req, editSchema);
  const ticket = await db.ticket.findUnique({ where: { id } });
  if (!ticket) throw new NotFoundError("Ticket not found.");
  const label = ticketNumberLabel(ticket.number);

  // --- deliveryStatus branch: acknowledged-risk FAILED for UNCERTAIN only ----
  if (body.deliveryStatus !== undefined) {
    const contentKeys = ["to", "toEmails", "cc", "ccEmails", "subject", "body"] as const;
    if (contentKeys.some((key) => body[key] !== undefined)) {
      throw new BadRequestError("Cannot combine draft edits with a delivery status change.");
    }
    if (message.kind !== "REPLY") {
      throw new BadRequestError("Only replies carry a delivery status.");
    }
    if (message.deliveryStatus !== "UNCERTAIN") {
      throw new BadRequestError("Only uncertain deliveries can be marked as failed.");
    }
    const updated = await db.ticketMessage.update({
      where: { id: messageId },
      data: {
        deliveryStatus: "FAILED",
        deliveryError: "Marked as failed by operator after checking Gmail (original outcome was uncertain).",
      },
    });
    await logActivity({
      action: "TICKET_REPLY_MARKED_FAILED",
      kind: "AUDIT",
      entityType: "TICKET",
      entityId: id,
      entityLabel: ticket.subject,
      summary: `Reply delivery marked as failed for ticket ${label} (was uncertain).`,
      actor: user,
      clientId: ticket.clientId,
      metadata: { ticketMessageId: messageId },
    });
    const row = await db.ticketMessage.findUnique({ where: { id: updated.id }, include: ticketMessageInclude });
    if (!row) throw new NotFoundError("Message not found.");
    return jsonOk(toTicketMessageRecord(row));
  }

  // --- draft edit branch ------------------------------------------------------
  // Only DRAFT replies are editable; notes are permanent, anything already
  // handed to Gmail (or uncertain) cannot be rewritten.
  if (message.kind !== "REPLY" || message.deliveryStatus !== "DRAFT") {
    throw new BadRequestError("Only drafts can be edited.");
  }

  const data: { bodyText?: string; toEmails?: string; ccEmails?: string; subject?: string } = {};
  const changed: string[] = [];

  if (body.to !== undefined || body.toEmails !== undefined || body.cc !== undefined || body.ccEmails !== undefined) {
    const { to, cc } = parseRecipients({
      to: body.to,
      toEmails: body.toEmails,
      cc: body.cc,
      ccEmails: body.ccEmails,
    });
    // Recipients only ever narrow to what was provided: partial edits keep the
    // stored list when the corresponding key is absent.
    if (body.to !== undefined || body.toEmails !== undefined) {
      if (to.length === 0) throw new BadRequestError("At least one recipient is required.");
      data.toEmails = JSON.stringify(to);
      changed.push("to");
    }
    if (body.cc !== undefined || body.ccEmails !== undefined) {
      data.ccEmails = JSON.stringify(cc);
      changed.push("cc");
    }
  }
  if (body.subject !== undefined) {
    data.subject = body.subject;
    changed.push("subject");
  }
  if (body.body !== undefined) {
    data.bodyText = body.body;
    changed.push("body");
  }

  if (changed.length === 0) {
    throw new BadRequestError("Nothing to update.");
  }

  await db.ticketMessage.update({ where: { id: messageId }, data });

  await logActivity({
    action: "TICKET_REPLY_DRAFT_UPDATED",
    entityType: "TICKET",
    entityId: id,
    entityLabel: ticket.subject,
    summary: `Reply draft updated for ticket ${label}.`,
    actor: user,
    clientId: ticket.clientId,
    metadata: { ticketMessageId: messageId, fields: changed },
  });

  const row = await db.ticketMessage.findUnique({ where: { id: messageId }, include: ticketMessageInclude });
  if (!row) throw new NotFoundError("Message not found.");
  return jsonOk(toTicketMessageRecord(row));
});

// ---------------------------------------------------------------------------
// DELETE — drafts only
// ---------------------------------------------------------------------------

export const DELETE = withAuth(async (req, user: SessionUser, { params }) => {
  const { id, messageId } = await params;
  const message = await loadMessage(id, messageId);
  // RBAC: deleting a draft follows ticket write — founder/support; developers assigned/created.
  await assertTicketAccess(user, id, true);
  const ticket = await db.ticket.findUnique({ where: { id } });
  if (!ticket) throw new NotFoundError("Ticket not found.");
  const label = ticketNumberLabel(ticket.number);

  if (message.kind !== "REPLY" || message.deliveryStatus !== "DRAFT") {
    // Internal notes are permanent for audit integrity; sent/failed/uncertain
    // replies are delivery history and cannot be retracted here.
    throw new BadRequestError("Only drafts can be deleted.");
  }

  await db.ticketMessage.delete({ where: { id: messageId } });

  await logActivity({
    action: "TICKET_REPLY_DRAFT_DELETED",
    entityType: "TICKET",
    entityId: id,
    entityLabel: ticket.subject,
    summary: `Reply draft deleted for ticket ${label}.`,
    actor: user,
    clientId: ticket.clientId,
    metadata: { ticketMessageId: messageId },
  });

  return jsonOk({ deleted: true, id: messageId });
});
