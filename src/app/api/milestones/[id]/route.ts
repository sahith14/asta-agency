/**
 * AgencyOS — Milestone API (Task 2-b).
 * PATCH  /api/milestones/[id] { title?, dueDate?, completed? } → MilestoneRecord
 * DELETE /api/milestones/[id] → { id }
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { requireFounder } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import type { MilestoneRecord } from "@/lib/types";
import { toDateOrNull } from "@/lib/parse-date";

/** Tolerant date input: absent → undefined (untouched), ""/invalid → null, else Date. */
const dateInput = z.unknown().optional().transform((v) => (v === undefined ? undefined : toDateOrNull(v)));

const patchMilestoneSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Milestone title is required.")
    .max(200, "Milestone title must be at most 200 characters.")
    .optional(),
  dueDate: dateInput,
  completed: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// PATCH /api/milestones/[id]
// ---------------------------------------------------------------------------

export const PATCH = withAuth(async (req, user, { params }) => {
  // RBAC: editing milestones is founder-only (founder owns project structure).
  requireFounder(user);
  const { id } = await params;
  const body = await parseBody(req, patchMilestoneSchema);

  const existing = await db.milestone.findUnique({
    where: { id },
    include: { project: { select: { id: true, name: true, clientId: true } } },
  });
  if (!existing) throw new NotFoundError("Milestone not found.");

  const data: { title?: string; dueDate?: Date | null; completedAt?: Date | null } = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.dueDate !== undefined) data.dueDate = body.dueDate;
  // completed=true stamps completedAt; completed=false clears it.
  if (body.completed === true) data.completedAt = new Date();
  else if (body.completed === false) data.completedAt = null;

  const milestone = await db.milestone.update({ where: { id }, data });

  const finalTitle = milestone.title;
  await logActivity({
    action: body.completed === true ? "MILESTONE_COMPLETED" : "MILESTONE_UPDATED",
    entityType: "MILESTONE",
    entityId: id,
    entityLabel: finalTitle,
    summary:
      body.completed === true
        ? `Completed milestone "${finalTitle}" on project "${existing.project.name}".`
        : `Updated milestone "${finalTitle}" on project "${existing.project.name}".`,
    actor: user,
    clientId: existing.project.clientId,
    projectId: existing.project.id,
    metadata: {
      milestoneId: id,
      fields: [
        ...(body.title !== undefined ? ["title"] : []),
        ...(body.dueDate !== undefined ? ["dueDate"] : []),
        ...(body.completed !== undefined ? ["completed"] : []),
      ],
    },
  });

  return jsonOk(milestone as unknown as MilestoneRecord);
});

// ---------------------------------------------------------------------------
// DELETE /api/milestones/[id]
// ---------------------------------------------------------------------------

export const DELETE = withAuth(async (req, user, { params }) => {
  // RBAC: deleting milestones is founder-only (founder owns project structure).
  requireFounder(user);
  const { id } = await params;
  const existing = await db.milestone.findUnique({
    where: { id },
    include: { project: { select: { id: true, name: true, clientId: true } } },
  });
  if (!existing) throw new NotFoundError("Milestone not found.");

  await db.milestone.delete({ where: { id } });

  await logActivity({
    action: "MILESTONE_DELETED",
    entityType: "MILESTONE",
    entityId: id,
    entityLabel: existing.title,
    summary: `Deleted milestone "${existing.title}" from project "${existing.project.name}".`,
    actor: user,
    clientId: existing.project.clientId,
    projectId: existing.project.id,
    metadata: { milestoneId: id },
  });

  return jsonOk({ id });
});
