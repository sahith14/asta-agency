/**
 * /api/websites/[id] — detail with client/domains + recent tasks (GET),
 * partial update (PATCH), archive (DELETE).
 */
import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth, parseBody, jsonOk, BadRequestError, ConflictError, NotFoundError } from "@/lib/api";
import { assertWebsiteAccess, requireFounder } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import {
  WEBSITE_LIFECYCLE,
  WEBSITE_ENVIRONMENTS,
  MAINTENANCE_COVERAGES,
  OPEN_TASK_STATUSES,
  type WebsiteRecord,
  type TaskRecord,
} from "@/lib/types";
import { toDateOrNull } from "@/lib/parse-date";

// ---------------------------------------------------------------------------
// Helpers + validation
// ---------------------------------------------------------------------------

function normalizeDomain(value: string | null | undefined): string | null {
  const s = typeof value === "string" ? value.trim().toLowerCase() : "";
  return s.length > 0 ? s : null;
}

function trimToNull(value: string | null | undefined): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s.length > 0 ? s : null;
}

const websiteUpdateSchema = z.object({
  clientId: z.string().min(1).optional(),
  name: z.string().trim().min(1, "Name is required.").max(160).optional(),
  primaryDomain: z.string().trim().max(253).nullable().optional(),
  lifecycleStatus: z.enum(WEBSITE_LIFECYCLE).optional(),
  environment: z.enum(WEBSITE_ENVIRONMENTS).optional(),
  websiteType: z.string().trim().max(60).nullable().optional(),
  framework: z.string().trim().max(120).nullable().optional(),
  repositoryUrl: z.string().trim().max(500).nullable().optional(),
  hostingProvider: z.string().trim().max(160).nullable().optional(),
  productionUrl: z.string().trim().max(500).nullable().optional(),
  stagingUrl: z.string().trim().max(500).nullable().optional(),
  deploymentProjectRef: z.string().trim().max(160).nullable().optional(),
  domainRenewalDate: z.union([z.string(), z.null()]).optional(),
  sslExpiryDate: z.union([z.string(), z.null()]).optional(),
  maintenanceCoverage: z.enum(MAINTENANCE_COVERAGES).optional(),
  launchDate: z.union([z.string(), z.null()]).optional(),
  technicalNotes: z.string().trim().max(20000).nullable().optional(),
});

const TASK_INCLUDE = {
  client: { select: { id: true, businessName: true } },
  website: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
  assignee: { select: { id: true, displayName: true } },
  createdBy: { select: { id: true, displayName: true } },
} satisfies Prisma.TaskInclude;

// ---------------------------------------------------------------------------
// GET — { website (incl. client + domains), tasks (latest 20) }
// ---------------------------------------------------------------------------

export const GET = withAuth(async (_req: NextRequest, user, { params }) => {
  const { id } = await params;
  const website = await db.website.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, businessName: true } },
      domains: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!website) throw new NotFoundError("Website not found");
  // RBAC: website read — founder/support; developer only when linked to an assigned project (managers denied).
  await assertWebsiteAccess(user, id, false);

  const tasks = await db.task.findMany({
    where: { websiteId: id },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: TASK_INCLUDE,
  });

  const now = Date.now();
  const taskRecords = tasks.map((t) => ({
    ...t,
    isOverdue:
      Boolean(t.dueAt) &&
      t.dueAt!.getTime() < now &&
      (OPEN_TASK_STATUSES as readonly string[]).includes(t.status),
  })) as unknown as TaskRecord[];

  return jsonOk({ website: website as unknown as WebsiteRecord, tasks: taskRecords });
});

// ---------------------------------------------------------------------------
// PATCH — partial update (validates client move + duplicate domain)
// ---------------------------------------------------------------------------

export const PATCH = withAuth(async (req: NextRequest, user, { params }) => {
  // RBAC: editing a website is founder-only.
  requireFounder(user);
  const { id } = await params;
  const existing = await db.website.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Website not found");

  const parsed = await parseBody(req, websiteUpdateSchema);

  const data: Prisma.WebsiteUpdateInput = {};
  if (parsed.clientId !== undefined) {
    const clientExists = await db.client.findUnique({
      where: { id: parsed.clientId },
      select: { id: true },
    });
    if (!clientExists) throw new BadRequestError("Client does not exist.");
    data.client = { connect: { id: parsed.clientId } };
  }
  if (parsed.name !== undefined) data.name = parsed.name;
  if (parsed.primaryDomain !== undefined) data.primaryDomain = normalizeDomain(parsed.primaryDomain);
  if (parsed.lifecycleStatus !== undefined) data.lifecycleStatus = parsed.lifecycleStatus;
  if (parsed.environment !== undefined) data.environment = parsed.environment;
  if (parsed.websiteType !== undefined) data.websiteType = trimToNull(parsed.websiteType);
  if (parsed.framework !== undefined) data.framework = trimToNull(parsed.framework);
  if (parsed.repositoryUrl !== undefined) data.repositoryUrl = trimToNull(parsed.repositoryUrl);
  if (parsed.hostingProvider !== undefined) data.hostingProvider = trimToNull(parsed.hostingProvider);
  if (parsed.productionUrl !== undefined) data.productionUrl = trimToNull(parsed.productionUrl);
  if (parsed.stagingUrl !== undefined) data.stagingUrl = trimToNull(parsed.stagingUrl);
  if (parsed.deploymentProjectRef !== undefined) {
    data.deploymentProjectRef = trimToNull(parsed.deploymentProjectRef);
  }
  if (parsed.domainRenewalDate !== undefined) {
    data.domainRenewalDate = toDateOrNull(parsed.domainRenewalDate);
  }
  if (parsed.sslExpiryDate !== undefined) data.sslExpiryDate = toDateOrNull(parsed.sslExpiryDate);
  if (parsed.maintenanceCoverage !== undefined) data.maintenanceCoverage = parsed.maintenanceCoverage;
  if (parsed.launchDate !== undefined) data.launchDate = toDateOrNull(parsed.launchDate);
  if (parsed.technicalNotes !== undefined) data.technicalNotes = trimToNull(parsed.technicalNotes);

  const effectiveClientId = parsed.clientId ?? existing.clientId;
  const effectiveDomain =
    parsed.primaryDomain !== undefined
      ? normalizeDomain(parsed.primaryDomain)
      : existing.primaryDomain;
  if (effectiveDomain) {
    const siblings = await db.website.findMany({
      where: {
        clientId: effectiveClientId,
        archivedAt: null,
        id: { not: id },
        primaryDomain: { contains: effectiveDomain },
      },
      select: { id: true, name: true, primaryDomain: true },
    });
    const duplicate = siblings.find(
      (w) => (w.primaryDomain ?? "").trim().toLowerCase() === effectiveDomain
    );
    if (duplicate) {
      throw new ConflictError(
        `This client already has a website for domain ${duplicate.primaryDomain} (${duplicate.name}).`
      );
    }
  }

  const updated =
    Object.keys(data).length > 0 ? await db.website.update({ where: { id }, data }) : existing;

  await logActivity({
    action: "WEBSITE_UPDATED",
    entityType: "WEBSITE",
    entityId: id,
    entityLabel: updated.name,
    summary: `Updated website ${updated.name}`,
    actor: user,
    clientId: updated.clientId,
    websiteId: id,
    metadata: { changed: Object.keys(data) },
  });

  return jsonOk(updated as unknown as WebsiteRecord);
});

// ---------------------------------------------------------------------------
// DELETE — archive (sets archivedAt; never hard delete)
// ---------------------------------------------------------------------------

export const DELETE = withAuth(async (_req: NextRequest, user, { params }) => {
  // RBAC: archiving a website is founder-only.
  requireFounder(user);
  const { id } = await params;
  const existing = await db.website.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Website not found");

  await db.website.update({ where: { id }, data: { archivedAt: new Date() } });

  await logActivity({
    action: "WEBSITE_ARCHIVED",
    entityType: "WEBSITE",
    entityId: id,
    entityLabel: existing.name,
    summary: `Archived website ${existing.name}`,
    actor: user,
    clientId: existing.clientId,
    websiteId: id,
  });

  return jsonOk({});
});
