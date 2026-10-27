/**
 * AgencyOS — Health check history API (Phase 4).
 * GET /api/monitoring/checks?websiteId&result(success|failure)&page&pageSize
 *   → Paginated<HealthCheckRecord> (checkedAt desc, website + client attached)
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { BadRequestError, jsonOk, parseQuery, withAuth } from "@/lib/api";
import { requireModule } from "@/lib/rbac";
import { toHealthCheckRecord } from "../record";
import type { Paginated } from "@/lib/types";

export const GET = withAuth(async (req, user) => {
  // RBAC: monitoring read — founder/developer/support; managers/staff denied.
  requireModule(user, "monitoring");
  const query = parseQuery(req);
  const sp = new URL(req.url).searchParams;

  const where: Prisma.HealthCheckWhereInput = {};

  const websiteId = sp.get("websiteId")?.trim() || undefined;
  if (websiteId) where.websiteId = websiteId;

  const result = sp.get("result")?.trim() || undefined;
  if (result) {
    if (result === "success") where.success = true;
    else if (result === "failure") where.success = false;
    else throw new BadRequestError(`Invalid result "${result}". Allowed: success, failure.`);
  }

  const [rows, total] = await Promise.all([
    db.healthCheck.findMany({
      where,
      include: { website: { select: { id: true, name: true, client: { select: { businessName: true } } } } },
      orderBy: { checkedAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.healthCheck.count({ where }),
  ]);

  const data: Paginated<ReturnType<typeof toHealthCheckRecord>> = {
    items: rows.map((row) => toHealthCheckRecord(row)),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
  };
  return jsonOk(data);
});
