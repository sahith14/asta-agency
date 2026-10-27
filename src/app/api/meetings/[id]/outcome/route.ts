/**
 * AgencyOS — Meeting outcome (Phase 5, spec §1B/§3).
 * POST /api/meetings/[id]/outcome { outcome, markCompleted? }
 * The manager records the founder-approved decisions taken in the meeting
 * (founder can also record directly). Setting the outcome marks the meeting
 * COMPLETED by default and stamps outcomeRecordedAt.
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, ForbiddenError, NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { assertMeetingAccess } from "@/lib/rbac";
import { notifyFounders } from "@/lib/notify";
import { meetingInclude, toMeetingRecord } from "../../route";

const outcomeSchema = z.object({
  outcome: z.string().trim().min(2, "Record the decision or outcome of the meeting.").max(5000),
  markCompleted: z.boolean().default(true),
});

export const POST = withAuth(async (req, user, { params }) => {
  const { id } = await params;
  const body = await parseBody(req, outcomeSchema);

  const meeting = await db.meeting.findUnique({ where: { id }, include: meetingInclude });
  if (!meeting) throw new NotFoundError("Meeting not found.");
  await assertMeetingAccess(user, id, true);

  if (user.role !== "OWNER" && user.role !== "CLIENT_MANAGER") {
    throw new ForbiddenError("Only the client manager or the founder records meeting outcomes.");
  }
  if (meeting.status === "CANCELLED") {
    throw new BadRequestError("A cancelled meeting cannot have an outcome recorded.");
  }

  const updated = await db.meeting.update({
    where: { id },
    data: {
      outcome: body.outcome,
      outcomeRecordedAt: new Date(),
      status: body.markCompleted ? "COMPLETED" : meeting.status,
    },
    include: meetingInclude,
  });

  await logActivity({
    action: "MEETING_OUTCOME_RECORDED",
    entityType: "MEETING",
    entityId: id,
    entityLabel: updated.title,
    summary: `Outcome recorded: ${body.outcome.slice(0, 140)}${body.outcome.length > 140 ? "…" : ""}`,
    actor: user,
    clientId: updated.clientId,
  });

  await notifyFounders({
    kind: "MEETING_OUTCOME_RECORDED",
    title: `Outcome recorded: ${updated.title}`,
    body: `${updated.client?.businessName ?? "Client"} — by ${user.displayName}.`,
    entityType: "MEETING",
    entityId: id,
  });

  return jsonOk(toMeetingRecord(updated));
});
