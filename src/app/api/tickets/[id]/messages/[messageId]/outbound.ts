/**
 * AgencyOS — Outbound email copy (Task 2-c).
 * Colocated helper shared by the send and reconcile routes.
 *
 * After a reply is accepted by Gmail, the same message is stored as an
 * OUTBOUND EmailMessage so the Gmail thread view stays complete and delivery
 * status is accurate (we record "accepted by Gmail", never recipient-side
 * delivery). Creation is idempotent on (emailAccountId, providerMessageId):
 * a send that crashed after Gmail accepted the message but before the copy
 * was written is repaired by reconcile.
 */
import "server-only";
import type { EmailAccount, Ticket, TicketMessage } from "@prisma/client";
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/ticket-num";

/** Truncates a provider error to a safe, bounded message (never includes tokens). */
export function truncateError(message: string, max = 300): string {
  const clean = message.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export interface EnsureOutboundCopyInput {
  account: EmailAccount;
  ticket: Ticket;
  reply: TicketMessage;
  providerMessageId: string;
  providerThreadId: string | null;
  sentAt: Date;
}

/**
 * Ensures the OUTBOUND EmailMessage copy exists and the reply row points at it.
 * Returns the copy's id. Never throws on a duplicate race.
 */
export async function ensureOutboundEmailMessageCopy(input: EnsureOutboundCopyInput): Promise<string> {
  const { account, ticket, reply, providerMessageId, providerThreadId, sentAt } = input;

  // Idempotency: the copy is unique per (account, providerMessageId).
  const existing = await db.emailMessage.findUnique({
    where: { emailAccountId_providerMessageId: { emailAccountId: account.id, providerMessageId } },
    select: { id: true },
  });
  if (existing) {
    await linkReplyToEmailMessage(reply.id, existing.id);
    return existing.id;
  }

  // Thread continuity: attach the copy to the ticket's inbound Gmail thread
  // (the latest EmailMessage on this ticket that carries a thread), if any.
  const inbound = await db.emailMessage.findFirst({
    where: { ticketId: ticket.id, threadId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { id: true, threadId: true, providerThreadId: true },
  });
  const threadId = inbound?.threadId ?? null;

  try {
    const created = await db.emailMessage.create({
      data: {
        emailAccountId: account.id,
        threadId,
        providerMessageId,
        providerThreadId: providerThreadId ?? inbound?.providerThreadId ?? null,
        direction: "OUTBOUND",
        fromEmail: account.emailAddress,
        fromName: null,
        toEmails: reply.toEmails ?? "[]",
        ccEmails: reply.ccEmails,
        subject: reply.subject,
        bodyText: reply.bodyText,
        bodyHtml: null,
        snippet: null,
        sentAt,
        hasAttachments: false,
        attachments: "[]",
        syncStatus: "SYNCED",
        // The reply belongs to the ticket's client — no matching needed.
        matchStatus: "CONFIRMED",
        clientId: ticket.clientId,
        websiteId: ticket.websiteId,
        ticketId: ticket.id,
        deliveryStatus: "SENT_ACCEPTED",
      },
      select: { id: true },
    });
    if (threadId) {
      // Keep the thread's lastMessageAt moving forward with outbound traffic.
      const thread = await db.emailThread.findUnique({ where: { id: threadId }, select: { lastMessageAt: true } });
      if (!thread?.lastMessageAt || sentAt > thread.lastMessageAt) {
        await db.emailThread.update({ where: { id: threadId }, data: { lastMessageAt: sentAt } });
      }
    }
    await linkReplyToEmailMessage(reply.id, created.id);
    return created.id;
  } catch (err) {
    // Lost a create race (same provider message) — resolve to the winner.
    if (isUniqueViolation(err)) {
      const raced = await db.emailMessage.findUnique({
        where: { emailAccountId_providerMessageId: { emailAccountId: account.id, providerMessageId } },
        select: { id: true },
      });
      if (raced) {
        await linkReplyToEmailMessage(reply.id, raced.id);
        return raced.id;
      }
    }
    throw err;
  }
}

/** Links the reply to its outbound copy without clobbering an existing link. */
async function linkReplyToEmailMessage(replyId: string, emailMessageId: string): Promise<void> {
  const reply = await db.ticketMessage.findUnique({
    where: { id: replyId },
    select: { emailMessageId: true },
  });
  if (reply && !reply.emailMessageId) {
    await db.ticketMessage.update({ where: { id: replyId }, data: { emailMessageId } });
  }
}
