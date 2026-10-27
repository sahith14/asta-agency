/**
 * AgencyOS — Monitoring overview API (Phase 4).
 * GET /api/monitoring/summary → MonitoringSummaryData
 * Every figure is computed from real DB state; "not checked" stays UNKNOWN
 * and RDAP/manual renewal sources are labelled honestly.
 */
import { db } from "@/lib/db";
import { jsonOk, withAuth } from "@/lib/api";
import { requireModule } from "@/lib/rbac";
import { isSchedulerRunning } from "@/lib/monitoring/scheduler";
import { OPEN_INCIDENT_STATUSES, type MonitoringSummaryData } from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

export const GET = withAuth(async (_req, user) => {
  // RBAC: monitoring read — founder/developer/support; managers/staff denied.
  requireModule(user, "monitoring");
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const in30 = new Date(now.getTime() + 30 * DAY_MS);

  const [healthGroups, websiteCount, enabledCount, activeIncidents, severityGroups, checksToday, failuresToday, domainRows, lastHealthRun, lastDomainRun] =
    await Promise.all([
      db.monitorConfig.groupBy({ by: ["currentHealth"], where: { enabled: true }, _count: { _all: true } }),
      db.website.count({ where: { archivedAt: null } }),
      db.monitorConfig.count({ where: { enabled: true } }),
      db.incident.count({ where: { status: { in: [...OPEN_INCIDENT_STATUSES] } } }),
      db.incident.groupBy({ by: ["severity"], where: { status: { in: [...OPEN_INCIDENT_STATUSES] } }, _count: { _all: true } }),
      db.healthCheck.count({ where: { checkedAt: { gte: startOfToday } } }),
      db.healthCheck.count({ where: { checkedAt: { gte: startOfToday }, success: false } }),
      db.domain.findMany({
        where: { OR: [{ renewalDate: { not: null } }, { rdapExpiryDate: { not: null } }, { certNotAfter: { not: null } }] },
        include: { website: { select: { id: true, name: true } } },
      }),
      db.backgroundJobRun.findFirst({
        where: { jobKey: "WEBSITE_HEALTH_CHECKS", finishedAt: { not: null } },
        orderBy: { finishedAt: "desc" },
        select: { finishedAt: true },
      }),
      db.backgroundJobRun.findFirst({
        where: { jobKey: "DOMAIN_SSL_CHECKS", finishedAt: { not: null } },
        orderBy: { finishedAt: "desc" },
        select: { finishedAt: true },
      }),
    ]);

  const byHealth = new Map(healthGroups.map((g) => [g.currentHealth, g._count._all]));
  const countHealth = (state: string) => byHealth.get(state) ?? 0;

  const bySeverity = new Map(severityGroups.map((g) => [g.severity, g._count._all]));

  // Domains expiring soon — the effective renewal date is the RDAP observation
  // when the registry publishes one, otherwise the manually maintained date.
  const daysUntil = (date: Date) => Math.ceil((date.getTime() - now.getTime()) / DAY_MS);

  const domainsExpiringSoon = domainRows
    .map((d) => {
      const effective = d.rdapExpiryDate ?? d.renewalDate;
      return {
        id: d.id,
        domainName: d.domainName,
        websiteId: d.website.id,
        websiteName: d.website.name,
        renewalDate: d.renewalDate ? d.renewalDate.toISOString() : null,
        renewalSource: (d.rdapExpiryDate ? "RDAP" : "MANUAL") as "RDAP" | "MANUAL",
        rdapExpiryDate: d.rdapExpiryDate ? d.rdapExpiryDate.toISOString() : null,
        certNotAfter: d.certNotAfter ? d.certNotAfter.toISOString() : null,
        daysUntilRenewal: effective ? daysUntil(effective) : null,
        _certDays: d.certNotAfter ? daysUntil(d.certNotAfter) : null,
      };
    })
    .filter((d) => d.daysUntilRenewal !== null && d.daysUntilRenewal <= 30)
    .sort((a, b) => (a.daysUntilRenewal ?? Infinity) - (b.daysUntilRenewal ?? Infinity))
    .slice(0, 10)
    .map((d) => ({
      id: d.id,
      domainName: d.domainName,
      websiteId: d.websiteId,
      websiteName: d.websiteName,
      renewalDate: d.renewalDate,
      renewalSource: d.renewalSource,
      rdapExpiryDate: d.rdapExpiryDate,
      certNotAfter: d.certNotAfter,
      daysUntilRenewal: d.daysUntilRenewal as number,
    }));

  const certsExpiringSoon = domainRows
    .filter((d) => d.certNotAfter && d.certNotAfter.getTime() <= in30.getTime())
    .map((d) => ({
      id: d.id,
      domainName: d.domainName,
      websiteId: d.website.id,
      websiteName: d.website.name,
      certNotAfter: d.certNotAfter as Date,
      daysUntilExpiry: daysUntil(d.certNotAfter as Date),
    }))
    .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry)
    .slice(0, 10)
    .map((d) => ({
      id: d.id,
      domainName: d.domainName,
      websiteId: d.websiteId,
      websiteName: d.websiteName,
      certNotAfter: d.certNotAfter.toISOString(),
      daysUntilExpiry: d.daysUntilExpiry,
    }));

  const data: MonitoringSummaryData = {
    websitesMonitored: countHealth("HEALTHY") + countHealth("DEGRADED") + countHealth("DOWN") + countHealth("UNKNOWN"),
    healthy: countHealth("HEALTHY"),
    degraded: countHealth("DEGRADED"),
    down: countHealth("DOWN"),
    unknown: countHealth("UNKNOWN"),
    disabled: websiteCount - enabledCount,
    activeIncidents,
    openIncidentsBySeverity: {
      sev1: bySeverity.get("SEV1") ?? 0,
      sev2: bySeverity.get("SEV2") ?? 0,
      sev3: bySeverity.get("SEV3") ?? 0,
      sev4: bySeverity.get("SEV4") ?? 0,
    },
    checksToday,
    failuresToday,
    domainsExpiringSoon,
    certsExpiringSoon,
    schedulerRunning: isSchedulerRunning(),
    lastHealthJobRun: lastHealthRun?.finishedAt ? lastHealthRun.finishedAt.toISOString() : null,
    lastDomainJobRun: lastDomainRun?.finishedAt ? lastDomainRun.finishedAt.toISOString() : null,
  };

  return jsonOk(data);
});
