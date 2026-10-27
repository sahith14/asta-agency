/**
 * AgencyOS — Background job run history API (Phase 4).
 * GET /api/jobs?jobKey&status&page&pageSize → Paginated<BackgroundJobRunRecord>
 * Results JSON is parsed before returning (null when absent/unparseable) so
 * the UI never stringifies by hand.
 */
import { Prisma } from "@prisma/client";
import type { BackgroundJobRun } from "@prisma/client";
import { db } from "@/lib/db";
import { BadRequestError, jsonOk, parseQuery, withAuth } from "@/lib/api";
import { requireFounder } from "@/lib/rbac";
import { BACKGROUND_JOB_KEYS, JOB_RUN_STATUSES, type BackgroundJobRunRecord, type Paginated } from "@/lib/types";

function parseResults(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function toJobRunRecord(row: BackgroundJobRun): BackgroundJobRunRecord {
  return {
    id: row.id,
    jobKey: row.jobKey,
    trigger: row.trigger,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
    attempts: row.attempts,
    lastError: row.lastError,
    results: parseResults(row.results),
  };
}

export const GET = withAuth(async (req, user) => {
  // RBAC: background job runs are founder operations — founder-only.
  requireFounder(user);
  const query = parseQuery(req);
  const sp = new URL(req.url).searchParams;

  const where: Prisma.BackgroundJobRunWhereInput = {};

  const jobKey = sp.get("jobKey")?.trim() || undefined;
  if (jobKey) {
    if (!(BACKGROUND_JOB_KEYS as readonly string[]).includes(jobKey)) {
      throw new BadRequestError(`Invalid jobKey "${jobKey}". Allowed: ${BACKGROUND_JOB_KEYS.join(", ")}.`);
    }
    where.jobKey = jobKey;
  }

  const status = sp.get("status")?.trim() || undefined;
  if (status) {
    if (!(JOB_RUN_STATUSES as readonly string[]).includes(status)) {
      throw new BadRequestError(`Invalid status "${status}". Allowed: ${JOB_RUN_STATUSES.join(", ")}.`);
    }
    where.status = status;
  }

  const [rows, total] = await Promise.all([
    db.backgroundJobRun.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.backgroundJobRun.count({ where }),
  ]);

  const data: Paginated<BackgroundJobRunRecord> = {
    items: rows.map((row) => toJobRunRecord(row)),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
  };
  return jsonOk(data);
});
