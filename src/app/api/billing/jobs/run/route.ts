/**
 * AgencyOS — Manual billing jobs trigger (Phase 3).
 * POST /api/billing/jobs/run → runBillingTasks("MANUAL"); rate-limited to
 * 5 runs/minute. Returns the per-task outcomes (details[] name the records).
 */
import { BadRequestError, jsonOk, withAuth } from "@/lib/api";
import { requireFounder } from "@/lib/rbac";
import { rateLimit } from "@/lib/rate-limit";
import { runBillingTasks } from "@/lib/billing/jobs";

export const POST = withAuth(async (req, user) => {
  // RBAC: manual billing job runs are founder-only.
  requireFounder(user);
  const limit = rateLimit(`billing-jobs:${user.id}`, 5, 60_000);
  if (!limit.ok) {
    throw new BadRequestError(
      `Billing tasks were run recently — try again in ${limit.retryAfterSeconds}s.`
    );
  }

  // Job results carry their own details; no separate audit entry needed.
  const run = await runBillingTasks("MANUAL");
  return jsonOk(run);
});
