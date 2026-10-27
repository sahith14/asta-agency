/**
 * AgencyOS — Shared maintenance record mapping for the maintenance API routes
 * (colocated helper, not a route).
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError } from "@/lib/api";
import { toDateOrNull } from "@/lib/parse-date";
import { MAINTENANCE_FREQUENCIES } from "@/lib/types";
import type { MaintenanceChecklistItem, MaintenanceRun, MaintenanceSchedule } from "@prisma/client";
import type {
  MaintenanceChecklistItemRecord,
  MaintenanceRunRecord,
  MaintenanceScheduleRecord,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Shared body schemas + validators (used by the schedule/run routes)
// ---------------------------------------------------------------------------

export const templateSchema = z.array(z.string().min(1).max(200)).max(30, "A checklist can have at most 30 items.");

export const createScheduleSchema = z.object({
  websiteId: z.string().min(1),
  name: z.string().min(1).max(120),
  frequency: z.enum(MAINTENANCE_FREQUENCIES),
  nextDueDate: z.string().min(1),
  planId: z.string().min(1).nullish(),
  assignedToId: z.string().min(1).nullish(),
  checklistTemplate: templateSchema.optional(),
  notes: z.string().max(5000).nullish(),
});

/** Validates linked ids for schedule create/update; returns the website's client. */
export async function validateScheduleRefs(body: {
  websiteId?: string;
  planId?: string | null;
  assignedToId?: string | null;
}): Promise<{ clientId: string | null }> {
  let clientId: string | null = null;
  if (body.websiteId) {
    const website = await db.website.findUnique({
      where: { id: body.websiteId },
      select: { id: true, clientId: true },
    });
    if (!website) throw new BadRequestError("Website not found.");
    clientId = website.clientId;
  }
  if (body.planId) {
    const plan = await db.servicePlan.findUnique({ where: { id: body.planId }, select: { id: true } });
    if (!plan) throw new BadRequestError("Service plan not found.");
  }
  if (body.assignedToId) {
    const assignee = await db.user.findUnique({ where: { id: body.assignedToId }, select: { id: true } });
    if (!assignee) throw new BadRequestError("Assignee not found.");
  }
  return { clientId };
}

/** Parses a required date-string; 400 when unparseable. */
export function parseRequiredDate(value: string, label: string): Date {
  const parsed = toDateOrNull(value);
  if (!parsed) throw new BadRequestError(`Provide a valid ${label} date.`);
  return parsed;
}

type WebsiteRow = { id: string; name: string; client?: { businessName: string } | null };

/** Parses the stored JSON template into a string[] (empty on malformed data). */
export function parseChecklistTemplate(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

type ScheduleRow = MaintenanceSchedule & {
  website?: WebsiteRow | null;
  plan?: { id: string; name: string } | null;
  assignedTo?: { id: string; displayName: string } | null;
  _count?: { runs: number };
};

export function toScheduleRecord(row: ScheduleRow): MaintenanceScheduleRecord {
  return {
    id: row.id,
    websiteId: row.websiteId,
    planId: row.planId,
    name: row.name,
    frequency: row.frequency,
    nextDueDate: row.nextDueDate.toISOString(),
    assignedToId: row.assignedToId,
    checklistTemplate: parseChecklistTemplate(row.checklistTemplate),
    notes: row.notes,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    website: row.website
      ? { id: row.website.id, name: row.website.name, clientName: row.website.client?.businessName ?? null }
      : null,
    plan: row.plan ? { id: row.plan.id, name: row.plan.name } : null,
    assignedTo: row.assignedTo ? { id: row.assignedTo.id, displayName: row.assignedTo.displayName } : null,
    _count: row._count ?? undefined,
  };
}

type ItemRow = MaintenanceChecklistItem & {
  evidence?: { id: string; fileName: string } | null;
};

export function toItemRecord(row: ItemRow): MaintenanceChecklistItemRecord {
  return {
    id: row.id,
    runId: row.runId,
    position: row.position,
    label: row.label,
    category: row.category,
    result: row.result,
    notes: row.notes,
    evidenceDocumentId: row.evidenceDocumentId,
    evidenceDocument: row.evidence
      ? { id: row.evidence.id, fileName: row.evidence.fileName }
      : null,
  };
}

type RunRow = MaintenanceRun & {
  schedule?: { id: string; name: string } | null;
  website?: WebsiteRow | null;
  assignedTo?: { id: string; displayName: string } | null;
  items?: ItemRow[];
  _count?: { items: number };
};

export function toRunRecord(row: RunRow): MaintenanceRunRecord {
  return {
    id: row.id,
    scheduleId: row.scheduleId,
    websiteId: row.websiteId,
    scheduledDate: row.scheduledDate.toISOString(),
    status: row.status,
    assignedToId: row.assignedToId,
    workNotes: row.workNotes,
    timeSpentMinutes: row.timeSpentMinutes,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    nextScheduledDate: row.nextScheduledDate ? row.nextScheduledDate.toISOString() : null,
    remindedAt: row.remindedAt ? row.remindedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    schedule: row.schedule ? { id: row.schedule.id, name: row.schedule.name } : null,
    website: row.website
      ? { id: row.website.id, name: row.website.name, clientName: row.website.client?.businessName ?? null }
      : null,
    assignedTo: row.assignedTo ? { id: row.assignedTo.id, displayName: row.assignedTo.displayName } : null,
    ...(row.items ? { items: row.items.sort((a, b) => a.position - b.position).map(toItemRecord) } : {}),
    _count: row._count ?? undefined,
  };
}

export const scheduleInclude = {
  website: { select: { id: true, name: true, client: { select: { businessName: true } } } },
  plan: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, displayName: true } },
  _count: { select: { runs: true } },
} as const;

export const runInclude = {
  schedule: { select: { id: true, name: true } },
  website: { select: { id: true, name: true, client: { select: { businessName: true } } } },
  assignedTo: { select: { id: true, displayName: true } },
  _count: { select: { items: true } },
} as const;

export const runIncludeWithItems = {
  ...runInclude,
  items: {
    // The Document relation on MaintenanceChecklistItem is named `evidence`.
    include: { evidence: { select: { id: true, fileName: true } } },
    orderBy: { position: "asc" as const },
  },
} as const;
