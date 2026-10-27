/**
 * AgencyOS — Incident ↔ ticket unlinking API (Phase 4).
 * DELETE /api/incidents/[id]/tickets/[ticketId]
 * Unlinks a ticket that is currently linked to THIS incident; anything else
 * (unknown ticket, not linked, linked elsewhere) is rejected explicitly.
 */
import { db } from "@/lib/db";
import { BadRequestError, NotFoundError, jsonOk, withAuth } from "@/lib/api";
import { requireModuleWrite } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { incidentDisplayNumber, ticketDisplayNumber } from "../../../record";

export const DELETE = withAuth(async (_req, user, { params }) => {
  // RBAC: unlinking tickets from incidents is founder + developer.
  requireModuleWrite(user, "incidents");
  const { id, ticketId } = await params;

  const incident = await db.incident.findUnique({ where: { id }, select: { id: true, number: true } });
  if (!incident) throw new NotFoundError("Incident not found.");

  const ticket = await db.ticket.findUnique({ where: { id: ticketId }, select: { id: true, number: true, incidentId: true } });
  if (!ticket) throw new NotFoundError("Ticket not found.");

  if (ticket.incidentId !== incident.id) {
    throw new BadRequestError(
      `Ticket ${ticketDisplayNumber(ticket.number)} is not linked to ${incidentDisplayNumber(incident.number)}.`
    );
  }

  await db.$transaction([
    db.ticket.update({ where: { id: ticket.id }, data: { incidentId: null } }),
    db.incidentEvent.create({
      data: {
        incidentId: incident.id,
        kind: "TICKET_UNLINKED",
        message: `Ticket ${ticketDisplayNumber(ticket.number)} unlinked from this incident.`,
        actorId: user.id,
        actorName: user.displayName,
      },
    }),
  ]);

  await logActivity({
    action: "INCIDENT_TICKET_UNLINKED",
    entityType: "INCIDENT",
    entityId: incident.id,
    entityLabel: incidentDisplayNumber(incident.number),
    summary: `Ticket ${ticketDisplayNumber(ticket.number)} unlinked from ${incidentDisplayNumber(incident.number)}.`,
    actor: user,
  });

  return jsonOk({ ok: true });
});
