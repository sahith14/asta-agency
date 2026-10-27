/**
 * AgencyOS — Manual domain check trigger (Phase 4).
 * POST /api/monitoring/domains/check { domainId? } → JobRunOutcome
 * Runs REAL TLS certificate inspection + RDAP lookups now. Updates Domain
 * cert/rdap fields with the observed results only. Rate-limited (network).
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { requireModuleWrite } from "@/lib/rbac";
import { rateLimit } from "@/lib/rate-limit";
import { runDomainChecks } from "@/lib/monitoring/jobs";

const runSchema = z.object({
  domainId: z.string().min(1).optional(),
});

export const POST = withAuth(async (req, user) => {
  // RBAC: running domain checks is founder + developer.
  requireModuleWrite(user, "monitoring");
  const limit = rateLimit(`domain-check-run:${user.id}`, 10, 60_000);
  if (!limit.ok) {
    throw new BadRequestError(`Domain checks were run recently — try again in ${limit.retryAfterSeconds}s.`);
  }

  const body = await parseBody(req, runSchema);

  if (body.domainId) {
    const domain = await db.domain.findUnique({ where: { id: body.domainId }, select: { id: true } });
    if (!domain) throw new NotFoundError("Domain not found.");
  }

  const outcome = await runDomainChecks("MANUAL", body.domainId);
  if (!outcome) {
    throw new BadRequestError("No domains were due for a check.");
  }
  return jsonOk(outcome);
});
