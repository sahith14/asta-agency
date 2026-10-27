/**
 * AgencyOS — Emails API (Task 2-c).
 * GET /api/emails → Paginated<EmailMessageRecord> (+ suggestedClient ref)
 *
 * Filters: search (fromEmail/subject/snippet), matchStatus (single or CSV,
 * enum-validated), direction, clientId, ticketId ("none" → unlinked only),
 * review=1 (SUGGESTED + NEEDS_REVIEW queue), page/pageSize, sort, dir.
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { BadRequestError, jsonOk, parseQuery, withAuth } from "@/lib/api";
import { requireFounder } from "@/lib/rbac";
import {
  EMAIL_DIRECTIONS,
  EMAIL_MATCH_STATUSES,
  EMAIL_REVIEW_STATUSES,
  type Paginated,
} from "@/lib/types";
import {
  emailInclude,
  loadSuggestedClientMap,
  toEmailMessageRecord,
  type EmailMessageRecordWithSuggestion,
} from "./record";

/** CSV/list query param, strictly validated against an enum — unknown token → 400. */
function parseEnumListParam(raw: string | null, allowed: readonly string[], label: string): string[] | null {
  if (!raw) return null;
  const tokens = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (tokens.length === 0) return null;
  for (const token of tokens) {
    if (!allowed.includes(token)) {
      throw new BadRequestError(`Invalid ${label} "${token}". Allowed: ${allowed.join(", ")}.`);
    }
  }
  return tokens;
}

const EMAIL_SORT_FIELDS = ["sentAt", "createdAt"] as const;
type EmailSortField = (typeof EMAIL_SORT_FIELDS)[number];

export const GET = withAuth(async (req, user) => {
  // RBAC: the inbox is the founder's mailbox — founder-only.
  requireFounder(user);
  const query = parseQuery(req);
  const sp = new URL(req.url).searchParams;

  const where: Prisma.EmailMessageWhereInput = {};

  if (query.search) {
    where.OR = [
      { fromEmail: { contains: query.search } },
      { subject: { contains: query.search } },
      { snippet: { contains: query.search } },
    ];
  }

  // review=1 is the review-queue shortcut and wins over an explicit matchStatus filter.
  const review = sp.get("review");
  if (review === "1") {
    where.matchStatus = { in: [...EMAIL_REVIEW_STATUSES] };
  } else {
    const matchStatuses = parseEnumListParam(sp.get("matchStatus"), EMAIL_MATCH_STATUSES, "match status");
    if (matchStatuses) where.matchStatus = { in: matchStatuses };
  }

  const direction = sp.get("direction");
  if (direction) {
    if (!(EMAIL_DIRECTIONS as readonly string[]).includes(direction)) {
      throw new BadRequestError(`Invalid direction "${direction}". Allowed: ${EMAIL_DIRECTIONS.join(", ")}.`);
    }
    where.direction = direction;
  }

  const clientId = sp.get("clientId");
  if (clientId) where.clientId = clientId;

  // ticketId=none → only messages not associated with a ticket.
  const ticketId = sp.get("ticketId");
  if (ticketId === "none") where.ticketId = null;
  else if (ticketId) where.ticketId = ticketId;

  // Sort whitelist; default sentAt descending (newest mail first).
  const sortRaw = sp.get("sort");
  const sortField: EmailSortField = (EMAIL_SORT_FIELDS as readonly string[]).includes(sortRaw ?? "")
    ? (sortRaw as EmailSortField)
    : "sentAt";
  const dir = sortRaw ? (query.dir === "desc" ? "desc" : "asc") : "desc";

  const [rows, total] = await Promise.all([
    db.emailMessage.findMany({
      where,
      include: emailInclude,
      orderBy: [{ [sortField]: dir }, { createdAt: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.emailMessage.count({ where }),
  ]);

  // Resolve suggestedClient refs for the page (bare column, no Prisma relation).
  const suggestedClients = await loadSuggestedClientMap(
    rows.map((r) => r.suggestedClientId).filter((v): v is string => !!v)
  );

  const items: EmailMessageRecordWithSuggestion[] = rows.map((row) => ({
    ...toEmailMessageRecord(row),
    suggestedClient: row.suggestedClientId ? (suggestedClients.get(row.suggestedClientId) ?? null) : null,
  }));

  // EmailMessageRecordWithSuggestion extends EmailMessageRecord, so this
  // satisfies the Paginated<EmailMessageRecord> contract plus the extra ref.
  const data: Paginated<EmailMessageRecordWithSuggestion> = {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
  };
  return jsonOk(data);
});
