/**
 * AgencyOS — server-side billing scheduler (Phase 3).
 *
 * Mirrors src/lib/gmail/scheduler.ts: started once per process from
 * src/instrumentation.ts, a 10-minute tick checks whether
 * BILLING_JOBS_INTERVAL_HOURS (default 24; 0 disables the scheduled run)
 * have passed since Setting "billing_jobs_last_run" — if never run or due,
 * it fires runBillingTasks("SCHEDULED").
 *
 * Documented limitation: the scheduler lives inside this process (correct
 * for the single-instance deployment); multi-instance deployments should
 * trigger POST /api/billing/jobs/run from an external cron instead.
 *
 * Logging is deliberately terse ("[billing-scheduler]") — no financial data.
 */
import "server-only";
import { runBillingTasks, getLastBillingJobRun } from "@/lib/billing/jobs";
import { ensureExamplePlans } from "@/lib/billing/example-plans";

const TICK_INTERVAL_MS = 600_000; // check every 10 minutes

const globalForScheduler = globalThis as unknown as {
  __agencyosBillingScheduler?: { startedAt: number };
};

function intervalHours(): number {
  const parsed = parseInt(process.env.BILLING_JOBS_INTERVAL_HOURS ?? "24", 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 24;
  return parsed;
}

async function tick(): Promise<void> {
  const hours = intervalHours();
  if (hours === 0) return; // scheduled runs disabled; manual runs still available

  const lastRun = await getLastBillingJobRun();
  if (lastRun && Date.now() - lastRun.getTime() < hours * 3_600_000) return;

  console.log("[billing-scheduler] Billing tasks due — running");
  await runBillingTasks("SCHEDULED").catch((err) => {
    console.error("[billing-scheduler] Scheduled run failed:", err instanceof Error ? err.message : err);
  });
}

/** Starts the scheduler exactly once per process. */
function startBillingScheduler(): void {
  if (globalForScheduler.__agencyosBillingScheduler) return;
  globalForScheduler.__agencyosBillingScheduler = { startedAt: Date.now() };

  if (intervalHours() === 0) {
    console.log("[billing-scheduler] Disabled (BILLING_JOBS_INTERVAL_HOURS=0)");
    return;
  }

  const timer = setInterval(() => {
    tick().catch((err) => {
      console.error("[billing-scheduler] Tick failed:", err instanceof Error ? err.message : err);
    });
  }, TICK_INTERVAL_MS);
  // Never keep the process alive just for the scheduler.
  timer.unref?.();

  console.log(`[billing-scheduler] Started (every ${intervalHours()} h, tick every 10 min)`);
}

startBillingScheduler();

// Seed the three example service plans once (only when the catalogue is
// empty). Failures are logged and never take the server down.
void ensureExamplePlans().catch((err) => {
  console.error("[billing-scheduler] Example plan seeding failed:", err instanceof Error ? err.message : err);
});
