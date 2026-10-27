/**
 * AgencyOS — Incident ↔ ticket linking API (Phase 4).
 * POST /api/incidents/[id]/tickets { ticketId }
 * Links an existing support ticket to the incident. A ticket can only be
 * linked to one incident; linking to a different one is rejected with a
 * human-readable message. Idempotent when already linked to THIS incident.
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { requireModuleWrite } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { incidentDisplayNumber, ticketDisplayNumber } from "../../record";

const linkSchema = z.object({
  ticketId: z.string().min(1),
});

export const POST = withAuth(async (req, user, { params }) => {
  // RBAC: linking tickets to incidents is founder + developer.
  requireModuleWrite(user, "incidents");
  const { id } = await params;
  const body = await parseBody(req, linkSchema);

  const incident = await db.incident.findUnique({ where: { id }, select: { id: true, number: true } });
  if (!incident) throw new NotFoundError("Incident not found.");

  const ticket = await db.ticket.findUnique({ where: { id: body.ticketId }, select: { id: true, number: true, incidentId: true } });
  if (!ticket) throw new NotFoundError("Ticket not found.");

  if (ticket.incidentId && ticket.incidentId !== incident.id) {
    const other = await db.incident.findUnique({
      where: { id: ticket.incidentId },
      select: { number: true },
    });
    throw new BadRequestError(
      `Ticket ${ticketDisplayNumber(ticket.number)} is already linked to ${incidentDisplayNumber(other?.number ?? 0)}.`
    );
  }

  if (ticket.incidentId !== incident.id) {
    await db.$transaction([
      db.ticket.update({ where: { id: ticket.id }, data: { incidentId: incident.id } }),
      db.incidentEvent.create({
        data: {
          incidentId: incident.id,
          kind: "TICKET_LINKED",
          message: `Ticket ${ticketDisplayNumber(ticket.number)} linked to this incident.`,
          actorId: user.id,
          actorName: user.displayName,
        },
      }),
    ]);

    await logActivity({
      action: "INCIDENT_TICKET_LINKED",
      entityType: "INCIDENT",
      entityId: incident.id,
      entityLabel: incidentDisplayNumber(incident.number),
      summary: `Ticket ${ticketDisplayNumber(ticket.number)} linked to ${incidentDisplayNumber(incident.number)}.`,
      actor: user,
    });
  }

  return jsonOk({ ticketId: ticket.id, incidentId: incident.id });
});
