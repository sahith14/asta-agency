/**
 * AgencyOS — Maintenance schedules API (Phase 4).
 * GET  /api/maintenance/schedules?websiteId&active&page&pageSize
 *   → Paginated<MaintenanceScheduleRecord> (nextDueDate asc)
 * POST /api/maintenance/schedules → create a recurring plan for a website
 *       (checklist template stored as JSON, max 30 items).
 */
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, jsonOk, parseBody, parseQuery, withAuth } from "@/lib/api";
import { requireModule, requireModuleWrite } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { MAINTENANCE_FREQUENCIES, type MaintenanceScheduleRecord, type Paginated } from "@/lib/types";
import {
  createScheduleSchema,
  parseRequiredDate,
  scheduleInclude,
  toScheduleRecord,
  validateScheduleRefs,
} from "../record";

// ---------------------------------------------------------------------------
// GET /api/maintenance/schedules
// ---------------------------------------------------------------------------

export const GET = withAuth(async (req, user) => {
  // RBAC: maintenance read — founder/developer/support; managers/staff denied.
  requireModule(user, "maintenance");
  const query = parseQuery(req);
  const sp = new URL(req.url).searchParams;

  const where: Prisma.MaintenanceScheduleWhereInput = {};
  if (query.websiteId) where.websiteId = query.websiteId;

  const active = sp.get("active")?.trim() || undefined;
  if (active === "true" || active === "1") where.isActive = true;
  else if (active === "false" || active === "0") where.isActive = false;

  const [rows, total] = await Promise.all([
    db.maintenanceSchedule.findMany({
      where,
      include: scheduleInclude,
      orderBy: { nextDueDate: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.maintenanceSchedule.count({ where }),
  ]);

  const data: Paginated<MaintenanceScheduleRecord> = {
    items: rows.map((row) => toScheduleRecord(row)),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
  };
  return jsonOk(data);
});

// ---------------------------------------------------------------------------
// POST /api/maintenance/schedules
// ---------------------------------------------------------------------------

export const POST = withAuth(async (req, user) => {
  // RBAC: creating maintenance schedules is founder + developer.
  requireModuleWrite(user, "maintenance");
  const body = await parseBody(req, createScheduleSchema);

  const { clientId } = await validateScheduleRefs(body);
  const nextDueDate = parseRequiredDate(body.nextDueDate, "next due");

  const created = await db.maintenanceSchedule.create({
    data: {
      websiteId: body.websiteId,
      planId: body.planId ?? null,
      name: body.name,
      frequency: body.frequency,
      nextDueDate,
      assignedToId: body.assignedToId ?? null,
      checklistTemplate: body.checklistTemplate ? JSON.stringify(body.checklistTemplate) : null,
      notes: body.notes ?? null,
    },
  });

  await logActivity({
    action: "MAINTENANCE_SCHEDULE_CREATED",
    entityType: "MAINTENANCE_SCHEDULE",
    entityId: created.id,
    entityLabel: created.name,
    summary: `Maintenance schedule "${created.name}" created (${created.frequency.toLowerCase()}, next due ${nextDueDate.toISOString().slice(0, 10)}).`,
    actor: user,
    clientId,
    websiteId: created.websiteId,
  });

  const full = await db.maintenanceSchedule.findUnique({ where: { id: created.id }, include: scheduleInclude });
  if (!full) throw new BadRequestError("Schedule could not be loaded after creation.");
  return jsonOk(toScheduleRecord(full), { status: 201 });
});
