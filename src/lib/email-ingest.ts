/**
 * AgencyOS — Inbound email ingest pipeline (Task 2-c).
 *
 * Called by the Gmail sync engine (Task 2-b) for every fetched message:
 *   ingestInboundMessage(account, parsed) → { emailMessageId, ticketId, isNew }
 *
 * Contract with the sync engine: the caller owns fetching/parsing and account
 * counters; this module owns de-duplication, threading, matching and any
 * ticket side-effects. Re-ingesting the same provider message is always safe:
 * the compound unique (emailAccountId, providerMessageId) is the duplicate
 * guard and a P2002 race resolves to isNew:false with the existing row.
 *
 * Message content is UNTRUSTED: it is stored verbatim (sanitised at render
 * time) and never parsed as commands. Activity records carry only fromEmail
 * and subject — never body content.
 */
import "server-only";
import { Prisma, type EmailAccount } from "@prisma/client";
import { db } from "@/lib/db";
import { matchInboundEmail } from "@/lib/matching";
import { logActivity } from "@/lib/activity";
import { isUniqueViolation } from "@/lib/ticket-num";
import type { EmailAttachmentMeta } from "@/lib/types";

export interface ParsedGmailMessage {
  providerMessageId: string;
  providerThreadId: string;
  subject: string | null;
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  ccEmails: string[];
  bodyText: string | null;
  bodyHtml: string | null;
  snippet: string | null;
  sentAt: Date | null;
  hasAttachments: boolean;
  attachments: EmailAttachmentMeta[];
  /** Gmail history cursor observed for this fetch; the sync engine owns the account cursor, so this is accepted but not persisted per message. */
  providerHistoryId?: string | null;
}

export interface IngestInboundResult {
  emailMessageId: string;
  ticketId: string | null;
  isNew: boolean;
}

function toJsonArray(values: string[] | null | undefined): string {
  return JSON.stringify(Array.isArray(values) ? values : []);
}

/** Finds a previous message row for the same provider message (duplicate guard). */
async function findExisting(emailAccountId: string, providerMessageId: string) {
  return db.emailMessage.findUnique({
    where: {
      emailAccountId_providerMessageId: { emailAccountId, providerMessageId },
    },
    select: { id: true, ticketId: true },
  });
}

export async function ingestInboundMessage(
  account: EmailAccount,
  parsed: ParsedGmailMessage
): Promise<IngestInboundResult> {
  // (i) De-duplicate first: retries and scheduler re-runs must be no-ops.
  const existing = await findExisting(account.id, parsed.providerMessageId);
  if (existing) {
    return { emailMessageId: existing.id, ticketId: existing.ticketId, isNew: false };
  }

  const now = new Date();
  const sentAt = parsed.sentAt ?? now;

  // (ii) Thread upsert keyed by (account, providerThreadId).
  let thread = await db.emailThread.findUnique({
    where: {
      emailAccountId_providerThreadId: {
        emailAccountId: account.id,
        providerThreadId: parsed.providerThreadId,
      },
    },
  });
  let threadCreated = false;
  if (!thread) {
    try {
      thread = await db.emailThread.create({
        data: {
          emailAccountId: account.id,
          providerThreadId: parsed.providerThreadId,
          subject: parsed.subject,
          snippet: parsed.snippet,
          lastMessageAt: sentAt,
        },
      });
      threadCreated = true;
    } catch (err) {
      // Concurrent sync created the same thread — fall through to the update path.
      if (!isUniqueViolation(err)) throw err;
      thread = await db.emailThread.findUnique({
        where: {
          emailAccountId_providerThreadId: {
            emailAccountId: account.id,
            providerThreadId: parsed.providerThreadId,
          },
        },
      });
    }
  }
  if (thread && !threadCreated) {
    // lastMessageAt only moves forward; subject/snippet keep their first non-null
    // value so later messages cannot downgrade thread context.
    const data: Prisma.EmailThreadUpdateInput = {};
    if (!thread.lastMessageAt || sentAt > thread.lastMessageAt) data.lastMessageAt = sentAt;
    if (!thread.subject && parsed.subject) data.subject = parsed.subject;
    if (!thread.snippet && parsed.snippet) data.snippet = parsed.snippet;
    if (Object.keys(data).length > 0) {
      thread = await db.emailThread.update({ where: { id: thread.id }, data });
    }
  }

  // (iii) Is this provider thread already linked to a support ticket?
  const linked = thread
    ? await db.emailMessage.findFirst({
        where: { threadId: thread.id, ticketId: { not: null } },
        select: { ticketId: true },
      })
    : null;
  const linkedTicketId = linked?.ticketId ?? null;

  // (iv) Match fields: thread-linked messages inherit the ticket's client
  // (matchDecidedAt stays null — the ticket link is the decision evidence);
  // otherwise run the deterministic matcher.
  let matchStatus: string;
  let clientId: string | null;
  let websiteId: string | null;
  let suggestedClientId: string | null;
  let ticketClientId: string | null = null;
  let ticketWebsiteId: string | null = null;
  let ticketStatus: string | null = null;
  let ticketNumber: number | null = null;

  if (linkedTicketId) {
    const ticket = await db.ticket.findUnique({
      where: { id: linkedTicketId },
      select: { clientId: true, websiteId: true, status: true, number: true },
    });
    ticketClientId = ticket?.clientId ?? null;
    ticketWebsiteId = ticket?.websiteId ?? null;
    ticketStatus = ticket?.status ?? null;
    ticketNumber = ticket?.number ?? null;
    matchStatus = "CONFIRMED";
    clientId = ticketClientId;
    websiteId = ticketWebsiteId;
    suggestedClientId = null;
  } else {
    const match = await matchInboundEmail({ fromEmail: parsed.fromEmail, fromName: parsed.fromName });
    matchStatus = match.matchStatus;
    clientId = match.clientId;
    websiteId = match.websiteId;
    suggestedClientId = match.suggestedClientId;
  }

  // (iv/v) Create the message row. A P2002 here means a concurrent ingest won
  // the race — resolve gracefully to the existing row (isNew:false).
  let created;
  try {
    created = await db.emailMessage.create({
      data: {
        emailAccountId: account.id,
        threadId: thread?.id ?? null,
        providerMessageId: parsed.providerMessageId,
        providerThreadId: parsed.providerThreadId,
        direction: "INBOUND",
        fromEmail: parsed.fromEmail,
        fromName: parsed.fromName,
        toEmails: toJsonArray(parsed.toEmails),
        ccEmails: toJsonArray(parsed.ccEmails),
        subject: parsed.subject,
        bodyText: parsed.bodyText,
        bodyHtml: parsed.bodyHtml,
        snippet: parsed.snippet,
        sentAt: parsed.sentAt,
        hasAttachments: parsed.hasAttachments,
        attachments: JSON.stringify(parsed.attachments ?? []),
        syncStatus: "SYNCED",
        matchStatus,
        suggestedClientId,
        clientId,
        websiteId,
        ticketId: linkedTicketId,
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      const raced = await findExisting(account.id, parsed.providerMessageId);
      if (raced) {
        return { emailMessageId: raced.id, ticketId: raced.ticketId, isNew: false };
      }
    }
    throw err;
  }

  if (linkedTicketId) {
    // (v) Append the inbound message to the ticket conversation and reopen a
    // resolved ticket. Other statuses are kept as-is; a customer message
    // always means the client is waiting for us again.
    const reopen = ticketStatus === "RESOLVED";
    await db.ticketMessage.create({
      data: {
        ticketId: linkedTicketId,
        kind: "CUSTOMER_MESSAGE",
        authorType: "CUSTOMER",
        bodyText: parsed.bodyText ?? parsed.snippet ?? "(empty message)",
        emailMessageId: created.id,
        subject: parsed.subject,
        toEmails: toJsonArray(parsed.toEmails),
      },
    });
    await db.ticket.update({
      where: { id: linkedTicketId },
      data: {
        ...(reopen ? { status: "OPEN" } : {}),
        awaitingReply: true,
        lastActivityAt: now,
      },
    });
    const numberLabel = ticketNumber !== null ? `TKT-${String(ticketNumber).padStart(4, "0")}` : linkedTicketId;
    await logActivity({
      action: "EMAIL_APPENDED_TO_TICKET",
      entityType: "TICKET",
      entityId: linkedTicketId,
      entityLabel: numberLabel,
      summary: `New email appended to ticket ${numberLabel}.`,
      clientId: ticketClientId,
      metadata: { fromEmail: parsed.fromEmail, subject: parsed.subject, reopened: reopen, emailMessageId: created.id },
    });
    return { emailMessageId: created.id, ticketId: linkedTicketId, isNew: true };
  }

  // (vi) Unlinked message: record receipt for the inbox/review queue.
  await logActivity({
    action: "EMAIL_RECEIVED",
    entityType: "EMAIL",
    entityId: created.id,
    entityLabel: parsed.subject,
    summary: `Email received from ${parsed.fromEmail}: ${parsed.subject ?? "(no subject)"}`,
    clientId: matchStatus === "CONFIRMED" ? clientId : null,
    metadata: { fromEmail: parsed.fromEmail, subject: parsed.subject, matchStatus },
  });

  return { emailMessageId: created.id, ticketId: null, isNew: true };
}
