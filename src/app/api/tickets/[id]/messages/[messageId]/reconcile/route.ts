/**
 * AgencyOS — Reconcile uncertain reply delivery (Task 2-c).
 * POST /api/tickets/[id]/messages/[messageId]/reconcile
 *
 * An UNCERTAIN send means we never got a response from Gmail — the message may
 * or may not exist there. Reconcile asks Gmail directly using our RFC-5322
 * Message-ID key via `rfc822msgid:` search:
 *  - found   → SENT_ACCEPTED (providerMessageId from Gmail), ticket
 *              first-response/awaiting state updated, outbound copy ensured
 *              (idempotent — repairs a send that crashed before the copy);
 *  - missing → stays UNCERTAIN, nothing fabricated, operator can then use
 *              PATCH { deliveryStatus: "FAILED" } as the acknowledged-risk action.
 */
import { db } from "@/lib/db";
import { BadRequestError, NotFoundError, jsonError, jsonOk, withAuth } from "@/lib/api";
import { assertTicketAccess } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import type { SessionUser } from "@/lib/auth";
import { GMAIL_API_BASE, gmailFetch, getAccessToken } from "@/lib/gmail/client";
import { ticketMessageInclude, toTicketMessageRecord } from "../../../../record";
import { ensureOutboundEmailMessageCopy, truncateError } from "../outbound";

interface GmailMessageRef {
  id?: string;
  threadId?: string;
}

interface GmailSearchBody {
  messages?: GmailMessageRef[];
}

function ticketNumberLabel(number: number): string {
  return `TKT-${String(number).padStart(4, "0")}`;
}

export const POST = withAuth(async (req, user: SessionUser, { params }) => {
  // Request body ignored — reconcile works purely on stored state.
  const { id, messageId } = await params;

  const ticket = await db.ticket.findUnique({ where: { id } });
  if (!ticket) throw new NotFoundError("Ticket not found.");
  // RBAC: reconcile follows ticket read — founder/support; developers assigned/created.
  await assertTicketAccess(user, id, false);

  const reply = await db.ticketMessage.findUnique({ where: { id: messageId } });
  if (!reply || reply.ticketId !== id) throw new NotFoundError("Message not found.");

  const label = ticketNumberLabel(ticket.number);

  if (reply.kind !== "REPLY") throw new BadRequestError("Reconcile applies only to replies.");
  if (reply.deliveryStatus !== "UNCERTAIN") {
    throw new BadRequestError("Reconcile applies only to uncertain deliveries.");
  }
  if (!reply.providerMessageIdKey) {
    throw new BadRequestError("This message has no reconciliation key.");
  }

  const account = await db.emailAccount.findFirst({ where: { status: "CONNECTED" } });
  if (!account) {
    return jsonError(
      "GMAIL_NOT_CONFIGURED",
      "Gmail is not connected. Connect the mailbox in Settings → Integrations to reconcile deliveries.",
      400
    );
  }

  // --- token ------------------------------------------------------------------
  const auth = await getAccessToken(account);
  if ("error" in auth) {
    // Reconcile is read-only with respect to delivery state — report and stop.
    return jsonError("GMAIL_ERROR", truncateError(auth.error), 502);
  }

  // --- search Gmail by our Message-ID key --------------------------------------
  const q = `rfc822msgid:${reply.providerMessageIdKey}@agencyos.local`;
  // gmailFetch resolves (never throws) with bounded retries; status 0 = no response.
  const search = await gmailFetch(
    `${GMAIL_API_BASE}/users/me/messages?q=${encodeURIComponent(q)}&maxResults=5`,
    auth.token,
    { method: "GET" }
  );

  if (!search.ok) {
    const detail = search.error ?? `Gmail search failed (status ${search.status}).`;
    return jsonError("GMAIL_ERROR", truncateError(detail), 502);
  }

  const body = (search.json ?? {}) as GmailSearchBody;
  const found = Array.isArray(body.messages) && body.messages.length > 0 ? body.messages[0] : null;

  if (!found || typeof found.id !== "string") {
    // Not found: leave UNCERTAIN. Never fabricate success — the operator keeps
    // the explicit "mark as failed (after checking Gmail)" decision.
    await logActivity({
      action: "TICKET_REPLY_RECONCILE_NOT_FOUND",
      kind: "AUDIT",
      entityType: "TICKET",
      entityId: id,
      entityLabel: ticket.subject,
      summary: `Reconcile found no Gmail record for the uncertain reply on ticket ${label}.`,
      actor: user,
      clientId: ticket.clientId,
      metadata: { ticketMessageId: messageId },
    });
    const row = await db.ticketMessage.findUnique({ where: { id: messageId }, include: ticketMessageInclude });
    if (!row) throw new NotFoundError("Message not found.");
    return jsonOk({ reconciled: false, providerMessageId: null, message: toTicketMessageRecord(row) });
  }

  // --- confirmed sent -----------------------------------------------------------
  const sentAt = reply.sentAt ?? new Date();
  await db.ticketMessage.update({
    where: { id: messageId },
    data: {
      deliveryStatus: "SENT_ACCEPTED",
      providerMessageId: found.id,
      sentAt,
      deliveryError: null,
    },
  });

  await db.ticket.update({
    where: { id },
    data: {
      ...(ticket.firstResponseAt ? {} : { firstResponseAt: sentAt }),
      awaitingReply: false,
      lastActivityAt: new Date(),
    },
  });

  // Repair path: the send may have crashed after Gmail accepted but before the
  // outbound copy was written — ensureOutboundEmailMessageCopy is idempotent.
  await ensureOutboundEmailMessageCopy({
    account,
    ticket,
    reply,
    providerMessageId: found.id,
    providerThreadId: typeof found.threadId === "string" ? found.threadId : null,
    sentAt,
  });

  await logActivity({
    action: "TICKET_REPLY_CONFIRMED",
    kind: "AUDIT",
    entityType: "TICKET",
    entityId: id,
    entityLabel: ticket.subject,
    summary: `Uncertain reply confirmed as sent via Gmail for ticket ${label}.`,
    actor: user,
    clientId: ticket.clientId,
    metadata: { ticketMessageId: messageId, providerMessageId: found.id },
  });

  const updated = await db.ticketMessage.findUnique({ where: { id: messageId }, include: ticketMessageInclude });
  if (!updated) throw new NotFoundError("Message not found.");
  return jsonOk({ reconciled: true, providerMessageId: found.id, message: toTicketMessageRecord(updated) });
});
