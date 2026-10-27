/**
 * AgencyOS — Deployments API (Phase 4).
 * GET  /api/deployments?websiteId&status&environment&page&pageSize
 *   → Paginated<DeploymentRecord> (startedAt desc)
 * POST /api/deployments → records a deployment (status QUEUED, startedAt now).
 * Nothing is deployed by AgencyOS — this records reality; provider-webhook
 * updates or human status changes keep it honest.
 */
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, jsonOk, parseBody, parseQuery, withAuth } from "@/lib/api";
import { requireModule, requireModuleWrite } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { DEPLOYMENT_ENVIRONMENTS, DEPLOYMENT_STATUSES, type DeploymentRecord, type Paginated } from "@/lib/types";
import { commitShaSchema, deploymentInclude, normaliseCommitSha, toDeploymentRecord } from "./record";

/** CSV/list query param validated against an enum — unknown token → 400. */
function parseEnumListParam(raw: string | null, allowed: readonly string[], label: string): string[] | null {
  if (!raw) return null;
  const tokens = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (tokens.length === 0) return null;
  for (const token of tokens) {
    if (!allowed.includes(token)) {
      throw new BadRequestError(`Invalid ${label} "${token}". Allowed: ${allowed.join(", ")}.`);
    }
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// GET /api/deployments
// ---------------------------------------------------------------------------

export const GET = withAuth(async (req, user) => {
  // RBAC: deployment history read — founder/developer/support; managers/staff denied.
  requireModule(user, "deployments");
  const query = parseQuery(req);
  const sp = new URL(req.url).searchParams;

  const where: Prisma.DeploymentWhereInput = {};

  const statuses = parseEnumListParam(sp.get("status"), DEPLOYMENT_STATUSES, "status");
  if (statuses) where.status = { in: statuses };

  const environments = parseEnumListParam(sp.get("environment"), DEPLOYMENT_ENVIRONMENTS, "environment");
  if (environments) where.environment = { in: environments };

  if (query.websiteId) where.websiteId = query.websiteId;

  const [rows, total] = await Promise.all([
    db.deployment.findMany({
      where,
      include: deploymentInclude,
      orderBy: { startedAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.deployment.count({ where }),
  ]);

  const data: Paginated<DeploymentRecord> = {
    items: rows.map((row) => toDeploymentRecord(row)),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
  };
  return jsonOk(data);
});

// ---------------------------------------------------------------------------
// POST /api/deployments
// ---------------------------------------------------------------------------

const createDeploymentSchema = z.object({
  websiteId: z.string().min(1),
  environment: z.enum(DEPLOYMENT_ENVIRONMENTS),
  provider: z.string().max(40).nullish(),
  repositoryRef: z.string().max(200).nullish(),
  commitSha: commitShaSchema.nullish(),
  deploymentRef: z.string().max(200).nullish(),
  projectId: z.string().min(1).nullish(),
  rollbackOfId: z.string().min(1).nullish(),
  notes: z.string().max(5000).nullish(),
});

export const POST = withAuth(async (req, user) => {
  // RBAC: recording deployments is founder + developer.
  requireModuleWrite(user, "deployments");
  const body = await parseBody(req, createDeploymentSchema);

  const website = await db.website.findUnique({
    where: { id: body.websiteId },
    select: { id: true, name: true, clientId: true },
  });
  if (!website) throw new BadRequestError("Website not found.");

  if (body.projectId) {
    const project = await db.project.findUnique({ where: { id: body.projectId }, select: { id: true } });
    if (!project) throw new BadRequestError("Project not found.");
  }

  if (body.rollbackOfId) {
    const rollbackOf = await db.deployment.findUnique({
      where: { id: body.rollbackOfId },
      select: { id: true, websiteId: true },
    });
    if (!rollbackOf) throw new BadRequestError("Rollback target deployment was not found.");
    if (rollbackOf.websiteId !== body.websiteId) {
      throw new BadRequestError("The rollback target must be a deployment of the same website.");
    }
  }

  const now = new Date();
  const created = await db.deployment.create({
    data: {
      websiteId: body.websiteId,
      projectId: body.projectId ?? null,
      environment: body.environment,
      provider: body.provider?.trim() || null,
      repositoryRef: body.repositoryRef?.trim() || null,
      commitSha: normaliseCommitSha(body.commitSha ?? undefined) ?? null,
      deploymentRef: body.deploymentRef?.trim() || null,
      initiatedById: user.id,
      startedAt: now,
      status: "QUEUED",
      notes: body.notes ?? null,
      rollbackOfId: body.rollbackOfId ?? null,
    },
  });

  await logActivity({
    action: "DEPLOYMENT_CREATED",
    entityType: "DEPLOYMENT",
    entityId: created.id,
    summary: `Deployment recorded for ${website.name} (${body.environment.toLowerCase()}${created.provider ? `, ${created.provider}` : ""}).`,
    actor: user,
    clientId: website.clientId,
    websiteId: website.id,
  });

  const full = await db.deployment.findUnique({ where: { id: created.id }, include: deploymentInclude });
  if (!full) throw new BadRequestError("Deployment could not be loaded after creation.");
  return jsonOk(toDeploymentRecord(full), { status: 201 });
});
