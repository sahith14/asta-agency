/**
 * AgencyOS — Project status transition API (Task 2-b).
 * PATCH /api/projects/[id]/status { status } → ProjectRecord
 * Validates PROJECT_TRANSITIONS; sets completedAt when moving to COMPLETED. AUDIT log.
 */
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { requireFounder } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { PROJECT_STATUSES, PROJECT_TRANSITIONS, label, type ProjectRecord } from "@/lib/types";

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

const statusSchema = z.object({
  status: z.enum(PROJECT_STATUSES, { message: "Invalid project status." }),
});

// ---------------------------------------------------------------------------
// PATCH /api/projects/[id]/status
// ---------------------------------------------------------------------------

export const PATCH = withAuth(async (req, user, { params }) => {
  // RBAC: project status transitions are founder-only.
  requireFounder(user);
  const { id } = await params;
  const body = await parseBody(req, statusSchema);

  const existing = await db.project.findUnique({
    where: { id },
    select: { id: true, name: true, status: true, completedAt: true, clientId: true },
  });
  if (!existing) throw new NotFoundError("Project not found.");

  if (body.status !== existing.status) {
    const allowed = PROJECT_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(body.status)) {
      const allowedText = allowed.length > 0 ? allowed.map(label).join(", ") : "none";
      throw new BadRequestError(
        `Cannot move project from ${label(existing.status)} to ${label(body.status)}. Allowed: ${allowedText}.`
      );
    }
  }

  await db.project.update({
    where: { id },
    data: {
      status: body.status,
      ...(body.status === "COMPLETED" && !existing.completedAt ? { completedAt: new Date() } : {}),
    },
  });

  await logActivity({
    action: "PROJECT_STATUS_CHANGED",
    entityType: "PROJECT",
    entityId: id,
    entityLabel: existing.name,
    summary: `Project "${existing.name}" status changed: ${label(existing.status)} → ${label(body.status)}.`,
    actor: user,
    kind: "AUDIT",
    clientId: existing.clientId,
    projectId: id,
    metadata: { from: existing.status, to: body.status },
  });

  const [updated, completedTasks] = await Promise.all([
    db.project.findUnique({ where: { id }, include: projectInclude }),
    db.task.count({ where: { projectId: id, status: "COMPLETED" } }),
  ]);
  if (!updated) throw new NotFoundError("Project not found.");
  return jsonOk(toProjectRecord(updated, completedTasks));
});
