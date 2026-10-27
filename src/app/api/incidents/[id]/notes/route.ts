/**
 * AgencyOS — Incident notes API (Phase 4).
 * POST /api/incidents/[id]/notes { message } → IncidentEventRecord (NOTE)
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { requireModuleWrite } from "@/lib/rbac";
import { toIncidentEventRecord } from "../../record";

const noteSchema = z.object({
  message: z.string().min(1, "Write a note first.").max(2000),
});

export const POST = withAuth(async (req, user, { params }) => {
  // RBAC: adding incident notes is founder + developer.
  requireModuleWrite(user, "incidents");
  const { id } = await params;
  const body = await parseBody(req, noteSchema);

  const incident = await db.incident.findUnique({ where: { id }, select: { id: true } });
  if (!incident) throw new NotFoundError("Incident not found.");

  const event = await db.incidentEvent.create({
    data: {
      incidentId: id,
      kind: "NOTE",
      message: body.message,
      actorId: user.id,
      actorName: user.displayName,
    },
  });

  return jsonOk(toIncidentEventRecord(event));
});
