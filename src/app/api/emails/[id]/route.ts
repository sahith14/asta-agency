/**
 * AgencyOS — Email detail API (Task 2-c).
 * GET /api/emails/[id] → EmailMessageDetailRecord
 *
 * Adds bodies, the server-sanitised HTML subset (raw HTML is never rendered by
 * the client) and the provider thread context. A missing bodyText is filled
 * with a computed plain-text preview of the HTML — never persisted.
 */
import { db } from "@/lib/db";
import { NotFoundError, jsonOk, withAuth } from "@/lib/api";
import { requireFounder } from "@/lib/rbac";
import { emailInclude, toEmailMessageDetailRecord } from "../record";

export const GET = withAuth(async (req, user, { params }) => {
  // RBAC: the inbox is the founder's mailbox — founder-only.
  requireFounder(user);
  const { id } = await params;

  const row = await db.emailMessage.findUnique({ where: { id }, include: emailInclude });
  if (!row) throw new NotFoundError("Email not found.");

  const threadMessages = row.threadId
    ? await db.emailMessage.findMany({
        where: { threadId: row.threadId },
        select: {
          id: true,
          direction: true,
          fromEmail: true,
          fromName: true,
          subject: true,
          sentAt: true,
        },
        orderBy: { sentAt: "asc" },
      })
    : [];

  // threadMessages carry no body content — ids/refs only, dates to ISO strings.
  const threadContext = threadMessages.map((m) => ({
    id: m.id,
    direction: m.direction,
    fromEmail: m.fromEmail,
    fromName: m.fromName,
    subject: m.subject,
    sentAt: m.sentAt ? m.sentAt.toISOString() : null,
  }));

  return jsonOk(toEmailMessageDetailRecord(row, threadContext));
});
