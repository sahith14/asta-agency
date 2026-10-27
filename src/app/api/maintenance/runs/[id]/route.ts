/**
 * AgencyOS — Maintenance run detail API (Phase 4).
 * GET   /api/maintenance/runs/[id] → MaintenanceRunDetailData
 *       (run + items + allowed transitions + latest 20 website documents for
 *        evidence selection)
 * PATCH /api/maintenance/runs/[id] → editable only while PLANNED/IN_PROGRESS.
 */
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { requireModule, requireModuleWrite } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { toDateOrNull } from "@/lib/parse-date";
import { MAINTENANCE_RUN_TRANSITIONS } from "@/lib/types";
import { runIncludeWithItems, toRunRecord, toItemRecord } from "../../record";

// ---------------------------------------------------------------------------
// GET /api/maintenance/runs/[id]
// ---------------------------------------------------------------------------

export const GET = withAuth(async (_req, user, { params }) => {
  // RBAC: maintenance read — founder/developer/support; managers/staff denied.
  requireModule(user, "maintenance");
  const { id } = await params;

  const run = await db.maintenanceRun.findUnique({ where: { id }, include: runIncludeWithItems });
  if (!run) throw new NotFoundError("Maintenance run not found.");

  const documents = await db.document.findMany({
    where: { websiteId: run.websiteId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, fileName: true },
  });

  return jsonOk({
    run: toRunRecord(run),
    items: run.items.map((item) => toItemRecord(item)),
    allowedTransitions: [...(MAINTENANCE_RUN_TRANSITIONS[run.status] ?? [])],
    documents,
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/maintenance/runs/[id]
// ---------------------------------------------------------------------------

const patchRunSchema = z.object({
  workNotes: z.string().max(20000).nullish(),
  timeSpentMinutes: z.number().int().min(0).max(10000).nullish(),
  assignedToId: z.string().min(1).nullish(),
  scheduledDate: z.string().min(1).optional(),
});

export const PATCH = withAuth(async (req, user, { params }) => {
  // RBAC: editing runs is founder + developer.
  requireModuleWrite(user, "maintenance");
  const { id } = await params;
  const body = await parseBody(req, patchRunSchema);

  const run = await db.maintenanceRun.findUnique({ where: { id } });
  if (!run) throw new NotFoundError("Maintenance run not found.");

  if (run.status !== "PLANNED" && run.status !== "IN_PROGRESS") {
    throw new BadRequestError("Only planned or in-progress runs can be edited.");
  }

  if (body.assignedToId) {
    const assignee = await db.user.findUnique({ where: { id: body.assignedToId }, select: { id: true } });
    if (!assignee) throw new BadRequestError("Assignee not found.");
  }

  let scheduledDate: Date | undefined;
  if (body.scheduledDate !== undefined) {
    scheduledDate = toDateOrNull(body.scheduledDate) ?? undefined;
    if (!scheduledDate) throw new BadRequestError("Provide a valid scheduled date.");
  }

  const data: Prisma.MaintenanceRunUpdateInput = {
    ...(body.workNotes !== undefined ? { workNotes: body.workNotes ?? null } : {}),
    ...(body.timeSpentMinutes !== undefined ? { timeSpentMinutes: body.timeSpentMinutes ?? null } : {}),
    ...(body.assignedToId !== undefined ? { assignedToId: body.assignedToId ?? null } : {}),
    ...(scheduledDate !== undefined ? { scheduledDate } : {}),
  };

  const updated = await db.maintenanceRun.update({ where: { id }, data });

  await logActivity({
    action: "MAINTENANCE_RUN_UPDATED",
    entityType: "MAINTENANCE_RUN",
    entityId: updated.id,
    summary: `Maintenance run updated (${updated.status.toLowerCase()}).`,
    actor: user,
    websiteId: updated.websiteId,
  });

  const full = await db.maintenanceRun.findUnique({ where: { id }, include: runIncludeWithItems });
  if (!full) throw new BadRequestError("Run could not be loaded after update.");
  return jsonOk(toRunRecord(full));
});
