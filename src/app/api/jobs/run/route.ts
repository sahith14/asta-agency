/**
 * AgencyOS — Manual background job trigger (Phase 4).
 * POST /api/jobs/run { jobKey } → JobRunOutcome
 * Dispatches the four monitoring jobs with trigger MANUAL, or wraps
 * runBillingTasks("MANUAL") in a BackgroundJobRun (jobKey BILLING_TASKS).
 * Unknown keys → 404. Rate-limited: jobs hit real network targets.
 */
import { z } from "zod";
import { BadRequestError, NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { requireFounder } from "@/lib/rbac";
import { rateLimit } from "@/lib/rate-limit";
import { runHealthChecks, runDomainChecks, runMaintenanceReminders, runDeploymentReconciliation, withJobRecord } from "@/lib/monitoring/jobs";
import { runNotificationSweep } from "@/lib/notifications/sweep";
import { runBillingTasks } from "@/lib/billing/jobs";
import { BACKGROUND_JOB_KEYS } from "@/lib/types";

const runSchema = z.object({
  jobKey: z.string().min(1),
});

export const POST = withAuth(async (req, user) => {
  // RBAC: manual job runs hit real network targets — founder-only.
  requireFounder(user);
  const limit = rateLimit(`jobs-run:${user.id}`, 10, 60_000);
  if (!limit.ok) {
    throw new BadRequestError(`Jobs were run recently — try again in ${limit.retryAfterSeconds}s.`);
  }

  const body = await parseBody(req, runSchema);

  if (!(BACKGROUND_JOB_KEYS as readonly string[]).includes(body.jobKey)) {
    throw new NotFoundError(`Unknown job key "${body.jobKey}". Allowed: ${BACKGROUND_JOB_KEYS.join(", ")}.`);
  }

  switch (body.jobKey) {
    case "WEBSITE_HEALTH_CHECKS": {
      const outcome = await runHealthChecks("MANUAL");
      if (!outcome) throw new BadRequestError("Nothing to check right now.");
      return jsonOk(outcome);
    }
    case "DOMAIN_SSL_CHECKS": {
      const outcome = await runDomainChecks("MANUAL");
      if (!outcome) throw new BadRequestError("No domains are due for a check.");
      return jsonOk(outcome);
    }
    case "MAINTENANCE_REMINDERS": {
      // MANUAL always produces a job record (scheduled runs skip when nothing is due).
      const outcome = await runMaintenanceReminders("MANUAL");
      if (!outcome) throw new BadRequestError("Nothing to remind right now.");
      return jsonOk(outcome);
    }
    case "DEPLOYMENT_RECONCILIATION": {
      const outcome = await runDeploymentReconciliation("MANUAL");
      return jsonOk(outcome);
    }
    case "BILLING_TASKS": {
      // Billing keeps its own Setting-based stamp; this wraps the run in a
      // BackgroundJobRun so it appears in the same jobs timeline.
      const outcome = await withJobRecord("BILLING_TASKS", "MANUAL", async () => {
        const data = await runBillingTasks("MANUAL");
        return { results: data as unknown as Record<string, unknown> };
      });
      return jsonOk(outcome);
    }
    case "NOTIFICATION_SWEEP": {
      // Idempotent sweep (dedupKey-guarded) — safe to run any time.
      const outcome = await withJobRecord("NOTIFICATION_SWEEP", "MANUAL", async () => {
        const data = await runNotificationSweep();
        return { results: data.results, partial: data.partial };
      });
      return jsonOk(outcome);
    }
    default:
      throw new NotFoundError(`Unknown job key "${body.jobKey}".`);
  }
});
