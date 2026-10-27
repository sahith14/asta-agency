/**
 * /api/websites — paginated website list (GET) + create (POST).
 * Archived websites are excluded unless `archived=1`.
 */
import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  withAuth,
  parseBody,
  parseQuery,
  jsonOk,
  BadRequestError,
  ConflictError,
} from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { requireModule, requireFounder } from "@/lib/rbac";
import {
  WEBSITE_LIFECYCLE,
  WEBSITE_ENVIRONMENTS,
  MAINTENANCE_COVERAGES,
  type WebsiteRecord,
  type Paginated,
} from "@/lib/types";
import { toDateOrNull } from "@/lib/parse-date";

// ---------------------------------------------------------------------------
// Helpers + validation
// ---------------------------------------------------------------------------

function oneOf<T extends readonly string[]>(
  allowed: T,
  value: string | null | undefined
): T[number] | undefined {
  if (!value) return undefined;
  return (allowed as readonly string[]).includes(value) ? (value as T[number]) : undefined;
}

function normalizeDomain(value: string | null | undefined): string | null {
  const s = typeof value === "string" ? value.trim().toLowerCase() : "";
  return s.length > 0 ? s : null;
}

function trimToNull(value: string | null | undefined): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s.length > 0 ? s : null;
}

const websiteCreateSchema = z.object({
  clientId: z.string().min(1, "Client is required."),
  name: z.string().trim().min(1, "Name is required.").max(160),
  primaryDomain: z.string().trim().max(253).nullish().transform(normalizeDomain),
  lifecycleStatus: z.enum(WEBSITE_LIFECYCLE).default("PLANNED"),
  environment: z.enum(WEBSITE_ENVIRONMENTS).default("PRODUCTION"),
  websiteType: z.string().trim().max(60).nullish().transform(trimToNull),
  framework: z.string().trim().max(120).nullish().transform(trimToNull),
  repositoryUrl: z.string().trim().max(500).nullish().transform(trimToNull),
  hostingProvider: z.string().trim().max(160).nullish().transform(trimToNull),
  productionUrl: z.string().trim().max(500).nullish().transform(trimToNull),
  stagingUrl: z.string().trim().max(500).nullish().transform(trimToNull),
  deploymentProjectRef: z.string().trim().max(160).nullish().transform(trimToNull),
  domainRenewalDate: z.union([z.string(), z.null()]).optional().transform(toDateOrNull),
  sslExpiryDate: z.union([z.string(), z.null()]).optional().transform(toDateOrNull),
  maintenanceCoverage: z.enum(MAINTENANCE_COVERAGES).default("NONE"),
  launchDate: z.union([z.string(), z.null()]).optional().transform(toDateOrNull),
  technicalNotes: z.string().trim().max(20000).nullish().transform(trimToNull),
});

const WEBSITE_SORT_FIELDS = ["name", "createdAt", "updatedAt", "lifecycleStatus"] as const;

// ---------------------------------------------------------------------------
// GET /api/websites — Paginated<WebsiteRecord>
// ---------------------------------------------------------------------------

export const GET = withAuth(async (req: NextRequest, user) => {
  // RBAC: websites read — founder/support all; developers only websites linked to their assigned projects; managers/staff denied.
  requireModule(user, "websites");
  const query = parseQuery(req);
  const url = req.nextUrl;
  const search = (query.search ?? url.searchParams.get("q")?.trim()) || undefined;
  const lifecycle = oneOf(WEBSITE_LIFECYCLE, query.status ?? url.searchParams.get("lifecycle"));
  const clientId = query.clientId;
  const onlyArchived = url.searchParams.get("archived") === "1";

  const where: Prisma.WebsiteWhereInput = {
    archivedAt: onlyArchived ? { not: null } : null,
  };
  if (lifecycle) where.lifecycleStatus = lifecycle;
  if (clientId) where.clientId = clientId;
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { primaryDomain: { contains: search } },
      { productionUrl: { contains: search } },
    ];
  }
  // Record scope: developers are limited to websites on their assigned projects.
  if (user.role === "WEB_DEVELOPER") {
    const devProjects = await db.project.findMany({
      where: { assignedDeveloperId: user.id },
      select: { id: true },
    });
    where.projectLinks = { some: { projectId: { in: devProjects.map((p) => p.id) } } };
  }

  const sortParam = oneOf(WEBSITE_SORT_FIELDS, query.sort);
  const sortKey = sortParam ?? "createdAt";
  const dir = sortParam ? query.dir : "desc";
  const orderBy = { [sortKey]: dir } as Prisma.WebsiteOrderByWithRelationInput;

  const [total, rows] = await Promise.all([
    db.website.count({ where }),
    db.website.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        client: { select: { id: true, businessName: true } },
        // Website↔Project is many-to-many via ProjectWebsite (`projectLinks`);
        // map its count to `projects` to match the WebsiteRecord contract.
        _count: { select: { tasks: true, documents: true, projectLinks: true } },
      },
    }),
  ]);
  const items = rows.map((w) => {
    const { _count, ...website } = w;
    return {
      ...website,
      _count: { tasks: _count.tasks, projects: _count.projectLinks, documents: _count.documents },
    };
  });

  const payload: Paginated<WebsiteRecord> = {
    items: items as unknown as WebsiteRecord[],
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
  };
  return jsonOk(payload);
});

// ---------------------------------------------------------------------------
// POST /api/websites — create (client must exist; duplicate domain conflict)
// ---------------------------------------------------------------------------

export const POST = withAuth(async (req: NextRequest, user) => {
  // RBAC: creating websites is founder-only.
  requireFounder(user);
  const parsed = await parseBody(req, websiteCreateSchema);

  const client = await db.client.findUnique({
    where: { id: parsed.clientId },
    select: { id: true, businessName: true },
  });
  if (!client) throw new BadRequestError("Client does not exist.");

  if (parsed.primaryDomain) {
    const siblings = await db.website.findMany({
      where: {
        clientId: parsed.clientId,
        archivedAt: null,
        primaryDomain: { contains: parsed.primaryDomain },
      },
      select: { id: true, name: true, primaryDomain: true },
    });
    const duplicate = siblings.find(
      (w) => (w.primaryDomain ?? "").trim().toLowerCase() === parsed.primaryDomain
    );
    if (duplicate) {
      throw new ConflictError(
        `This client already has a website for domain ${duplicate.primaryDomain} (${duplicate.name}).`
      );
    }
  }

  const website = await db.website.create({
    data: {
      clientId: parsed.clientId,
      name: parsed.name,
      primaryDomain: parsed.primaryDomain,
      lifecycleStatus: parsed.lifecycleStatus,
      environment: parsed.environment,
      websiteType: parsed.websiteType,
      framework: parsed.framework,
      repositoryUrl: parsed.repositoryUrl,
      hostingProvider: parsed.hostingProvider,
      productionUrl: parsed.productionUrl,
      stagingUrl: parsed.stagingUrl,
      deploymentProjectRef: parsed.deploymentProjectRef,
      domainRenewalDate: parsed.domainRenewalDate,
      sslExpiryDate: parsed.sslExpiryDate,
      maintenanceCoverage: parsed.maintenanceCoverage,
      launchDate: parsed.launchDate,
      technicalNotes: parsed.technicalNotes,
    },
  });

  await logActivity({
    action: "WEBSITE_CREATED",
    entityType: "WEBSITE",
    entityId: website.id,
    entityLabel: website.name,
    summary: `Created website ${website.name} for ${client.businessName}`,
    actor: user,
    clientId: client.id,
    websiteId: website.id,
  });

  return jsonOk(website as unknown as WebsiteRecord, { status: 201 });
});
