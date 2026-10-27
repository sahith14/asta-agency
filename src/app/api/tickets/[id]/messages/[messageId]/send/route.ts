/**
 * AgencyOS — Send ticket reply via Gmail (Task 2-c).
 * POST /api/tickets/[id]/messages/[messageId]/send
 *
 * State machine: DRAFT|FAILED --send--> PENDING_SEND --> SENT_ACCEPTED | FAILED
 * (clean provider rejection) | UNCERTAIN (timeout / dropped connection; the
 * outcome at Gmail is unknown). UNCERTAIN blocks retry until reconcile runs.
 * The HTTP status is always 200 for end-paths — the delivery outcome is data,
 * not transport.
 *
 * LEAK GUARD: the MIME body is built ONLY from this REPLY row's bodyText,
 * subject, toEmails and ccEmails. Internal notes are structurally excluded:
 * this handler reads exactly one TicketMessage row (addressed by [messageId])
 * and performs no join/selection of other TicketMessage rows anywhere in the
 * send path, so note content cannot enter an outgoing payload.
 *
 * Threading: we do not store the original RFC Message-IDs of inbound mail, so
 * In-Reply-To/References are not emitted; Gmail-side threading is preserved by
 * passing the provider threadId of the ticket's inbound message to
 * messages.send.
 */
import { db } from "@/lib/db";
import { BadRequestError, NotFoundError, jsonError, jsonOk, withAuth } from "@/lib/api";
import { requireRoles } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { rateLimit } from "@/lib/rate-limit";
import type { SessionUser } from "@/lib/auth";
import { GMAIL_API_BASE, gmailFetch, getAccessToken } from "@/lib/gmail/client";
import { ticketMessageInclude, toTicketMessageRecord } from "../../../../record";
import { ensureOutboundEmailMessageCopy, truncateError } from "../outbound";

// The request body is intentionally ignored — all send inputs come from the
// stored REPLY row (route-level leak guard: no client-supplied content here).

const SEND_RATE_LIMIT = 10; // sends per minute per user
const SEND_RATE_WINDOW_MS = 60_000;

function ticketNumberLabel(number: number): string {
  return `TKT-${String(number).padStart(4, "0")}`;
}

/** Header values must never contain CRLF (header injection). */
function headerSafe(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/** RFC 2047 B-encoding for non-ASCII subjects; ASCII passes through. */
function encodeSubjectHeader(subject: string): string {
  const safe = headerSafe(subject);
   
  if (/^[\x20-\x7E]*$/.test(safe)) return safe;
  return `=?UTF-8?B?${Buffer.from(safe, "utf8").toString("base64")}?=`;
}

/** RFC 2045 base64 with 76-char lines. */
function wrapBase64(base64: string): string {
  return base64.replace(/(.{76})/g, "$1\r\n").trim();
}

function buildMime(input: {
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  messageIdKey: string;
}): string {
  const { to, cc, subject, body, messageIdKey } = input;
  const lines: string[] = [];
  lines.push(`To: ${to.map(headerSafe).join(", ")}`);
  if (cc.length > 0) lines.push(`Cc: ${cc.map(headerSafe).join(", ")}`);
  lines.push(`Subject: ${encodeSubjectHeader(subject)}`);
  // Message-ID doubles as the idempotency/reconciliation key (rfc822msgid:).
  lines.push(`Message-ID: <${messageIdKey}@agencyos.local>`);
  lines.push(`Date: ${new Date().toUTCString()}`);
  lines.push("MIME-Version: 1.0");
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push("Content-Transfer-Encoding: base64");
  const mime = lines.join("\r\n") + "\r\n\r\n" + wrapBase64(Buffer.from(body, "utf8").toString("base64"));
  return mime;
}

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const POST = withAuth(async (req, user: SessionUser, { params }) => {
  // RBAC: sending a client-facing email is support + founder.
  requireRoles(user, ["SUPPORT_FINANCE"]);
  // Request body intentionally ignored — see LEAK GUARD above.
  const { id, messageId } = await params;

  const limit = rateLimit(`gmail-send:${user.id}`, SEND_RATE_LIMIT, SEND_RATE_WINDOW_MS);
  if (!limit.ok) {
    return jsonError(
      "RATE_LIMITED",
      `Too many send attempts. Try again in ${limit.retryAfterSeconds}s.`,
      429
    );
  }

  const ticket = await db.ticket.findUnique({ where: { id } });
  if (!ticket) throw new NotFoundError("Ticket not found.");

  const reply = await db.ticketMessage.findUnique({ where: { id: messageId } });
  if (!reply || reply.ticketId !== id) throw new NotFoundError("Message not found.");

  const label = ticketNumberLabel(ticket.number);

  // --- guards -----------------------------------------------------------------
  if (reply.kind !== "REPLY") throw new BadRequestError("Only replies can be sent.");
  if (reply.deliveryStatus === "SENT_ACCEPTED") throw new BadRequestError("Already sent.");
  if (reply.deliveryStatus === "UNCERTAIN") {
    throw new BadRequestError("Delivery outcome is uncertain. Use reconcile first.");
  }
  if (reply.deliveryStatus === "PENDING_SEND") throw new BadRequestError("Send already in progress.");

  const account = await db.emailAccount.findFirst({ where: { status: "CONNECTED" } });
  if (!account) {
    // 400 (not 403): drafts remain saveable — only sending is unavailable.
    return jsonError(
      "GMAIL_NOT_CONFIGURED",
      "Gmail is not connected. Connect the mailbox in Settings → Integrations to send replies.",
      400
    );
  }

  const recipients = JSON.parse(reply.toEmails ?? "[]") as unknown;
  const ccRecipients = JSON.parse(reply.ccEmails ?? "[]") as unknown;
  const to = Array.isArray(recipients) ? recipients.filter((v): v is string => typeof v === "string") : [];
  const cc = Array.isArray(ccRecipients) ? ccRecipients.filter((v): v is string => typeof v === "string") : [];
  if (to.length === 0) throw new BadRequestError("This draft has no recipients. Add at least one recipient first.");

  const subject = reply.subject ?? ticket.subject;
  const body = reply.bodyText;
  const messageIdKey = reply.providerMessageIdKey ?? `${Date.now()}-${messageId}`;

  // Crash-safe marker: persist PENDING_SEND before touching the network.
  await db.ticketMessage.update({
    where: { id: messageId },
    data: { deliveryStatus: "PENDING_SEND", deliveryError: null },
  });

  const reloadRecord = async () => {
    const row = await db.ticketMessage.findUnique({
      where: { id: messageId },
      include: ticketMessageInclude,
    });
    if (!row) throw new NotFoundError("Message not found.");
    return toTicketMessageRecord(row);
  };

  // --- token ------------------------------------------------------------------
  let token: string;
  try {
    const auth = await getAccessToken(account);
    if ("error" in auth) {
      await db.ticketMessage.update({
        where: { id: messageId },
        data: { deliveryStatus: "FAILED", deliveryError: truncateError(auth.error) },
      });
      await logActivity({
        action: "TICKET_REPLY_FAILED",
        kind: "AUDIT",
        entityType: "TICKET",
        entityId: id,
        entityLabel: ticket.subject,
        summary: `Reply send failed for ticket ${label}: token error.`,
        actor: user,
        clientId: ticket.clientId,
        metadata: { ticketMessageId: messageId, error: truncateError(auth.error) },
      });
      return jsonOk(await reloadRecord());
    }
    token = auth.token;
  } catch (err) {
    // No request reached Gmail, so delivery definitely did not happen → FAILED.
    const messageText = truncateError(err instanceof Error ? err.message : "Token acquisition failed.");
    await db.ticketMessage.update({
      where: { id: messageId },
      data: { deliveryStatus: "FAILED", deliveryError: messageText },
    });
    await logActivity({
      action: "TICKET_REPLY_FAILED",
      kind: "AUDIT",
      entityType: "TICKET",
      entityId: id,
      entityLabel: ticket.subject,
      summary: `Reply send failed for ticket ${label}: token error.`,
      actor: user,
      clientId: ticket.clientId,
      metadata: { ticketMessageId: messageId, error: messageText },
    });
    return jsonOk(await reloadRecord());
  }

  // --- provider thread (Gmail-side continuity) ---------------------------------
  const inbound = await db.emailMessage.findFirst({
    where: { ticketId: id, threadId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { providerThreadId: true },
  });
  const providerThreadId = inbound?.providerThreadId ?? null;

  // --- send -------------------------------------------------------------------
  // Built exclusively from this REPLY row — see LEAK GUARD above.
  const mime = buildMime({ to, cc, subject, body, messageIdKey });
  const url = `${GMAIL_API_BASE}/users/me/messages/send`;
  const payload = JSON.stringify({ raw: toBase64Url(mime), ...(providerThreadId ? { threadId: providerThreadId } : {}) });

  // gmailFetch resolves (never throws) after bounded retries; status 0 means
  // NO response ever arrived from Gmail (network drop / timeout / abort).
  const res = await gmailFetch(url, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
  });

  if (!res.ok && res.status === 0) {
    // UNCERTAIN: Gmail may or may not have accepted the message — the outcome
    // is genuinely unknown, so we must not claim success or failure.
    await db.ticketMessage.update({
      where: { id: messageId },
      data: {
        deliveryStatus: "UNCERTAIN",
        deliveryError: "Send request timed out or connection dropped before Gmail confirmed the outcome.",
      },
    });
    await logActivity({
      action: "TICKET_REPLY_UNCERTAIN",
      kind: "AUDIT",
      entityType: "TICKET",
      entityId: id,
      entityLabel: ticket.subject,
      summary: `Reply delivery uncertain for ticket ${label} (connection dropped before confirmation).`,
      actor: user,
      clientId: ticket.clientId,
      metadata: { ticketMessageId: messageId },
    });
    return jsonOk(await reloadRecord());
  }

  if (!res.ok) {
    // Clean provider rejection: gmailFetch's error field is credential-free.
    const errorText = truncateError(res.error ?? `Gmail API error ${res.status}.`);
    await db.ticketMessage.update({
      where: { id: messageId },
      data: { deliveryStatus: "FAILED", deliveryError: errorText },
    });
    await logActivity({
      action: "TICKET_REPLY_FAILED",
      kind: "AUDIT",
      entityType: "TICKET",
      entityId: id,
      entityLabel: ticket.subject,
      summary: `Reply send failed for ticket ${label}.`,
      actor: user,
      clientId: ticket.clientId,
      metadata: { ticketMessageId: messageId, error: errorText },
    });
    return jsonOk(await reloadRecord());
  }

  // --- accepted ----------------------------------------------------------------
  const sentJson = (res.json ?? {}) as { id?: string };
  const providerMessageId = typeof sentJson.id === "string" ? sentJson.id : messageIdKey;
  const sentAt = new Date();

  await db.ticketMessage.update({
    where: { id: messageId },
    data: {
      deliveryStatus: "SENT_ACCEPTED",
      providerMessageId,
      sentAt,
      deliveryError: null,
    },
  });

  // Reply acceptance clears the awaiting state and starts the first-response
  // clock. Sending NEVER resolves or closes the ticket.
  await db.ticket.update({
    where: { id },
    data: {
      ...(ticket.firstResponseAt ? {} : { firstResponseAt: sentAt }),
      awaitingReply: false,
      lastActivityAt: sentAt,
    },
  });

  await ensureOutboundEmailMessageCopy({
    account,
    ticket,
    reply,
    providerMessageId,
    providerThreadId,
    sentAt,
  });

  await logActivity({
    action: "TICKET_REPLY_SENT",
    kind: "AUDIT",
    entityType: "TICKET",
    entityId: id,
    entityLabel: ticket.subject,
    summary: `Reply sent via Gmail for ticket ${label}.`,
    actor: user,
    clientId: ticket.clientId,
    metadata: { ticketMessageId: messageId, providerMessageId, subject, to },
  });

  return jsonOk(await reloadRecord());
});
