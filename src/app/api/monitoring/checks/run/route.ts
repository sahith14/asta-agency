/**
 * AgencyOS — Manual availability check trigger (Phase 4).
 * POST /api/monitoring/checks/run { websiteId? } → JobRunOutcome
 * Runs REAL checks now via runHealthChecks("MANUAL"). Websites without
 * monitoring / a URL are reported honestly in the rows (skipped reason) —
 * no fake results. Rate-limited: every run hits real network targets.
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { requireModuleWrite } from "@/lib/rbac";
import { rateLimit } from "@/lib/rate-limit";
import { runHealthChecks } from "@/lib/monitoring/jobs";

const runSchema = z.object({
  websiteId: z.string().min(1).optional(),
});

export const POST = withAuth(async (req, user) => {
  // RBAC: running health checks is founder + developer.
  requireModuleWrite(user, "monitoring");
  const limit = rateLimit(`monitoring-check-run:${user.id}`, 10, 60_000);
  if (!limit.ok) {
    throw new BadRequestError(`Checks were run recently — try again in ${limit.retryAfterSeconds}s.`);
  }

  const body = await parseBody(req, runSchema);

  if (body.websiteId) {
    const website = await db.website.findUnique({ where: { id: body.websiteId }, select: { id: true } });
    if (!website) throw new NotFoundError("Website not found.");
  }

  // Throws (→ FAILED BackgroundJobRun row + 500) only on unexpected errors;
  // per-website problems are reported in the outcome rows instead.
  const outcome = await runHealthChecks("MANUAL", body.websiteId);
  if (!outcome) {
    // Cannot happen for MANUAL runs (they always produce a record) — guard anyway.
    throw new BadRequestError("No checks were due.");
  }
  return jsonOk(outcome);
});
