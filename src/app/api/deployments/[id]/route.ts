/**
 * AgencyOS — Deployment detail API (Phase 4).
 * GET /api/deployments/[id] → { deployment: DeploymentRecord }
 * PATCH /api/deployments/[id] → build/provider metadata editable while the
 * deployment is QUEUED/BUILDING/DEPLOYING; postDeploymentHealth/postDeploymentNote
 * stay editable after completion (real recorded check results).
 */
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { requireModule, requireModuleWrite } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { commitShaSchema, deploymentInclude, normaliseCommitSha, toDeploymentRecord } from "../record";

// ---------------------------------------------------------------------------
// GET /api/deployments/[id]
// ---------------------------------------------------------------------------

export const GET = withAuth(async (_req, user, { params }) => {
  // RBAC: deployment history read — founder/developer/support; managers/staff denied.
  requireModule(user, "deployments");
  const { id } = await params;
  const deployment = await db.deployment.findUnique({ where: { id }, include: deploymentInclude });
  if (!deployment) throw new NotFoundError("Deployment not found.");
  return jsonOk({ deployment: toDeploymentRecord(deployment) });
});

// ---------------------------------------------------------------------------
// PATCH /api/deployments/[id]
// ---------------------------------------------------------------------------

const patchDeploymentSchema = z.object({
  buildUrl: z.string().max(500).nullish(),
  errorSummary: z.string().max(2000).nullish(),
  commitSha: commitShaSchema.nullish(),
  deploymentRef: z.string().max(200).nullish(),
  notes: z.string().max(5000).nullish(),
  postDeploymentHealth: z.enum(["PASSED", "FAILED", "NOT_CHECKED"]).nullish(),
  postDeploymentNote: z.string().max(2000).nullish(),
});

const IN_FLIGHT_STATUSES = ["QUEUED", "BUILDING", "DEPLOYING"];

export const PATCH = withAuth(async (req, user, { params }) => {
  // RBAC: editing deployments is founder + developer.
  requireModuleWrite(user, "deployments");
  const { id } = await params;
  const body = await parseBody(req, patchDeploymentSchema);

  const deployment = await db.deployment.findUnique({ where: { id } });
  if (!deployment) throw new NotFoundError("Deployment not found.");

  const hasCoreFields =
    body.buildUrl !== undefined ||
    body.errorSummary !== undefined ||
    body.commitSha !== undefined ||
    body.deploymentRef !== undefined ||
    body.notes !== undefined;
  const hasPostDeploymentFields = body.postDeploymentHealth !== undefined || body.postDeploymentNote !== undefined;

  if (hasCoreFields && !IN_FLIGHT_STATUSES.includes(deployment.status)) {
    throw new BadRequestError(
      "Only queued, building or deploying deployments can be edited — completed deployments are preserved as recorded."
    );
  }

  const data: Prisma.DeploymentUpdateInput = {
    ...(body.buildUrl !== undefined ? { buildUrl: body.buildUrl ?? null } : {}),
    ...(body.errorSummary !== undefined ? { errorSummary: body.errorSummary ?? null } : {}),
    ...(body.deploymentRef !== undefined ? { deploymentRef: body.deploymentRef ?? null } : {}),
    ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
    ...(body.postDeploymentHealth !== undefined ? { postDeploymentHealth: body.postDeploymentHealth ?? null } : {}),
    ...(body.postDeploymentNote !== undefined ? { postDeploymentNote: body.postDeploymentNote ?? null } : {}),
  };
  const commitSha = normaliseCommitSha(body.commitSha);
  if (commitSha !== undefined) data.commitSha = commitSha;

  if (Object.keys(data).length === 0) {
    throw new BadRequestError("Nothing to update.");
  }

  const updated = await db.deployment.update({ where: { id }, data });

  await logActivity({
    action: "DEPLOYMENT_UPDATED",
    entityType: "DEPLOYMENT",
    entityId: updated.id,
    summary: `Deployment details updated (${updated.status.toLowerCase()}).`,
    actor: user,
    websiteId: updated.websiteId,
  });

  const full = await db.deployment.findUnique({ where: { id }, include: deploymentInclude });
  if (!full) throw new BadRequestError("Deployment could not be loaded after update.");
  return jsonOk(toDeploymentRecord(full));
});
