/**
 * AgencyOS — Next.js instrumentation hook.
 *
 * HISTORY: this file once booted optional background schedulers (gmail sync,
 * billing jobs, monitoring checks) restored from an earlier AgencyOS lineage.
 * Those modules were written against a different Prisma schema (EmailAccount,
 * MonitoringConfig, BillingPlan, …) that is not part of the current
 * prisma/schema.prisma, and were removed during launch verification
 * (LAUNCH-VERIFY). The schedulers therefore have nothing to start.
 *
 * If the integration schema gap is ever deliberately closed, restore the
 * schedulers and boot them here — guarded by NEXT_RUNTIME and
 * NEXT_PHASE exactly as before, each in its own try/catch.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  // Intentionally no background schedulers: see file history above.
}
