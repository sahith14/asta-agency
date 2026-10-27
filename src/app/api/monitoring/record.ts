/**
 * AgencyOS — Shared monitoring record mapping for the monitoring API routes
 * (colocated helper, not a route).
 */
import type { MonitorConfig, HealthCheck } from "@prisma/client";
import type { HealthCheckRecord, MonitorConfigRecord } from "@/lib/types";

type WebsiteWithClient = {
  id: string;
  name: string;
  productionUrl: string | null;
  primaryDomain: string | null;
  client?: { id: string; businessName: string } | null;
};

export function toMonitorConfigRecord(
  row: MonitorConfig,
  website?: WebsiteWithClient | null
): MonitorConfigRecord {
  return {
    id: row.id,
    websiteId: row.websiteId,
    enabled: row.enabled,
    url: row.url,
    acceptedStatuses: row.acceptedStatuses,
    intervalMinutes: row.intervalMinutes,
    timeoutSeconds: row.timeoutSeconds,
    failureThreshold: row.failureThreshold,
    recoveryThreshold: row.recoveryThreshold,
    degradedAfterMs: row.degradedAfterMs,
    currentHealth: row.currentHealth,
    consecutiveFailures: row.consecutiveFailures,
    consecutiveSuccesses: row.consecutiveSuccesses,
    lastCheckAt: row.lastCheckAt ? row.lastCheckAt.toISOString() : null,
    lastSuccessAt: row.lastSuccessAt ? row.lastSuccessAt.toISOString() : null,
    lastFailureAt: row.lastFailureAt ? row.lastFailureAt.toISOString() : null,
    lastErrorSummary: row.lastErrorSummary,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    website: website
      ? {
          id: website.id,
          name: website.name,
          productionUrl: website.productionUrl,
          primaryDomain: website.primaryDomain,
          client: website.client ? { id: website.client.id, businessName: website.client.businessName } : null,
        }
      : null,
  };
}

type HealthCheckWithWebsite = HealthCheck & {
  website?: { id: string; name: string; client?: { businessName: string } | null } | null;
};

export function toHealthCheckRecord(row: HealthCheckWithWebsite): HealthCheckRecord {
  return {
    id: row.id,
    websiteId: row.websiteId,
    checkedAt: row.checkedAt.toISOString(),
    success: row.success,
    statusCode: row.statusCode,
    durationMs: row.durationMs,
    slow: row.slow,
    trigger: row.trigger,
    errorCategory: row.errorCategory,
    errorSummary: row.errorSummary,
    website: row.website
      ? { id: row.website.id, name: row.website.name, clientName: row.website.client?.businessName ?? null }
      : null,
  };
}
