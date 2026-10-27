/**
 * AgencyOS — Maintenance run status transitions API (Phase 4).
 * POST /api/maintenance/runs/[id]/status { action }
 * Validated against MAINTENANCE_RUN_TRANSITIONS. COMPLETED requires every
 * checklist item resolved (anything but PENDING); completing a scheduled run
 * advances the schedule's nextDueDate by the frequency (and stamps the run's
 * nextScheduledDate with the same real date).
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { requireModuleWrite } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { MAINTENANCE_FREQUENCIES_DAYS, MAINTENANCE_RUN_TRANSITIONS } from "@/lib/types";
import { runIncludeWithItems, toRunRecord } from "../../../record";

const statusSchema = z.object({
  action: z.string().min(1),
});

export const POST = withAuth(async (req, user, { params }) => {
  // RBAC: run status transitions are founder + developer.
  requireModuleWrite(user, "maintenance");
  const { id } = await params;
  const body = await parseBody(req, statusSchema);

  const run = await db.maintenanceRun.findUnique({
    where: { id },
    include: { items: { select: { id: true, result: true } }, schedule: { select: { id: true, name: true, frequency: true } } },
  });
  if (!run) throw new NotFoundError("Maintenance run not found.");

  const allowed = MAINTENANCE_RUN_TRANSITIONS[run.status] ?? [];
  if (!(allowed as readonly string[]).includes(body.action)) {
    throw new BadRequestError(
      allowed.length > 0
        ? `Cannot move from ${run.status} to ${body.action}. Allowed: ${allowed.join(", ")}.`
        : `Cannot move from ${run.status} — this run is in a terminal state.`
    );
  }

  if (body.action === "COMPLETED") {
    const pending = run.items.filter((item) => item.result === "PENDING");
    if (pending.length > 0) {
      throw new BadRequestError(
        "Resolve every checklist item before completing — mark each Passed, Failed, Attempted, Skipped or N/A."
      );
    }
  }

  const now = new Date();
  const data: Parameters<typeof db.maintenanceRun.update>[0]["data"] = { status: body.action };

  let nextDue: Date | null = null;
  if (body.action === "COMPLETED") {
    data.completedAt = now;
    if (run.scheduleId && run.schedule) {
      const days = MAINTENANCE_FREQUENCIES_DAYS[run.schedule.frequency] ?? 30;
      nextDue = new Date(run.scheduledDate.getTime() + days * 24 * 60 * 60 * 1000);
      data.nextScheduledDate = nextDue;
    }
  }

  const updated = await db.$transaction(async (tx) => {
    const next = await tx.maintenanceRun.update({ where: { id }, data });
    if (nextDue && run.scheduleId) {
      await tx.maintenanceSchedule.update({ where: { id: run.scheduleId }, data: { nextDueDate: nextDue } });
    }
    return next;
  });

  const actionByStatus: Record<string, string> = {
    IN_PROGRESS: "MAINTENANCE_RUN_STARTED",
    COMPLETED: "MAINTENANCE_RUN_COMPLETED",
    SKIPPED: "MAINTENANCE_RUN_SKIPPED",
    CANCELLED: "MAINTENANCE_RUN_CANCELLED",
  };
  await logActivity({
    action: actionByStatus[body.action] ?? "MAINTENANCE_RUN_STATUS_CHANGED",
    entityType: "MAINTENANCE_RUN",
    entityId: updated.id,
    summary:
      body.action === "COMPLETED" && nextDue
        ? `Maintenance run completed — schedule "${run.schedule?.name ?? ""}" next due ${nextDue.toISOString().slice(0, 10)}.`
        : `Maintenance run moved from ${run.status} to ${body.action}.`,
    actor: user,
    websiteId: updated.websiteId,
  });

  const full = await db.maintenanceRun.findUnique({ where: { id }, include: runIncludeWithItems });
  if (!full) throw new BadRequestError("Run could not be loaded after the status change.");
  return jsonOk(toRunRecord(full));
});
