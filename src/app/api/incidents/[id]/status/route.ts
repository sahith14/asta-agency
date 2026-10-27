/**
 * AgencyOS — Incident status transitions API (Phase 4).
 * POST /api/incidents/[id]/status { action, reason? }
 * Validated against INCIDENT_TRANSITIONS. RESOLVED requires a recorded
 * resolution; reopening (RESOLVED/CLOSED → INVESTIGATING) requires a reason
 * and clears resolvedAt/closedAt. Every transition writes a timeline event.
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { requireModuleWrite } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { INCIDENT_TRANSITIONS } from "@/lib/types";
import { incidentDisplayNumber, incidentInclude, toIncidentRecord } from "../../record";

const statusSchema = z.object({
  action: z.string().min(1),
  reason: z.string().max(2000).optional(),
  resolution: z.string().max(5000).optional(),
});

export const POST = withAuth(async (req, user, { params }) => {
  // RBAC: incident status transitions are founder + developer.
  requireModuleWrite(user, "incidents");
  const { id } = await params;
  const body = await parseBody(req, statusSchema);

  const incident = await db.incident.findUnique({
    where: { id },
    include: { websites: { select: { id: true, recoveredAt: true } } },
  });
  if (!incident) throw new NotFoundError("Incident not found.");

  const allowed = INCIDENT_TRANSITIONS[incident.status] ?? [];
  if (!(allowed as readonly string[]).includes(body.action)) {
    throw new BadRequestError(
      allowed.length > 0
        ? `Cannot move from ${incident.status} to ${body.action}. Allowed: ${allowed.join(", ")}.`
        : `Cannot move from ${incident.status} — this incident is in a terminal state.`
    );
  }

  const reopening = body.action === "INVESTIGATING" && (incident.status === "RESOLVED" || incident.status === "CLOSED");
  if (reopening && (!body.reason || body.reason.trim() === "")) {
    throw new BadRequestError("A reason is required to reopen an incident.");
  }

  const now = new Date();
  const allRecovered = incident.websites.length > 0 && incident.websites.every((w) => w.recoveredAt !== null);

  let eventKind = "STATUS_CHANGED";
  let eventMessage = `Status changed from ${incident.status} to ${body.action}.`;
  const data: Parameters<typeof db.incident.update>[0]["data"] = { status: body.action };

  if (body.action === "RESOLVED") {
    // The resolution can be supplied with this very request (body.resolution)
    // or already recorded on the incident — one of the two must be non-empty.
    const bodyResolution = body.resolution?.trim() ?? "";
    const effective = bodyResolution || incident.resolution?.trim() || "";
    if (effective === "") {
      throw new BadRequestError("Add a resolution before marking this incident resolved.");
    }
    if (bodyResolution && bodyResolution !== (incident.resolution ?? "")) {
      data.resolution = bodyResolution;
    }
    data.resolvedAt = now;
    if (allRecovered) data.recoveryVerifiedAt = now;
  } else if (body.action === "CLOSED") {
    data.closedAt = now;
  } else if (reopening) {
    data.resolvedAt = null;
    data.closedAt = null;
    data.recoveryVerifiedAt = null;
    eventKind = "REOPENED";
    eventMessage = `Incident reopened by ${user.displayName}: ${body.reason?.trim()}`;
  }

  const updated = await db.$transaction(async (tx) => {
    const next = await tx.incident.update({ where: { id }, data });
    await tx.incidentEvent.create({
      data: {
        incidentId: id,
        kind: eventKind,
        message: eventMessage,
        actorId: user.id,
        actorName: user.displayName,
      },
    });
    return next;
  });

  const display = incidentDisplayNumber(updated.number);
  await logActivity({
    action: reopening ? "INCIDENT_REOPENED" : "INCIDENT_STATUS_CHANGED",
    entityType: "INCIDENT",
    entityId: updated.id,
    entityLabel: display,
    summary: reopening
      ? `Incident ${display} reopened — ${body.reason?.trim()}`
      : `Incident ${display} moved from ${incident.status} to ${body.action}.`,
    actor: user,
  });

  const full = await db.incident.findUnique({ where: { id }, include: incidentInclude });
  if (!full) throw new BadRequestError("Incident could not be loaded after the status change.");
  return jsonOk(toIncidentRecord(full));
});
