/**
 * AgencyOS — Incidents API (Phase 4).
 * GET  /api/incidents?status&severity&websiteId&q&page&pageSize
 *   → Paginated<IncidentRecord> (detectedAt desc)
 * POST /api/incidents → manual incident (MANUAL source, DETECTED status).
 * Numbers are allocated max+1 with P2002 retry; creation runs in one
 * transaction (incident + website coverage + CREATED event).
 */
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, jsonOk, parseBody, parseQuery, withAuth } from "@/lib/api";
import { requireModule, requireModuleWrite } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import {
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  OPEN_INCIDENT_STATUSES,
  type IncidentRecord,
  type Paginated,
} from "@/lib/types";
import {
  createIncidentWithNumber,
  incidentDisplayNumber,
  incidentInclude,
  toIncidentRecord,
} from "./record";

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
// GET /api/incidents
// ---------------------------------------------------------------------------

export const GET = withAuth(async (req, user) => {
  // RBAC: incident read — founder/developer/support; managers/staff denied.
  requireModule(user, "incidents");
  const query = parseQuery(req);
  const sp = new URL(req.url).searchParams;

  const where: Prisma.IncidentWhereInput = {};

  // status=OPEN → every not-yet-resolved status; otherwise explicit statuses
  // (single or CSV), each validated against INCIDENT_STATUSES.
  const rawStatus = sp.get("status")?.trim() || undefined;
  if (rawStatus) {
    const tokens = rawStatus.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
    if (tokens.length > 0) {
      const expanded: string[] = [];
      for (const token of tokens) {
        if (token === "OPEN") {
          expanded.push(...OPEN_INCIDENT_STATUSES);
        } else if ((INCIDENT_STATUSES as readonly string[]).includes(token)) {
          expanded.push(token);
        } else {
          throw new BadRequestError(
            `Invalid status "${token}". Allowed: OPEN, ${INCIDENT_STATUSES.join(", ")}.`
          );
        }
      }
      where.status = { in: [...new Set(expanded)] };
    }
  }

  const severities = parseEnumListParam(sp.get("severity"), INCIDENT_SEVERITIES, "severity");
  if (severities) where.severity = { in: severities };

  const websiteId = sp.get("websiteId")?.trim() || undefined;
  if (websiteId) where.websites = { some: { websiteId } };

  const search = query.search ?? (sp.get("q")?.trim() || undefined);
  if (search) {
    const or: Prisma.IncidentWhereInput[] = [{ title: { contains: search } }];
    // "INC-0007", "inc7" or a bare number also matches the incident number.
    const numberMatch = search.match(/^(?:inc)?[-\s]?0*(\d+)$/i);
    if (numberMatch) {
      const parsed = parseInt(numberMatch[1], 10);
      if (Number.isFinite(parsed)) or.push({ number: parsed });
    }
    where.OR = or;
  }

  const [rows, total] = await Promise.all([
    db.incident.findMany({
      where,
      include: incidentInclude,
      orderBy: { detectedAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.incident.count({ where }),
  ]);

  const data: Paginated<IncidentRecord> = {
    items: rows.map((row) => toIncidentRecord(row)),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
  };
  return jsonOk(data);
});

// ---------------------------------------------------------------------------
// POST /api/incidents — manual incident
// ---------------------------------------------------------------------------

const createIncidentSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters.").max(200),
  description: z.string().max(5000).nullish(),
  severity: z.enum(INCIDENT_SEVERITIES),
  websiteIds: z.array(z.string().min(1)).max(10, "An incident can cover at most 10 websites.").optional(),
  assignedToId: z.string().min(1).nullish(),
});

export const POST = withAuth(async (req, user) => {
  // RBAC: creating incidents is founder + developer.
  requireModuleWrite(user, "incidents");
  const body = await parseBody(req, createIncidentSchema);

  const websiteIds = [...new Set(body.websiteIds ?? [])];
  if (websiteIds.length > 0) {
    const found = await db.website.findMany({ where: { id: { in: websiteIds } }, select: { id: true } });
    if (found.length !== websiteIds.length) {
      throw new BadRequestError("One or more of the selected websites were not found.");
    }
  }

  if (body.assignedToId) {
    const assignee = await db.user.findUnique({ where: { id: body.assignedToId }, select: { id: true } });
    if (!assignee) throw new BadRequestError("Assignee not found.");
  }

  const now = new Date();
  const created = await createIncidentWithNumber((number) =>
    db.$transaction(async (tx) => {
      const incident = await tx.incident.create({
        data: {
          number,
          title: body.title,
          description: body.description ?? null,
          severity: body.severity,
          status: "DETECTED",
          detectionSource: "MANUAL",
          detectedAt: now,
          assignedToId: body.assignedToId ?? null,
          createdById: user.id,
        },
      });
      if (websiteIds.length > 0) {
        await tx.incidentWebsite.createMany({
          data: websiteIds.map((websiteId) => ({ incidentId: incident.id, websiteId, firstObservedAt: now })),
        });
      }
      await tx.incidentEvent.create({
        data: {
          incidentId: incident.id,
          kind: "CREATED",
          message: `Incident reported manually: ${body.title}.`,
          actorId: user.id,
          actorName: user.displayName,
        },
      });
      return incident;
    })
  );

  const display = incidentDisplayNumber(created.number);
  await logActivity({
    action: "INCIDENT_CREATED",
    entityType: "INCIDENT",
    entityId: created.id,
    entityLabel: display,
    summary: `Incident ${display} created manually — ${body.title}.`,
    actor: user,
    websiteId: websiteIds.length === 1 ? websiteIds[0] : null,
  });

  const full = await db.incident.findUnique({ where: { id: created.id }, include: incidentInclude });
  if (!full) throw new BadRequestError("Incident could not be loaded after creation.");
  return jsonOk(toIncidentRecord(full), { status: 201 });
});
