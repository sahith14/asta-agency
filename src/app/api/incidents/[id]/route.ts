/**
 * AgencyOS — Incident detail API (Phase 4).
 * GET   /api/incidents/[id] → IncidentDetailData
 *       (incident + websites + full event timeline + linked tickets +
 *        allowed transitions + latest 10 checks across affected websites)
 * PATCH /api/incidents/[id] → editable fields; a severity change is recorded
 *       as a STATUS_CHANGED event on the incident timeline.
 */
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { requireModule, requireModuleWrite } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import {
  INCIDENT_SEVERITIES,
  INCIDENT_TRANSITIONS,
} from "@/lib/types";
import { ticketInclude, toTicketRecord } from "../../tickets/record";
import {
  incidentDisplayNumber,
  incidentInclude,
  toHealthCheckLite,
  toIncidentEventRecord,
  toIncidentRecord,
} from "../record";

// ---------------------------------------------------------------------------
// GET /api/incidents/[id]
// ---------------------------------------------------------------------------

export const GET = withAuth(async (_req, user, { params }) => {
  // RBAC: incident read — founder/developer/support; managers/staff denied.
  requireModule(user, "incidents");
  const { id } = await params;

  const incident = await db.incident.findUnique({ where: { id }, include: incidentInclude });
  if (!incident) throw new NotFoundError("Incident not found.");

  const [events, tickets, recentChecks] = await Promise.all([
    db.incidentEvent.findMany({ where: { incidentId: id }, orderBy: { createdAt: "asc" } }),
    db.ticket.findMany({ where: { incidentId: id }, include: ticketInclude, orderBy: { lastActivityAt: "desc" } }),
    db.healthCheck.findMany({
      where: { websiteId: { in: incident.websites.map((w) => w.websiteId) } },
      include: { website: { select: { id: true, name: true, client: { select: { businessName: true } } } } },
      orderBy: { checkedAt: "desc" },
      take: 10,
    }),
  ]);

  return jsonOk({
    incident: toIncidentRecord(incident),
    websites: incident.websites.map((w) => ({
      id: w.id,
      incidentId: w.incidentId,
      websiteId: w.websiteId,
      firstObservedAt: w.firstObservedAt.toISOString(),
      lastObservedAt: w.lastObservedAt ? w.lastObservedAt.toISOString() : null,
      recoveredAt: w.recoveredAt ? w.recoveredAt.toISOString() : null,
      website: {
        id: w.website.id,
        name: w.website.name,
        clientName: w.website.client?.businessName ?? null,
      },
    })),
    events: events.map(toIncidentEventRecord),
    tickets: tickets.map((t) => toTicketRecord(t)),
    allowedTransitions: [...(INCIDENT_TRANSITIONS[incident.status] ?? [])],
    recentChecks: recentChecks.map((c) => toHealthCheckLite(c)),
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/incidents/[id]
// ---------------------------------------------------------------------------

const patchIncidentSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().max(5000).nullish(),
  severity: z.enum(INCIDENT_SEVERITIES).optional(),
  assignedToId: z.string().min(1).nullish(),
  diagnosis: z.string().max(5000).nullish(),
  mitigation: z.string().max(5000).nullish(),
  resolution: z.string().max(5000).nullish(),
});

export const PATCH = withAuth(async (req, user, { params }) => {
  // RBAC: incident edits are founder + developer.
  requireModuleWrite(user, "incidents");
  const { id } = await params;
  const body = await parseBody(req, patchIncidentSchema);

  const existing = await db.incident.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Incident not found.");

  if (body.assignedToId) {
    const assignee = await db.user.findUnique({ where: { id: body.assignedToId }, select: { id: true } });
    if (!assignee) throw new BadRequestError("Assignee not found.");
  }

  const data: Prisma.IncidentUpdateInput = {
    ...(body.title !== undefined ? { title: body.title } : {}),
    ...(body.description !== undefined ? { description: body.description ?? null } : {}),
    ...(body.severity !== undefined ? { severity: body.severity } : {}),
    ...(body.assignedToId !== undefined ? { assignedToId: body.assignedToId ?? null } : {}),
    ...(body.diagnosis !== undefined ? { diagnosis: body.diagnosis ?? null } : {}),
    ...(body.mitigation !== undefined ? { mitigation: body.mitigation ?? null } : {}),
    ...(body.resolution !== undefined ? { resolution: body.resolution ?? null } : {}),
  };

  const updated = await db.$transaction(async (tx) => {
    const incident = await tx.incident.update({ where: { id }, data });
    if (body.severity !== undefined && body.severity !== existing.severity) {
      await tx.incidentEvent.create({
        data: {
          incidentId: id,
          kind: "STATUS_CHANGED",
          message: `Severity changed from ${existing.severity} to ${body.severity}.`,
          actorId: user.id,
          actorName: user.displayName,
        },
      });
    }
    return incident;
  });

  const display = incidentDisplayNumber(updated.number);
  await logActivity({
    action: "INCIDENT_UPDATED",
    entityType: "INCIDENT",
    entityId: updated.id,
    entityLabel: display,
    summary: `Incident ${display} updated.`,
    actor: user,
    metadata: { fields: Object.keys(body) },
  });

  const full = await db.incident.findUnique({ where: { id }, include: incidentInclude });
  if (!full) throw new BadRequestError("Incident could not be loaded after update.");
  return jsonOk(toIncidentRecord(full));
});
