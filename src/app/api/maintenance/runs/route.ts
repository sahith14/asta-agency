/**
 * AgencyOS — Maintenance runs API (Phase 4).
 * GET  /api/maintenance/runs?status&websiteId&scheduleId&due(upcoming|overdue)
 *      &page&pageSize → Paginated<MaintenanceRunRecord>
 * POST /api/maintenance/runs → ad-hoc (or schedule-based) run, status PLANNED.
 *      Checklist items come from the body `items` or, when a schedule is
 *      linked and items are omitted, from the schedule's template.
 */
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, jsonOk, parseBody, parseQuery, withAuth } from "@/lib/api";
import { requireModule, requireModuleWrite } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import {
  MAINTENANCE_RUN_STATUSES,
  type MaintenanceRunRecord,
  type Paginated,
} from "@/lib/types";
import {
  parseChecklistTemplate,
  parseRequiredDate,
  runInclude,
  runIncludeWithItems,
  templateSchema,
  toRunRecord,
} from "../record";

/** CSV/list query param validated against an enum — unknown token → 400. */
function parseEnumListParam(raw: string | null, allowed: readonly string[], label: string): string[] | null {
  if (!raw) return null;
  const tokens = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (tokens.length === 0) return null;
  for (const token of tokens) {
    if (!allowed.includes(token)) {
      throw new BadRequestError(`Invalid ${label} "${token}". Allowed: ${allowed.join(", ")}.`);
    }
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// GET /api/maintenance/runs
// ---------------------------------------------------------------------------

export const GET = withAuth(async (req, user) => {
  // RBAC: maintenance read — founder/developer/support; managers/staff denied.
  requireModule(user, "maintenance");
  const query = parseQuery(req);
  const sp = new URL(req.url).searchParams;

  const where: Prisma.MaintenanceRunWhereInput = {};

  const statuses = parseEnumListParam(sp.get("status"), MAINTENANCE_RUN_STATUSES, "status");
  if (statuses) where.status = { in: statuses };

  if (query.websiteId) where.websiteId = query.websiteId;
  const scheduleId = sp.get("scheduleId")?.trim() || undefined;
  if (scheduleId) where.scheduleId = scheduleId;

  const now = new Date();
  const due = sp.get("due")?.trim() || undefined;
  let orderBy: Prisma.MaintenanceRunOrderByWithRelationInput = { scheduledDate: "desc" };
  if (due === "upcoming") {
    where.scheduledDate = { gte: now };
    where.status = { in: ["PLANNED", "IN_PROGRESS"] };
    orderBy = { scheduledDate: "asc" }; // soonest first
  } else if (due === "overdue") {
    where.scheduledDate = { lt: now };
    where.status = { in: ["PLANNED", "IN_PROGRESS"] };
    orderBy = { scheduledDate: "asc" }; // most overdue first
  }

  const [rows, total] = await Promise.all([
    db.maintenanceRun.findMany({
      where,
      include: runInclude,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.maintenanceRun.count({ where }),
  ]);

  const data: Paginated<MaintenanceRunRecord> = {
    items: rows.map((row) => toRunRecord(row)),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
  };
  return jsonOk(data);
});

// ---------------------------------------------------------------------------
// POST /api/maintenance/runs
// ---------------------------------------------------------------------------

const createRunSchema = z.object({
  websiteId: z.string().min(1),
  scheduledDate: z.string().min(1),
  scheduleId: z.string().min(1).nullish(),
  assignedToId: z.string().min(1).nullish(),
  items: templateSchema.optional(),
});

export const POST = withAuth(async (req, user) => {
  // RBAC: creating maintenance runs is founder + developer.
  requireModuleWrite(user, "maintenance");
  const body = await parseBody(req, createRunSchema);

  const website = await db.website.findUnique({
    where: { id: body.websiteId },
    select: { id: true, name: true, clientId: true },
  });
  if (!website) throw new BadRequestError("Website not found.");

  let schedule: { id: string; name: string; websiteId: string; checklistTemplate: string | null } | null = null;
  if (body.scheduleId) {
    schedule = await db.maintenanceSchedule.findUnique({
      where: { id: body.scheduleId },
      select: { id: true, name: true, websiteId: true, checklistTemplate: true },
    });
    if (!schedule) throw new BadRequestError("Schedule not found.");
    if (schedule.websiteId !== body.websiteId) {
      throw new BadRequestError("The selected schedule belongs to a different website.");
    }
  }

  if (body.assignedToId) {
    const assignee = await db.user.findUnique({ where: { id: body.assignedToId }, select: { id: true } });
    if (!assignee) throw new BadRequestError("Assignee not found.");
  }

  const scheduledDate = parseRequiredDate(body.scheduledDate, "scheduled");

  // Checklist source: explicit items > schedule template > none.
  const itemLabels = body.items ?? (schedule ? parseChecklistTemplate(schedule.checklistTemplate) : []);

  const created = await db.maintenanceRun.create({
    data: {
      websiteId: body.websiteId,
      scheduleId: body.scheduleId ?? null,
      scheduledDate,
      status: "PLANNED",
      assignedToId: body.assignedToId ?? null,
      items: {
        create: itemLabels.map((label, index) => ({ position: index, label })),
      },
    },
  });

  await logActivity({
    action: "MAINTENANCE_RUN_CREATED",
    entityType: "MAINTENANCE_RUN",
    entityId: created.id,
    summary: `Maintenance run for ${website.name} scheduled ${scheduledDate.toISOString().slice(0, 10)} created (${itemLabels.length} checklist item(s)).`,
    actor: user,
    clientId: website.clientId,
    websiteId: website.id,
  });

  const full = await db.maintenanceRun.findUnique({ where: { id: created.id }, include: runIncludeWithItems });
  if (!full) throw new BadRequestError("Run could not be loaded after creation.");
  return jsonOk(toRunRecord(full), { status: 201 });
});
