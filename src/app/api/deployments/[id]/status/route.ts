/**
 * AgencyOS — Deployment status transitions API (Phase 4).
 * POST /api/deployments/[id]/status { action }
 * Validated against DEPLOYMENT_TRANSITIONS. FAILED requires a recorded
 * errorSummary — "it failed" without "why" is not accepted.
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { requireModuleWrite } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { DEPLOYMENT_TRANSITIONS } from "@/lib/types";
import { deploymentInclude, toDeploymentRecord } from "../../record";

const statusSchema = z.object({
  action: z.string().min(1),
  /** Optional with action=FAILED — records what went wrong in the same request. */
  errorSummary: z.string().max(2000).optional(),
});

export const POST = withAuth(async (req, user, { params }) => {
  // RBAC: deployment status transitions are founder + developer.
  requireModuleWrite(user, "deployments");
  const { id } = await params;
  const body = await parseBody(req, statusSchema);

  const deployment = await db.deployment.findUnique({ where: { id } });
  if (!deployment) throw new NotFoundError("Deployment not found.");

  const allowed = DEPLOYMENT_TRANSITIONS[deployment.status] ?? [];
  if (!(allowed as readonly string[]).includes(body.action)) {
    throw new BadRequestError(
      allowed.length > 0
        ? `Cannot move from ${deployment.status} to ${body.action}. Allowed: ${allowed.join(", ")}.`
        : `Cannot move from ${deployment.status} — this deployment is in a terminal state.`
    );
  }

  const now = new Date();
  const data: Parameters<typeof db.deployment.update>[0]["data"] = { status: body.action };

  if (body.action === "FAILED") {
    const bodySummary = body.errorSummary?.trim() ?? "";
    if (!bodySummary && (!deployment.errorSummary || deployment.errorSummary.trim() === "")) {
      throw new BadRequestError("Record what went wrong before marking a deployment failed.");
    }
    if (bodySummary && bodySummary !== (deployment.errorSummary ?? "")) {
      data.errorSummary = bodySummary;
    }
  }

  if (body.action === "SUCCESSFUL") data.completedAt = now;
  if (body.action === "ROLLED_BACK" && !deployment.completedAt) data.completedAt = now;
  if (body.action === "FAILED" && !deployment.completedAt) data.completedAt = now; // a failed deploy is finished

  const updated = await db.deployment.update({ where: { id }, data });

  await logActivity({
    action: "DEPLOYMENT_STATUS_CHANGED",
    entityType: "DEPLOYMENT",
    entityId: updated.id,
    summary:
      body.action === "FAILED"
        ? `Deployment marked failed — ${deployment.errorSummary?.slice(0, 200) ?? "see error summary"}.`
        : `Deployment moved from ${deployment.status} to ${body.action}.`,
    actor: user,
    websiteId: updated.websiteId,
  });

  const full = await db.deployment.findUnique({ where: { id }, include: deploymentInclude });
  if (!full) throw new BadRequestError("Deployment could not be loaded after the status change.");
  return jsonOk(toDeploymentRecord(full));
});
