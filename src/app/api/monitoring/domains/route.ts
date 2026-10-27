/**
 * AgencyOS — Domain monitoring list API (Phase 4).
 * GET /api/monitoring/domains → MonitoringDomainsData
 * All Domain rows with real observation dates (TLS notAfter, RDAP expiry) and
 * the manually maintained renewalDate, sorted soonest first (nulls last).
 */
import { db } from "@/lib/db";
import { jsonOk, withAuth } from "@/lib/api";
import { requireModule } from "@/lib/rbac";
import type { MonitoringDomainsData } from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

export const GET = withAuth(async (_req, user) => {
  // RBAC: monitoring read — founder/developer/support; managers/staff denied.
  requireModule(user, "monitoring");
  const now = new Date();
  const rows = await db.domain.findMany({
    select: {
      id: true,
      websiteId: true,
      domainName: true,
      registrar: true,
      renewalDate: true,
      autoRenew: true,
      certNotAfter: true,
      certCheckedAt: true,
      certError: true,
      rdapExpiryDate: true,
      rdapCheckedAt: true,
      rdapError: true,
      lastCheckedAt: true,
      website: { select: { name: true, client: { select: { businessName: true } } } },
    },
  });

  const daysUntil = (date: Date) => Math.ceil((date.getTime() - now.getTime()) / DAY_MS);

  const items = rows
    .map((d) => {
      const effective = d.rdapExpiryDate ?? d.renewalDate;
      return {
        id: d.id,
        websiteId: d.websiteId,
        websiteName: d.website.name,
        clientName: d.website.client?.businessName ?? null,
        domainName: d.domainName,
        registrar: d.registrar,
        renewalDate: d.renewalDate ? d.renewalDate.toISOString() : null, // manually maintained
        rdapExpiryDate: d.rdapExpiryDate ? d.rdapExpiryDate.toISOString() : null,
        rdapCheckedAt: d.rdapCheckedAt ? d.rdapCheckedAt.toISOString() : null,
        rdapError: d.rdapError,
        autoRenew: d.autoRenew,
        certNotAfter: d.certNotAfter ? d.certNotAfter.toISOString() : null,
        certCheckedAt: d.certCheckedAt ? d.certCheckedAt.toISOString() : null,
        certError: d.certError,
        lastCheckedAt: d.lastCheckedAt ? d.lastCheckedAt.toISOString() : null,
        daysUntilRenewal: effective ? daysUntil(effective) : null,
        daysUntilCertExpiry: d.certNotAfter ? daysUntil(d.certNotAfter) : null,
      };
    })
    .sort((a, b) => {
      const aKey = a.daysUntilRenewal ?? Infinity;
      const bKey = b.daysUntilRenewal ?? Infinity;
      if (aKey !== bKey) return aKey - bKey;
      return (a.daysUntilCertExpiry ?? Infinity) - (b.daysUntilCertExpiry ?? Infinity);
    });

  const data: MonitoringDomainsData = { items };
  return jsonOk(data);
});
