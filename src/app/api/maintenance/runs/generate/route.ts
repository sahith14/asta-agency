/**
 * AgencyOS — Maintenance run generation API (Phase 4).
 * POST /api/maintenance/runs/generate { scheduleId }
 * Creates one PLANNED run at the schedule's nextDueDate from its checklist
 * template. Duplicate-guarded: an existing PLANNED/IN_PROGRESS run for the
 * same schedule + date → 409. Nothing runs automatically — a human completes
 * the run; completing it advances the schedule's nextDueDate.
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, ConflictError, NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { requireModuleWrite } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { runIncludeWithItems, parseChecklistTemplate, toRunRecord } from "../../record";

const generateSchema = z.object({
  scheduleId: z.string().min(1),
});

export const POST = withAuth(async (req, user) => {
  // RBAC: generating runs from schedules is founder + developer.
  requireModuleWrite(user, "maintenance");
  const body = await parseBody(req, generateSchema);

  const schedule = await db.maintenanceSchedule.findUnique({
    where: { id: body.scheduleId },
    include: { website: { select: { id: true, name: true, clientId: true } } },
  });
  if (!schedule) throw new NotFoundError("Maintenance schedule not found.");

  const scheduledDate = schedule.nextDueDate;

  const created = await db.$transaction(async (tx) => {
    // Duplicate guard inside the transaction (SQLite serialises writes, this
    // closes the check-then-create window for concurrent manual clicks).
    const duplicate = await tx.maintenanceRun.findFirst({
      where: { scheduleId: schedule.id, scheduledDate, status: { in: ["PLANNED", "IN_PROGRESS"] } },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictError("A planned run for this schedule and date already exists.");
    }

    return tx.maintenanceRun.create({
      data: {
        websiteId: schedule.websiteId,
        scheduleId: schedule.id,
        scheduledDate,
        status: "PLANNED",
        assignedToId: schedule.assignedToId,
        items: {
          create: parseChecklistTemplate(schedule.checklistTemplate).map((label, index) => ({ position: index, label })),
        },
      },
    });
  });

  await logActivity({
    action: "MAINTENANCE_RUN_GENERATED",
    entityType: "MAINTENANCE_RUN",
    entityId: created.id,
    summary: `Run generated from schedule "${schedule.name}" for ${schedule.website.name} (${scheduledDate.toISOString().slice(0, 10)}).`,
    actor: user,
    clientId: schedule.website.clientId,
    websiteId: schedule.websiteId,
  });

  const full = await db.maintenanceRun.findUnique({ where: { id: created.id }, include: runIncludeWithItems });
  if (!full) throw new BadRequestError("Run could not be loaded after creation.");
  return jsonOk(toRunRecord(full), { status: 201 });
});
