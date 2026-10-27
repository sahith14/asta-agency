/**
 * AgencyOS — Next.js instrumentation hook (Task 2-b, extended in Phase 4).
 *
 * Boots the server-side schedulers once, in the Node.js runtime only:
 * - Gmail sync scheduler (Phase 2)
 * - Billing scheduler + example plan seeding (Phase 3)
 * - Monitoring scheduler (Phase 4: health checks, domain/SSL checks,
 *   maintenance reminders, deployment reconciliation)
 * Guarded against the production build phase so `next build` never opens DB
 * connections or timers. Each scheduler boots in its own try/catch so one
 * failing background worker can never break the other (or the server).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  try {
    await import("@/lib/gmail/scheduler");
  } catch (err) {
    // A failed boot (e.g. dependency module not yet present) must not take
    // the whole server down — the scheduler is an optional background worker.
    console.error("[gmail-scheduler] Failed to start scheduler:", err instanceof Error ? err.message : err);
  }
  try {
    await import("@/lib/billing/scheduler");
  } catch (err) {
    console.error("[billing-scheduler] Failed to start scheduler:", err instanceof Error ? err.message : err);
  }
  try {
    await import("@/lib/monitoring/scheduler");
  } catch (err) {
    console.error("[monitoring-scheduler] Failed to start scheduler:", err instanceof Error ? err.message : err);
  }
}
