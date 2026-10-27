/**
 * AgencyOS — Meeting cancellation (Phase 5).
 * POST /api/meetings/[id]/cancel { reason? } — manager-creator / founder.
 * Only SCHEDULED meetings can be cancelled; the reason is stored and the
 * founder is notified in-app.
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, ForbiddenError, NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { assertMeetingAccess } from "@/lib/rbac";
import { notifyFounders } from "@/lib/notify";
import { meetingInclude, toMeetingRecord } from "../../route";

const cancelSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});

export const POST = withAuth(async (req, user, { params }) => {
  const { id } = await params;
  const body = await parseBody(req, cancelSchema);

  const meeting = await db.meeting.findUnique({ where: { id }, include: meetingInclude });
  if (!meeting) throw new NotFoundError("Meeting not found.");
  await assertMeetingAccess(user, id, true);

  if (user.role !== "OWNER" && meeting.createdById !== user.id) {
    throw new ForbiddenError("Only the booking client manager or the founder can cancel this meeting.");
  }
  if (meeting.status !== "SCHEDULED") {
    throw new BadRequestError(`Only scheduled meetings can be cancelled (current status: ${meeting.status}).`);
  }

  const updated = await db.meeting.update({
    where: { id },
    data: { status: "CANCELLED", cancelReason: body.reason ?? null },
    include: meetingInclude,
  });

  await logActivity({
    action: "MEETING_CANCELLED",
    entityType: "MEETING",
    entityId: id,
    entityLabel: updated.title,
    summary: `Meeting cancelled${body.reason ? ` — ${body.reason}` : ""}`,
    actor: user,
    clientId: updated.clientId,
  });

  await notifyFounders({
    kind: "MEETING_CANCELLED",
    title: `Meeting cancelled: ${updated.title}`,
    body: `${updated.client?.businessName ?? "Client"} — was ${updated.scheduledAt.toISOString()} (${updated.timezone}).${body.reason ? ` Reason: ${body.reason}` : ""}`,
    entityType: "MEETING",
    entityId: id,
  });

  return jsonOk(toMeetingRecord(updated));
});
