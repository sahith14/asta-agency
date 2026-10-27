/**
 * AgencyOS — Project ↔ Website links API (Task 2-b).
 * POST   /api/projects/[id]/websites { websiteId }        → ProjectRecord (link added)
 * DELETE /api/projects/[id]/websites?websiteId=xxx        → ProjectRecord (link removed)
 * Websites must exist and belong to the project's client.
 */
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { requireFounder } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { PROJECT_TRANSITIONS, type ProjectRecord } from "@/lib/types";

// ---------------------------------------------------------------------------
// Includes + record mapping (mirrors ProjectRecord in src/lib/types.ts)
// ---------------------------------------------------------------------------

const projectInclude = {
  client: { select: { id: true, businessName: true } },
  websites: {
    orderBy: { createdAt: "asc" as const },
    select: { website: { select: { id: true, name: true, primaryDomain: true } } },
  },
  milestones: { orderBy: { position: "asc" as const } },
  _count: { select: { tasks: true, documents: true } },
} satisfies Prisma.ProjectInclude;

type ProjectWithIncludes = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;

function toProjectRecord(project: ProjectWithIncludes, completedTasks: number): ProjectRecord {
  const done = project.milestones.filter((m) => m.completedAt).length;
  const progress =
    project.milestones.length > 0
      ? Math.round((done / project.milestones.length) * 100)
      : project._count.tasks > 0
        ? Math.round((completedTasks / project._count.tasks) * 100)
        : 0;
  return {
    ...project,
    progress,
    allowedTransitions: [...(PROJECT_TRANSITIONS[project.status] ?? [])],
  } as unknown as ProjectRecord; // Dates serialize to ISO strings in JSON.
}

async function loadProjectRecord(id: string): Promise<ProjectRecord> {
  const [project, completedTasks] = await Promise.all([
    db.project.findUnique({ where: { id }, include: projectInclude }),
    db.task.count({ where: { projectId: id, status: "COMPLETED" } }),
  ]);
  if (!project) throw new NotFoundError("Project not found.");
  return toProjectRecord(project, completedTasks);
}

const linkWebsiteSchema = z.object({
  websiteId: z.string().min(1, "Website is required."),
});

// ---------------------------------------------------------------------------
// POST /api/projects/[id]/websites
// ---------------------------------------------------------------------------

export const POST = withAuth(async (req, user, { params }) => {
  // RBAC: linking websites to projects is founder-only.
  requireFounder(user);
  const { id } = await params;
  const body = await parseBody(req, linkWebsiteSchema);

  const project = await db.project.findUnique({
    where: { id },
    select: { id: true, name: true, clientId: true },
  });
  if (!project) throw new NotFoundError("Project not found.");

  const website = await db.website.findUnique({
    where: { id: body.websiteId },
    select: { id: true, name: true, clientId: true },
  });
  if (!website) throw new BadRequestError("Website not found.");
  if (website.clientId !== project.clientId) throw new BadRequestError("Website does not belong to this client.");

  const existing = await db.projectWebsite.findUnique({
    where: { projectId_websiteId: { projectId: id, websiteId: website.id } },
  });

  if (!existing) {
    await db.projectWebsite.create({ data: { projectId: id, websiteId: website.id } });
    await logActivity({
      action: "PROJECT_WEBSITE_LINKED",
      entityType: "PROJECT",
      entityId: id,
      entityLabel: project.name,
      summary: `Linked website "${website.name}" to project "${project.name}".`,
      actor: user,
      clientId: project.clientId,
      websiteId: website.id,
      projectId: id,
      metadata: { websiteId: website.id, websiteName: website.name },
    });
  }

  return jsonOk(await loadProjectRecord(id), { status: existing ? 200 : 201 });
});

// ---------------------------------------------------------------------------
// DELETE /api/projects/[id]/websites?websiteId=xxx
// ---------------------------------------------------------------------------

export const DELETE = withAuth(async (req, user, { params }) => {
  // RBAC: unlinking websites from projects is founder-only.
  requireFounder(user);
  const { id } = await params;
  const websiteId = new URL(req.url).searchParams.get("websiteId");
  if (!websiteId) throw new BadRequestError("websiteId query parameter is required.");

  const project = await db.project.findUnique({
    where: { id },
    select: { id: true, name: true, clientId: true },
  });
  if (!project) throw new NotFoundError("Project not found.");

  const website = await db.website.findUnique({
    where: { id: websiteId },
    select: { id: true, name: true },
  });
  if (!website) throw new NotFoundError("Website not found.");

  const deleted = await db.projectWebsite.deleteMany({ where: { projectId: id, websiteId } });
  if (deleted.count === 0) throw new NotFoundError("This website is not linked to the project.");

  await logActivity({
    action: "PROJECT_WEBSITE_UNLINKED",
    entityType: "PROJECT",
    entityId: id,
    entityLabel: project.name,
    summary: `Unlinked website "${website.name}" from project "${project.name}".`,
    actor: user,
    clientId: project.clientId,
    websiteId: website.id,
    projectId: id,
    metadata: { websiteId: website.id, websiteName: website.name },
  });

  return jsonOk(await loadProjectRecord(id));
});
