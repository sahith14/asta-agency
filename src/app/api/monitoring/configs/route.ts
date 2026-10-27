/**
 * AgencyOS — Monitoring websites list API (Phase 4).
 * GET /api/monitoring/configs?q&page&pageSize&health&clientId&websiteId
 *   → Paginated<MonitorListRow>
 * LEFT-JOIN style: every non-archived website appears with its MonitorConfig
 * (or null) and a real count of open incidents covering it — honest about
 * websites WITHOUT monitoring.
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { BadRequestError, jsonOk, parseQuery, withAuth } from "@/lib/api";
import { requireModule } from "@/lib/rbac";
import { toMonitorConfigRecord } from "../record";
import { MONITOR_HEALTH_STATES, OPEN_INCIDENT_STATUSES, type MonitorListRow, type Paginated } from "@/lib/types";

export const GET = withAuth(async (req, user) => {
  // RBAC: monitoring read — founder/developer/support; managers/staff denied.
  requireModule(user, "monitoring");
  const query = parseQuery(req);
  const sp = new URL(req.url).searchParams;

  const where: Prisma.WebsiteWhereInput = { archivedAt: null };

  const search = query.search ?? (sp.get("q")?.trim() || undefined);
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { primaryDomain: { contains: search } },
      { client: { businessName: { contains: search } } },
    ];
  }
  if (query.clientId) where.clientId = query.clientId;
  if (query.websiteId) where.id = query.websiteId;

  const health = sp.get("health")?.trim() || undefined;
  if (health) {
    // AND-wrapped so the health filter never clobbers a search OR-filter.
    // (No other code path writes where.AND above — a fresh array is safe.)
    const andConditions: Prisma.WebsiteWhereInput[] = [];
    if (health === "DISABLED") {
      andConditions.push({ OR: [{ monitorConfig: null }, { monitorConfig: { enabled: false } }] });
    } else if ((MONITOR_HEALTH_STATES as readonly string[]).includes(health)) {
      andConditions.push({ monitorConfig: { enabled: true, currentHealth: health } });
    } else {
      throw new BadRequestError(
        `Invalid health "${health}". Allowed: ${[...MONITOR_HEALTH_STATES, "DISABLED"].join(", ")}.`
      );
    }
    where.AND = andConditions;
  }

  const [rows, total] = await Promise.all([
    db.website.findMany({
      where,
      select: {
        id: true,
        name: true,
        productionUrl: true,
        primaryDomain: true,
        lifecycleStatus: true,
        client: { select: { id: true, businessName: true } },
        monitorConfig: true,
      },
      orderBy: { name: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.website.count({ where }),
  ]);

  // Real open-incident counts for exactly the page's websites.
  const pageIds = rows.map((r) => r.id);
  const incidentCounts = pageIds.length
    ? await db.incidentWebsite.groupBy({
        by: ["websiteId"],
        where: {
          websiteId: { in: pageIds },
          recoveredAt: null,
          incident: { status: { in: [...OPEN_INCIDENT_STATUSES] } },
        },
        _count: { _all: true },
      })
    : [];
  const countByWebsite = new Map(incidentCounts.map((g) => [g.websiteId, g._count._all]));

  const items: MonitorListRow[] = rows.map((row) => ({
    website: {
      id: row.id,
      name: row.name,
      productionUrl: row.productionUrl,
      primaryDomain: row.primaryDomain,
      lifecycleStatus: row.lifecycleStatus,
      clientName: row.client?.businessName ?? null,
    },
    config: row.monitorConfig ? toMonitorConfigRecord(row.monitorConfig, row) : null,
    activeIncidentCount: countByWebsite.get(row.id) ?? 0,
  }));

  const data: Paginated<MonitorListRow> = {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
  };
  return jsonOk(data);
});
