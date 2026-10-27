/**
 * AgencyOS — server-side monitoring scheduler (Phase 4).
 *
 * Started once per process from src/instrumentation.ts. A 60-second tick
 * runs the due monitoring jobs, each guarded individually so one failing job
 * never blocks the others (failures stay visible in BackgroundJobRun):
 *
 * - WEBSITE_HEALTH_CHECKS      — runHealthChecks("SCHEDULED") self-selects the
 *                                due enabled configs (returns null when none).
 * - DOMAIN_SSL_CHECKS          — runDomainChecks("SCHEDULED") when any domain's
 *                                certCheckedAt is older than
 *                                MONITORING_DOMAIN_CHECK_HOURS (default 6).
 * - MAINTENANCE_REMINDERS      — every tick (cheap; self-guards via
 *                                remindedAt; returns null when nothing due).
 * - DEPLOYMENT_RECONCILIATION  — when MONITORING_RECONCILIATION_INTERVAL_HOURS
 *                                (default 6) passed since the last run
 *                                (report-only).
 *
 * Documented limitation: the scheduler lives inside this process (correct for
 * the single-instance deployment). Multi-instance deployments should set
 * MONITORING_SCHEDULER_DISABLED=1 and trigger POST /api/jobs/run from an
 * external cron instead.
 *
 * Logging is deliberately terse ("[monitoring-scheduler]") — no URLs beyond
 * job names, no secrets.
 */
import "server-only";
import {
  runHealthChecks,
  runDomainChecks,
  runMaintenanceReminders,
  runDeploymentReconciliation,
  getLastJobRun,
  withJobRecord,
} from "@/lib/monitoring/jobs";
import { runNotificationSweep } from "@/lib/notifications/sweep";

const TICK_INTERVAL_MS = 60_000;

const globalForScheduler = globalThis as unknown as {
  /** Set when the scheduler interval is active in this process. */
  __agencyosMonitoringSchedulerBooted?: boolean;
  /** Busy flag: true while a tick is executing (prevents overlapping ticks). */
  __agencyosMonitoringSchedulerRunning?: boolean;
};

/** True when the in-process monitoring scheduler is active. */
export function isSchedulerRunning(): boolean {
  return globalForScheduler.__agencyosMonitoringSchedulerBooted === true;
}

function reconciliationIntervalHours(): number {
  const parsed = parseInt(process.env.MONITORING_RECONCILIATION_INTERVAL_HOURS ?? "6", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 6;
  return parsed;
}

async function tick(): Promise<void> {
  // Never run two ticks concurrently.
  if (globalForScheduler.__agencyosMonitoringSchedulerRunning) return;
  globalForScheduler.__agencyosMonitoringSchedulerRunning = true;
  try {
    const health = await runHealthChecks("SCHEDULED").catch((err) => {
      console.error("[monitoring-scheduler] Health checks failed:", err instanceof Error ? err.message : err);
      return null;
    });
    if (health) console.log(`[monitoring-scheduler] Health checks: ${health.status}`);

    const domains = await runDomainChecks("SCHEDULED").catch((err) => {
      console.error("[monitoring-scheduler] Domain checks failed:", err instanceof Error ? err.message : err);
      return null;
    });
    if (domains) console.log(`[monitoring-scheduler] Domain checks: ${domains.status}`);

    const reminders = await runMaintenanceReminders("SCHEDULED").catch((err) => {
      console.error("[monitoring-scheduler] Maintenance reminders failed:", err instanceof Error ? err.message : err);
      return null;
    });
    if (reminders) console.log(`[monitoring-scheduler] Maintenance reminders sent: ${reminders.results ? String((reminders.results as { reminded?: number }).reminded ?? 0) : "0"}`);

    const hours = reconciliationIntervalHours();
    const last = await getLastJobRun("DEPLOYMENT_RECONCILIATION").catch(() => null);
    if (!last || Date.now() - last.startedAt.getTime() >= hours * 3_600_000) {
      const reconciliation = await runDeploymentReconciliation("SCHEDULED").catch((err) => {
        console.error("[monitoring-scheduler] Deployment reconciliation failed:", err instanceof Error ? err.message : err);
        return null;
      });
      if (reconciliation) console.log(`[monitoring-scheduler] Deployment reconciliation: ${reconciliation.status}`);
    }

    // Phase 5 — notification sweep: hourly (dedupKey-guarded, so the exact
    // cadence is not load-bearing; more frequent runs create no duplicates).
    const lastSweep = await getLastJobRun("NOTIFICATION_SWEEP").catch(() => null);
    if (!lastSweep || Date.now() - lastSweep.startedAt.getTime() >= 3_600_000) {
      const sweep = await withJobRecord("NOTIFICATION_SWEEP", "SCHEDULED", async () => {
        const data = await runNotificationSweep();
        return { results: data.results, partial: data.partial };
      }).catch((err) => {
        console.error("[monitoring-scheduler] Notification sweep failed:", err instanceof Error ? err.message : err);
        return null;
      });
      if (sweep) console.log(`[monitoring-scheduler] Notification sweep: ${sweep.status}`);
    }
  } finally {
    globalForScheduler.__agencyosMonitoringSchedulerRunning = false;
  }
}

/** Starts the scheduler exactly once per process. */
function startMonitoringScheduler(): void {
  if (globalForScheduler.__agencyosMonitoringSchedulerBooted) return;

  if (process.env.MONITORING_SCHEDULER_DISABLED === "1") {
    console.log("[monitoring-scheduler] Disabled (MONITORING_SCHEDULER_DISABLED=1) — use POST /api/jobs/run from an external cron");
    return;
  }

  globalForScheduler.__agencyosMonitoringSchedulerBooted = true;

  const timer = setInterval(() => {
    tick().catch((err) => {
      console.error("[monitoring-scheduler] Tick failed:", err instanceof Error ? err.message : err);
    });
  }, TICK_INTERVAL_MS);
  // Never keep the process alive just for the scheduler.
  timer.unref?.();

  console.log("[monitoring-scheduler] Started (tick every 60s)");
}

startMonitoringScheduler();
