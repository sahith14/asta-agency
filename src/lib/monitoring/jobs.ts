/**
 * AgencyOS — monitoring background jobs (Phase 4, server-only).
 *
 * Every run writes a BackgroundJobRun row so failures stay visible in the
 * UI — a job that throws is recorded as FAILED and the error rethrown.
 * Results are honest: checks are never fabricated, skipped websites carry a
 * machine-readable `skipped` reason, and provider reconciliation only counts.
 *
 * Jobs:
 * - runHealthChecks            — real HTTP checks via the SSRF-guarded checker,
 *                                health state machine + incident engine wiring.
 * - runDomainChecks            — real TLS certificate inspection + RDAP lookup.
 * - runMaintenanceReminders    — one reminder per due/overdue planned run.
 * - runDeploymentReconciliation— report-only staleness count (no mutation,
 *                                no fabricated failures).
 *
 * Scheduled calls that find nothing due return `null` WITHOUT creating a job
 * record (no per-minute noise); manual calls always produce a record.
 */
import "server-only";
import { db } from "@/lib/db";
import { sanitiseError } from "@/lib/monitoring/url-guard";
import { runHttpCheck } from "@/lib/monitoring/http-checker";
import { checkTlsCertificate, checkDomainRegistration } from "@/lib/monitoring/tls-checker";
import { computeHealthState } from "@/lib/monitoring/health-state";
import { handleOutageTransition, handleRecoveryConfirmed, type CheckEvidence } from "@/lib/monitoring/incident-engine";
import { logActivity } from "@/lib/activity";
import { NotFoundError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { CheckRunOutcomeRow, DomainCheckOutcomeRow } from "@/lib/types";
import type { Domain, MonitorConfig } from "@prisma/client";

export type JobTrigger = "SCHEDULED" | "MANUAL";

export interface JobRunResult {
  jobKey: string;
  trigger: string;
  status: string;
  runId: string;
  results: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Job record wrapper
// ---------------------------------------------------------------------------

/**
 * Creates a BackgroundJobRun (RUNNING), executes `fn`, then marks the run
 * SUCCESS (or PARTIAL when `fn` reports partial results) with the results
 * JSON. On throw the run is marked FAILED with a sanitised error and the
 * error is rethrown so callers can surface it.
 */
export async function withJobRecord(
  jobKey: string,
  trigger: JobTrigger,
  fn: () => Promise<{ results: Record<string, unknown>; partial?: boolean }>
): Promise<JobRunResult> {
  const run = await db.backgroundJobRun.create({
    data: { jobKey, trigger, status: "RUNNING", startedAt: new Date(), attempts: 1 },
  });
  try {
    const { results, partial } = await fn();
    const status = partial ? "PARTIAL" : "SUCCESS";
    await db.backgroundJobRun.update({
      where: { id: run.id },
      data: { status, finishedAt: new Date(), results: JSON.stringify(results) },
    });
    return { jobKey, trigger, status, runId: run.id, results };
  } catch (err) {
    const lastError = sanitiseError(err);
    try {
      await db.backgroundJobRun.update({
        where: { id: run.id },
        data: { status: "FAILED", finishedAt: new Date(), lastError },
      });
    } catch (updateErr) {
      console.error(`[monitoring-jobs] Could not record failure for ${jobKey}:`, updateErr);
    }
    throw err;
  }
}

/** Latest BackgroundJobRun for a jobKey (any status), or null. */
export async function getLastJobRun(jobKey: string) {
  return db.backgroundJobRun.findFirst({ where: { jobKey }, orderBy: { startedAt: "desc" } });
}

// ---------------------------------------------------------------------------
// Health checks
// ---------------------------------------------------------------------------

/** Interval env helpers. */
function domainCheckIntervalHours(): number {
  const parsed = parseInt(process.env.MONITORING_DOMAIN_CHECK_HOURS ?? "6", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 6;
  return parsed;
}

/** Milliseconds between checks for a config (minimum 1 minute). */
function intervalMs(config: Pick<MonitorConfig, "intervalMinutes">): number {
  return Math.max(1, config.intervalMinutes) * 60_000;
}

function resolvableUrl(
  config: Pick<MonitorConfig, "url"> | null,
  website: { productionUrl: string | null; primaryDomain: string | null }
): string | null {
  if (config?.url && config.url.trim()) return config.url.trim();
  if (website.productionUrl && website.productionUrl.trim()) return website.productionUrl.trim();
  if (website.primaryDomain && website.primaryDomain.trim()) return `https://${website.primaryDomain.trim()}`;
  return null;
}

/**
 * Runs ONE website's availability check end-to-end: resolves the check URL,
 * performs the real HTTP check, persists the HealthCheck + new MonitorConfig
 * state in one transaction, then drives the incident engine on DOWN /
 * confirmed-recovery transitions. Never throws for "expected" check
 * outcomes — the row reports them.
 */
export async function runSingleHealthCheck(
  website: { id: string; name: string; productionUrl: string | null; primaryDomain: string | null },
  config: MonitorConfig,
  trigger: JobTrigger
): Promise<CheckRunOutcomeRow> {
  const url = resolvableUrl(config, website);
  if (!url) {
    return {
      websiteId: website.id,
      websiteName: website.name,
      ok: false,
      statusCode: null,
      durationMs: null,
      health: config.currentHealth,
      errorSummary: null,
      skipped: "No check URL configured — set one on the monitoring config.",
    };
  }

  const now = new Date();
  const result = await runHttpCheck({
    url,
    acceptedStatuses: config.acceptedStatuses,
    timeoutSeconds: config.timeoutSeconds,
    degradedAfterMs: config.degradedAfterMs,
  });

  const consecutiveFailures = result.ok ? 0 : config.consecutiveFailures + 1;
  const consecutiveSuccesses = result.ok ? config.consecutiveSuccesses + 1 : 0;
  const nextHealth = computeHealthState({
    previousState: config.currentHealth,
    lastCheck: { success: result.ok, slow: result.slow },
    consecutiveFailures,
    consecutiveSuccesses,
    failureThreshold: config.failureThreshold,
    recoveryThreshold: config.recoveryThreshold,
  });

  const errorSummary = result.errorSummary ? sanitiseError(result.errorSummary) : null;

  await db.$transaction([
    db.healthCheck.create({
      data: {
        websiteId: website.id,
        checkedAt: now,
        success: result.ok,
        statusCode: result.statusCode,
        durationMs: result.durationMs,
        slow: result.slow,
        trigger,
        errorCategory: result.errorCategory,
        errorSummary,
      },
    }),
    db.monitorConfig.update({
      where: { id: config.id },
      data: {
        consecutiveFailures,
        consecutiveSuccesses,
        lastCheckAt: now,
        ...(result.ok ? { lastSuccessAt: now } : { lastFailureAt: now }),
        lastErrorSummary: result.ok ? null : errorSummary,
        currentHealth: nextHealth,
      },
    }),
  ]);

  const evidence: CheckEvidence = {
    statusCode: result.statusCode,
    durationMs: result.durationMs,
    errorCategory: result.errorCategory,
    errorSummary: errorSummary,
    checkedAt: now,
  };

  // AFTER the transaction: incident-engine transitions (best-effort per website).
  // handleOutageTransition is idempotent: on the first DOWN it creates the
  // auto incident; while an open incident already covers the outage it only
  // attaches evidence (OBSERVATION event + lastObservedAt) — so calling it on
  // EVERY failed check preserves the event history without duplicates.
  if (nextHealth === "DOWN" && !result.ok) {
    await handleOutageTransition(website.id, website.name, evidence);
  } else if (
    config.currentHealth === "DOWN" &&
    (nextHealth === "HEALTHY" || (nextHealth === "DEGRADED" && result.ok))
  ) {
    await handleRecoveryConfirmed(website.id, website.name, evidence);
  }

  return {
    websiteId: website.id,
    websiteName: website.name,
    ok: result.ok,
    statusCode: result.statusCode,
    durationMs: result.durationMs,
    health: nextHealth,
    errorSummary: errorSummary,
  };
}

/**
 * Availability checks for enabled MonitorConfigs.
 * - websiteId given: just that website (enabled or not — disabled/missing
 *   config/no URL produce honest skipped rows; force-runs regardless of due).
 * - scheduled: only DUE configs (lastCheckAt null or older than the config's
 *   own interval) that have a resolvable URL. Nothing due → null (no record).
 *
 * Websites are processed in batches of 3; one failing website never blocks
 * the others (its row reports "Check error — see server log", run = PARTIAL).
 */
export async function runHealthChecks(
  trigger: JobTrigger,
  websiteId?: string
): Promise<JobRunResult | null> {
  // Freshness re-read for scheduled targets so overlapping runs never double-check.
  const OVERLAP_GUARD_MS = 30_000;

  // Scheduled with nothing due → no job record (prevents per-tick noise).
  if (trigger === "SCHEDULED" && !websiteId) {
    const enabled = await db.monitorConfig.findMany({
      where: { enabled: true },
      select: { intervalMinutes: true, lastCheckAt: true, url: true, website: { select: { productionUrl: true, primaryDomain: true, archivedAt: true } } },
    });
    const now = Date.now();
    const dueCount = enabled.filter(
      (c) =>
        !c.website.archivedAt &&
        (!c.lastCheckAt || now - c.lastCheckAt.getTime() >= intervalMs(c)) &&
        resolvableUrl(c, c.website)
    ).length;
    if (dueCount === 0) return null;
  }

  return withJobRecord("WEBSITE_HEALTH_CHECKS", trigger, async () => {
    const rows: CheckRunOutcomeRow[] = [];
    let partial = false;

    type Target = {
      website: { id: string; name: string; productionUrl: string | null; primaryDomain: string | null };
      config: MonitorConfig;
    };
    const targets: Target[] = [];
    const skipRows: CheckRunOutcomeRow[] = [];

    if (websiteId) {
      const website = await db.website.findUnique({
        where: { id: websiteId },
        select: { id: true, name: true, productionUrl: true, primaryDomain: true, monitorConfig: true },
      });
      if (!website) throw new NotFoundError("Website not found.");
      if (!website.monitorConfig) {
        skipRows.push({
          websiteId: website.id,
          websiteName: website.name,
          ok: false,
          statusCode: null,
          durationMs: null,
          health: "UNKNOWN",
          errorSummary: null,
          skipped: "Monitoring is not configured for this website.",
        });
      } else if (!website.monitorConfig.enabled) {
        skipRows.push({
          websiteId: website.id,
          websiteName: website.name,
          ok: false,
          statusCode: null,
          durationMs: null,
          health: website.monitorConfig.currentHealth,
          errorSummary: null,
          skipped: "Monitoring is disabled for this website — enable it to run checks.",
        });
      } else {
        targets.push({ website, config: website.monitorConfig });
      }
    } else {
      // Scheduled: only enabled configs that are DUE and have a resolvable URL.
      // Websites without any URL are not selected — there is nothing honest to
      // check (they surface as UNKNOWN in the UI); selecting them would spin
      // this job every tick.
      const configs = await db.monitorConfig.findMany({
        where: { enabled: true },
        include: {
          website: { select: { id: true, name: true, productionUrl: true, primaryDomain: true, archivedAt: true } },
        },
      });
      const now = Date.now();
      for (const config of configs) {
        if (config.website.archivedAt) continue;
        if (config.lastCheckAt && now - config.lastCheckAt.getTime() < intervalMs(config)) continue;
        if (!resolvableUrl(config, config.website)) continue;
        targets.push({ website: config.website, config });
      }
    }

    // Batches of 3, sequential slices; per-website error isolation.
    const runOne = async (target: Target): Promise<CheckRunOutcomeRow> => {
      try {
        if (trigger === "SCHEDULED") {
          const fresh = await db.monitorConfig.findUnique({
            where: { websiteId: target.website.id },
            select: { lastCheckAt: true },
          });
          if (fresh?.lastCheckAt && Date.now() - fresh.lastCheckAt.getTime() < OVERLAP_GUARD_MS) {
            return {
              websiteId: target.website.id,
              websiteName: target.website.name,
              ok: false,
              statusCode: null,
              durationMs: null,
              health: target.config.currentHealth,
              errorSummary: null,
              skipped: "Skipped — a check for this website ran moments ago.",
            };
          }
        }
        return await runSingleHealthCheck(target.website, target.config, trigger);
      } catch (err) {
        partial = true;
        console.error(`[monitoring-jobs] Health check failed for website ${target.website.id}:`, err instanceof Error ? err.message : err);
        return {
          websiteId: target.website.id,
          websiteName: target.website.name,
          ok: false,
          statusCode: null,
          durationMs: null,
          health: target.config.currentHealth,
          errorSummary: null,
          skipped: "Check error — see server log",
        };
      }
    };

    for (let i = 0; i < targets.length; i += 3) {
      const slice = targets.slice(i, i + 3);
      const outcomes = await Promise.all(slice.map(runOne));
      rows.push(...outcomes);
    }

    const allRows = [...skipRows, ...rows];
    const ok = allRows.filter((r) => !r.skipped && r.ok).length;
    const failed = allRows.filter((r) => !r.skipped && !r.ok).length;
    const skipped = allRows.filter((r) => r.skipped).length;

    return {
      results: { total: allRows.length, ok, failed, skipped, rows: allRows },
      partial,
    };
  });
}

// ---------------------------------------------------------------------------
// Domain checks (TLS certificate + RDAP registration expiry)
// ---------------------------------------------------------------------------

/**
 * TLS + RDAP checks for domains.
 * - domainId given: just that domain (checked regardless of freshness).
 * - scheduled: only domains whose certCheckedAt is null or older than
 *   MONITORING_DOMAIN_CHECK_HOURS (default 6). Nothing due → null (no record).
 *
 * Domain fields are updated with REAL results only: a failed handshake keeps
 * the previous observation and records the error — nothing is erased or
 * invented by a transient network failure.
 */
export async function runDomainChecks(
  trigger: JobTrigger,
  domainId?: string
): Promise<JobRunResult | null> {
  // Scheduled with nothing due → no job record (prevents per-tick noise).
  if (trigger === "SCHEDULED" && !domainId) {
    const cutoff = new Date(Date.now() - domainCheckIntervalHours() * 3_600_000);
    const dueCount = await db.domain.count({
      where: { OR: [{ certCheckedAt: null }, { certCheckedAt: { lt: cutoff } }] },
    });
    if (dueCount === 0) return null;
  }

  return withJobRecord("DOMAIN_SSL_CHECKS", trigger, async () => {
    const targets: Domain[] = [];

    if (domainId) {
      const domain = await db.domain.findUnique({ where: { id: domainId } });
      if (!domain) throw new NotFoundError("Domain not found.");
      targets.push(domain);
    } else {
      const cutoff = new Date(Date.now() - domainCheckIntervalHours() * 3_600_000);
      targets.push(
        ...(await db.domain.findMany({
          where: { OR: [{ certCheckedAt: null }, { certCheckedAt: { lt: cutoff } }] },
        }))
      );
    }

    const rows: DomainCheckOutcomeRow[] = [];
    let certOkCount = 0;
    let rdapOkCount = 0;

    for (const domain of targets) {
      const [tls, rdap] = await Promise.all([
        checkTlsCertificate(domain.domainName),
        checkDomainRegistration(domain.domainName),
      ]);

      const now = new Date();
      const certOk = tls.ok && tls.authorised;
      const certError = tls.authorised ? null : (tls.errorSummary ?? "Certificate check failed.");
      const rdapError = rdap.ok ? null : (rdap.errorSummary ?? "RDAP lookup failed.");

      await db.domain.update({
        where: { id: domain.id },
        data: {
          // Only overwrite the observation when a real one exists — a failed
          // check keeps the previous value (it stays labelled with certCheckedAt).
          ...(tls.ok && tls.notAfter ? { certNotAfter: tls.notAfter } : {}),
          certCheckedAt: now,
          certError,
          ...(rdap.ok && rdap.expiryDate ? { rdapExpiryDate: rdap.expiryDate } : {}),
          rdapCheckedAt: now,
          rdapError,
          lastCheckedAt: now,
        },
      });

      const errors: string[] = [];
      if (certError) errors.push(certError);
      if (rdapError) errors.push(rdapError);

      if (certOk) certOkCount += 1;
      if (rdap.ok) rdapOkCount += 1;

      rows.push({
        domainId: domain.id,
        domainName: domain.domainName,
        certOk,
        certNotAfter: tls.ok && tls.notAfter ? tls.notAfter.toISOString() : (domain.certNotAfter ? domain.certNotAfter.toISOString() : null),
        rdapOk: rdap.ok,
        rdapExpiryDate: rdap.ok && rdap.expiryDate ? rdap.expiryDate.toISOString() : (domain.rdapExpiryDate ? domain.rdapExpiryDate.toISOString() : null),
        errors,
      });
    }

    return {
      results: { total: rows.length, certOk: certOkCount, rdapOk: rdapOkCount, rows },
    };
  });
}

// ---------------------------------------------------------------------------
// Maintenance reminders
// ---------------------------------------------------------------------------

/**
 * One reminder per MaintenanceRun that is planned within the next 48 h or
 * overdue (PLANNED/IN_PROGRESS past its date) and not yet reminded
 * (remindedAt null stamps both cases). Nothing due → null (no record).
 */
export async function runMaintenanceReminders(trigger: JobTrigger): Promise<JobRunResult | null> {
  // Scheduled with nothing due → no job record (prevents per-tick noise).
  if (trigger === "SCHEDULED") {
    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 3_600_000);
    const dueCount = await db.maintenanceRun.count({
      where: {
        remindedAt: null,
        OR: [
          { status: "PLANNED", scheduledDate: { gte: now, lte: in48h } },
          { status: { in: ["PLANNED", "IN_PROGRESS"] }, scheduledDate: { lt: now } },
        ],
      },
    });
    if (dueCount === 0) return null;
  }

  return withJobRecord("MAINTENANCE_REMINDERS", trigger, async () => {
    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 3_600_000);

    const due = await db.maintenanceRun.findMany({
      where: {
        remindedAt: null,
        OR: [
          { status: "PLANNED", scheduledDate: { gte: now, lte: in48h } },
          { status: { in: ["PLANNED", "IN_PROGRESS"] }, scheduledDate: { lt: now } },
        ],
      },
      include: { website: { select: { name: true } } },
      orderBy: { scheduledDate: "asc" },
    });

    const rows: { runId: string; websiteName: string; scheduledDate: string; overdue: boolean }[] = [];
    for (const run of due) {
      const overdue = run.scheduledDate.getTime() < now.getTime();
      await db.maintenanceRun.update({ where: { id: run.id }, data: { remindedAt: now } });
      await logActivity({
        action: "MAINTENANCE_REMINDER",
        entityType: "MAINTENANCE_RUN",
        entityId: run.id,
        summary: `Maintenance run for ${run.website.name} scheduled ${formatDate(run.scheduledDate.toISOString())} is ${overdue ? "overdue" : "due soon"}.`,
        websiteId: run.websiteId,
      });
      rows.push({
        runId: run.id,
        websiteName: run.website.name,
        scheduledDate: run.scheduledDate.toISOString(),
        overdue,
      });
    }

    return { results: { reminded: rows.length, rows } };
  });
}

// ---------------------------------------------------------------------------
// Deployment reconciliation (report-only)
// ---------------------------------------------------------------------------

/**
 * Counts deployments stuck in QUEUED/BUILDING/DEPLOYING for more than 24 h.
 * REPORT ONLY — nothing is mutated and no failure is fabricated; with a
 * provider connection the eventual real reconciliation is not implemented yet
 * and the message says so honestly.
 */
export async function runDeploymentReconciliation(trigger: JobTrigger): Promise<JobRunResult> {
  return withJobRecord("DEPLOYMENT_RECONCILIATION", trigger, async () => {
    const cutoff = new Date(Date.now() - 24 * 3_600_000);
    const staleCount = await db.deployment.count({
      where: { status: { in: ["QUEUED", "BUILDING", "DEPLOYING"] }, startedAt: { lt: cutoff } },
    });
    const providerConfigured = (await db.providerConnection.count({ where: { status: "CONNECTED" } })) > 0;
    const message = providerConfigured
      ? "Provider reconciliation is not implemented yet — verify deployments manually."
      : "No provider connections configured — deployments are reconciled manually.";
    return { results: { staleCount, providerConfigured, message } };
  });
}
