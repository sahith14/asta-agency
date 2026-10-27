/**
 * AgencyOS — Gmail sync run history (Task 2-b).
 * GET /api/gmail/sync/runs?page&pageSize → Paginated<GmailSyncRunRecord>
 * for the connected mailbox (most recent first). Empty page when no account.
 */
import { db } from "@/lib/db";
import { jsonOk, withAuth } from "@/lib/api";
import { requireFounder } from "@/lib/rbac";
import type { GmailSyncRunRecord, Paginated } from "@/lib/types";

function toRunRecord(row: {
  id: string;
  kind: string;
  trigger: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  messagesFetched: number;
  messagesNew: number;
  messagesSkipped: number;
  error: string | null;
}): GmailSyncRunRecord {
  return {
    id: row.id,
    kind: row.kind,
    trigger: row.trigger,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    messagesFetched: row.messagesFetched,
    messagesNew: row.messagesNew,
    messagesSkipped: row.messagesSkipped,
    error: row.error,
  };
}

export const GET = withAuth(async (req, user) => {
  // RBAC: the founder's mailbox sync history — founder-only.
  requireFounder(user);
  const q = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(q.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(q.get("pageSize") ?? "10", 10) || 10));

  const account = await db.emailAccount.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!account) {
    const empty: Paginated<GmailSyncRunRecord> = {
      items: [],
      total: 0,
      page,
      pageSize,
      pageCount: 0,
    };
    return jsonOk(empty);
  }

  const [rows, total] = await Promise.all([
    db.emailSyncRun.findMany({
      where: { emailAccountId: account.id },
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.emailSyncRun.count({ where: { emailAccountId: account.id } }),
  ]);

  const payload: Paginated<GmailSyncRunRecord> = {
    items: rows.map(toRunRecord),
    total,
    page,
    pageSize,
    pageCount: Math.ceil(total / pageSize),
  };
  return jsonOk(payload);
});
