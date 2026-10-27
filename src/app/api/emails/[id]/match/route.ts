/**
 * AgencyOS — Email match decisions API (Task 2-c).
 * POST /api/emails/[id]/match
 *
 * zod discriminated union:
 *  - { action: "CONFIRM", clientId, websiteId?, ticketId?, createTicket?: { subject? } }
 *  - { action: "UNRELATED" }                          → terminal NO_MATCH
 *  - { action: "LINK_TICKET", ticketId }
 *
 * CONFIRM persists the decision as an EmailMatchRule (keyed on the normalised
 * fromEmail) so future syncs match deterministically. Rule updates never clear
 * the rule's websiteId when websiteId was omitted (absent = unchanged).
 * All outcomes are AUDIT-logged with fromEmail + subject only — never bodies.
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { requireFounder } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { normalizeEmail } from "@/lib/matching";
import { createTicketWithNumber } from "@/lib/ticket-num";
import type { SessionUser } from "@/lib/auth";
import { emailInclude, loadSuggestedClientMap, toEmailMessageRecord } from "../../record";

const matchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("CONFIRM"),
    clientId: z.string().min(1),
    websiteId: z.string().min(1).nullish(),
    ticketId: z.string().min(1).nullish(),
    createTicket: z
      .object({
        subject: z
          .string()
          .trim()
          .min(2, "Ticket subject must be at least 2 characters.")
          .max(200, "Ticket subject must be at most 200 characters.")
          .optional(),
      })
      .optional(),
  }),
  z.object({
    action: z.literal("UNRELATED"),
  }),
  z.object({
    action: z.literal("LINK_TICKET"),
    ticketId: z.string().min(1),
  }),
]);

async function loadEmailRecord(id: string) {
  const row = await db.emailMessage.findUnique({ where: { id }, include: emailInclude });
  if (!row) throw new NotFoundError("Email not found.");
  return row;
}

/** Attach the suggestedClient ref so the response matches the list shape. */
async function toRecordWithRefs(id: string) {
  const row = await loadEmailRecord(id);
  const suggestedClients = await loadSuggestedClientMap(row.suggestedClientId ? [row.suggestedClientId] : []);
  return {
    ...toEmailMessageRecord(row),
    suggestedClient: row.suggestedClientId ? (suggestedClients.get(row.suggestedClientId) ?? null) : null,
  };
}

export const POST = withAuth(async (req, user: SessionUser, { params }) => {
  // RBAC: the inbox is the founder's mailbox — founder-only.
  requireFounder(user);
  const { id } = await params;
  const body = await parseBody(req, matchSchema);

  const message = await db.emailMessage.findUnique({ where: { id } });
  if (!message) throw new NotFoundError("Email not found.");

  const now = new Date();
  const subjectLabel = message.subject ?? "(no subject)";

  if (body.action === "CONFIRM") {
    // --- validations ---------------------------------------------------------
    const client = await db.client.findUnique({ where: { id: body.clientId }, select: { id: true } });
    if (!client) throw new BadRequestError("Client not found.");

    if (body.websiteId) {
      const website = await db.website.findUnique({
        where: { id: body.websiteId },
        select: { id: true, clientId: true },
      });
      // One message for both "missing" and "wrong client" (no existence oracle).
      if (!website || website.clientId !== body.clientId) {
        throw new BadRequestError("Website does not belong to this client.");
      }
    }

    // Optional explicit ticket link (cross-client associations are rejected).
    if (body.ticketId) {
      const ticket = await db.ticket.findUnique({
        where: { id: body.ticketId },
        select: { id: true, clientId: true },
      });
      if (!ticket) throw new BadRequestError("Ticket not found.");
      if (ticket.clientId !== body.clientId) {
        throw new BadRequestError(
          "This email is matched to a different client than the ticket. Review the match first."
        );
      }
    }

    // Optional inline ticket creation (source EMAIL, awaiting the client's reply).
    let createdTicketId: string | null = null;
    if (body.createTicket) {
      const subject = body.createTicket.subject ?? message.subject ?? `Email from ${message.fromEmail}`;
      const ticket = await createTicketWithNumber({
        subject,
        client: { connect: { id: body.clientId } },
        ...(body.websiteId ? { website: { connect: { id: body.websiteId } } } : {}),
        status: "NEW",
        priority: "NORMAL",
        source: "EMAIL",
        createdBy: { connect: { id: user.id } },
        awaitingReply: true,
        lastActivityAt: now,
      });
      createdTicketId = ticket.id;
      await db.ticketMessage.create({
        data: {
          ticketId: ticket.id,
          kind: "CUSTOMER_MESSAGE",
          authorType: "CUSTOMER",
          bodyText: message.bodyText ?? message.snippet ?? "(empty message)",
          emailMessageId: message.id,
          subject: message.subject,
          toEmails: message.toEmails,
        },
      });
    }

    // Absent ticket info preserves any existing link ("absent = unchanged",
    // same semantics as the other link fields); explicit null clears the link.
    const ticketId = body.ticketId !== undefined ? body.ticketId : (createdTicketId ?? message.ticketId);

    await db.emailMessage.update({
      where: { id },
      data: {
        matchStatus: "CONFIRMED",
        clientId: body.clientId,
        websiteId: body.websiteId ?? null,
        suggestedClientId: null,
        matchDecidedAt: now,
        matchDecidedById: user.id,
        ticketId: ticketId ?? null,
      },
    });

    // Persist the decision as a matching rule. Update never clears websiteId
    // when the key was omitted — absent means "keep the existing rule website".
    await db.emailMatchRule.upsert({
      where: { emailAddress: normalizeEmail(message.fromEmail) },
      create: {
        emailAddress: normalizeEmail(message.fromEmail),
        clientId: body.clientId,
        websiteId: body.websiteId ?? null,
        createdById: user.id,
      },
      update: {
        clientId: body.clientId,
        ...(body.websiteId !== undefined ? { websiteId: body.websiteId } : {}),
      },
    });

    await logActivity({
      action: "EMAIL_MATCH_CONFIRMED",
      kind: "AUDIT",
      entityType: "EMAIL",
      entityId: id,
      entityLabel: subjectLabel,
      summary: `Email match confirmed for ${message.fromEmail} — "${subjectLabel}".`,
      actor: user,
      clientId: body.clientId,
      websiteId: body.websiteId ?? null,
      metadata: {
        fromEmail: message.fromEmail,
        subject: message.subject,
        websiteId: body.websiteId ?? null,
        ticketId: ticketId ?? null,
        createdTicketId,
      },
    });

    return jsonOk(await toRecordWithRefs(id));
  }

  if (body.action === "UNRELATED") {
    // Terminal operator decision: NO_MATCH is never set automatically.
    // clientId/websiteId/ticketId are left untouched (audit history matters
    // more than a hard reset); only the suggestion is cleared.
    await db.emailMessage.update({
      where: { id },
      data: {
        matchStatus: "NO_MATCH",
        suggestedClientId: null,
        matchDecidedAt: now,
        matchDecidedById: user.id,
      },
    });

    await logActivity({
      action: "EMAIL_MARKED_UNRELATED",
      kind: "AUDIT",
      entityType: "EMAIL",
      entityId: id,
      entityLabel: subjectLabel,
      summary: `Email marked unrelated: ${message.fromEmail} — "${subjectLabel}".`,
      actor: user,
      clientId: message.clientId,
      metadata: { fromEmail: message.fromEmail, subject: message.subject },
    });

    return jsonOk(await toRecordWithRefs(id));
  }

  // --- LINK_TICKET -----------------------------------------------------------
  const ticket = await db.ticket.findUnique({
    where: { id: body.ticketId },
    select: { id: true, clientId: true, websiteId: true },
  });
  if (!ticket) throw new BadRequestError("Ticket not found.");

  // No cross-client association: an email matched to client A cannot be linked
  // to a ticket of client B — the operator must review the match first.
  if (message.clientId && message.clientId !== ticket.clientId) {
    throw new BadRequestError(
      "This email is matched to a different client than the ticket. Review the match first."
    );
  }

  await db.emailMessage.update({
    where: { id },
    data: {
      matchStatus: "CONFIRMED",
      clientId: ticket.clientId,
      websiteId: ticket.websiteId,
      ticketId: ticket.id,
      suggestedClientId: null,
      matchDecidedAt: now,
      matchDecidedById: user.id,
    },
  });

  await logActivity({
    action: "EMAIL_LINKED_TO_TICKET",
    kind: "AUDIT",
    entityType: "EMAIL",
    entityId: id,
    entityLabel: subjectLabel,
    summary: `Email linked to ticket from ${message.fromEmail} — "${subjectLabel}".`,
    actor: user,
    clientId: ticket.clientId,
    metadata: { fromEmail: message.fromEmail, subject: message.subject, ticketId: ticket.id },
  });

  return jsonOk(await toRecordWithRefs(id));
});
