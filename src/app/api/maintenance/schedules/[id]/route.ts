/**
 * AgencyOS — Maintenance schedule detail API (Phase 4).
 * GET    /api/maintenance/schedules/[id] → MaintenanceScheduleRecord
 * PATCH  /api/maintenance/schedules/[id] → editable fields (validated)
 * DELETE /api/maintenance/schedules/[id] → hard-deletes the schedule. Runs are
 *        KEPT (scheduleId is set null by the schema) — the frontend confirm
 *        copy must say so.
 */
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { requireModule, requireModuleWrite } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { MAINTENANCE_FREQUENCIES } from "@/lib/types";
import {
  createScheduleSchema,
  parseRequiredDate,
  scheduleInclude,
  toScheduleRecord,
  validateScheduleRefs,
} from "../../record";

// ---------------------------------------------------------------------------
// GET /api/maintenance/schedules/[id]
// ---------------------------------------------------------------------------

export const GET = withAuth(async (_req, user, { params }) => {
  // RBAC: maintenance read — founder/developer/support; managers/staff denied.
  requireModule(user, "maintenance");
  const { id } = await params;
  const schedule = await db.maintenanceSchedule.findUnique({ where: { id }, include: scheduleInclude });
  if (!schedule) throw new NotFoundError("Maintenance schedule not found.");
  return jsonOk(toScheduleRecord(schedule));
});

// ---------------------------------------------------------------------------
// PATCH /api/maintenance/schedules/[id]
// ---------------------------------------------------------------------------

const patchSchema = z.object({
  websiteId: z.string().min(1).optional(),
  name: z.string().min(1).max(120).optional(),
  frequency: z.enum(MAINTENANCE_FREQUENCIES).optional(),
  nextDueDate: z.string().min(1).optional(),
  planId: z.string().min(1).nullish(),
  assignedToId: z.string().min(1).nullish(),
  checklistTemplate: createScheduleSchema.shape.checklistTemplate,
  notes: z.string().max(5000).nullish(),
  isActive: z.boolean().optional(),
});

export const PATCH = withAuth(async (req, user, { params }) => {
  // RBAC: editing schedules is founder + developer.
  requireModuleWrite(user, "maintenance");
  const { id } = await params;
  const body = await parseBody(req, patchSchema);

  const existing = await db.maintenanceSchedule.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Maintenance schedule not found.");

  const { clientId } = await validateScheduleRefs({
    ...(body.websiteId !== undefined ? { websiteId: body.websiteId } : {}),
    ...(body.planId !== undefined ? { planId: body.planId } : {}),
    ...(body.assignedToId !== undefined ? { assignedToId: body.assignedToId } : {}),
  });

  const nextDueDate = body.nextDueDate !== undefined ? parseRequiredDate(body.nextDueDate, "next due") : undefined;

  const data: Prisma.MaintenanceScheduleUpdateInput = {
    ...(body.websiteId !== undefined ? { website: { connect: { id: body.websiteId } } } : {}),
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.frequency !== undefined ? { frequency: body.frequency } : {}),
    ...(nextDueDate !== undefined ? { nextDueDate } : {}),
    ...(body.planId !== undefined ? { plan: body.planId ? { connect: { id: body.planId } } : { disconnect: true } } : {}),
    ...(body.assignedToId !== undefined ? { assignedToId: body.assignedToId ?? null } : {}),
    ...(body.checklistTemplate !== undefined
      ? { checklistTemplate: body.checklistTemplate ? JSON.stringify(body.checklistTemplate) : null }
      : {}),
    ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
    ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
  };

  const updated = await db.maintenanceSchedule.update({ where: { id }, data });

  await logActivity({
    action: "MAINTENANCE_SCHEDULE_UPDATED",
    entityType: "MAINTENANCE_SCHEDULE",
    entityId: updated.id,
    entityLabel: updated.name,
    summary: `Maintenance schedule "${updated.name}" updated.`,
    actor: user,
    clientId,
    websiteId: updated.websiteId,
  });

  const full = await db.maintenanceSchedule.findUnique({ where: { id }, include: scheduleInclude });
  if (!full) throw new BadRequestError("Schedule could not be loaded after update.");
  return jsonOk(toScheduleRecord(full));
});

// ---------------------------------------------------------------------------
// DELETE /api/maintenance/schedules/[id]
// ---------------------------------------------------------------------------

export const DELETE = withAuth(async (_req, user, { params }) => {
  // RBAC: deleting schedules is founder + developer.
  requireModuleWrite(user, "maintenance");
  const { id } = await params;

  const existing = await db.maintenanceSchedule.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Maintenance schedule not found.");

  await db.maintenanceSchedule.delete({ where: { id } });

  await logActivity({
    action: "MAINTENANCE_SCHEDULE_DELETED",
    entityType: "MAINTENANCE_SCHEDULE",
    entityId: existing.id,
    entityLabel: existing.name,
    summary: `Maintenance schedule "${existing.name}" deleted — past runs were kept (schedule detached).`,
    actor: user,
    websiteId: existing.websiteId,
  });

  return jsonOk({ ok: true });
});
