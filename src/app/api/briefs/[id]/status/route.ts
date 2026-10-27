/**
 * AgencyOS — Brief status transitions (Phase 5, spec §3).
 * POST /api/briefs/[id]/status { status, reason? }
 *
 * Who may move what (spec: "Allow the manager to prepare the brief and the
 * founder to review and update it"):
 *  - manager (brief owner)  → DRAFT, NEEDS_INFORMATION, READY_FOR_REVIEW,
 *                             MEETING_COMPLETED, CLOSED
 *  - founder                → any transition allowed by BRIEF_TRANSITIONS
 *                             (APPROVED_FOR_MEETING and CHANGES_REQUESTED are
 *                             explicitly founder review decisions)
 * Invalid transition → 400 listing allowed targets; wrong role → 403.
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, ForbiddenError, NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { assertBriefAccess } from "@/lib/rbac";
import { notifyFounders, notifyUsers } from "@/lib/notify";
import { BRIEF_TRANSITIONS, type BriefRecord } from "@/lib/types";
import { briefInclude, toBriefRecord } from "../../route";

const statusSchema = z.object({
  status: z.string().min(1),
  reason: z.string().trim().max(2000).optional(),
});

/** Transitions a client manager (brief owner) may perform. */
const MANAGER_ALLOWED = new Set([
  "DRAFT",
  "NEEDS_INFORMATION",
  "READY_FOR_REVIEW",
  "MEETING_COMPLETED",
  "CLOSED",
]);

export const POST = withAuth(async (req, user, { params }) => {
  const { id } = await params;
  const body = await parseBody(req, statusSchema);

  const brief = await db.brief.findUnique({ where: { id }, include: briefInclude });
  if (!brief) throw new NotFoundError("Brief not found.");
  await assertBriefAccess(user, id, true);

  const allowed = BRIEF_TRANSITIONS[brief.status] ?? [];
  if (!(allowed as readonly string[]).includes(body.status)) {
    throw new BadRequestError(
      allowed.length > 0
        ? `Cannot move from ${brief.status} to ${body.status}. Allowed: ${allowed.join(", ")}.`
        : `Cannot move from ${brief.status} — this brief is closed.`
    );
  }

  if (user.role === "CLIENT_MANAGER") {
    if (!MANAGER_ALLOWED.has(body.status)) {
      throw new ForbiddenError(
        "Brief approval decisions (approved for meeting, changes requested) are made by the founder."
      );
    }
  } else if (user.role !== "OWNER") {
    throw new ForbiddenError("You do not have permission to change brief status.");
  }

  const updated = await db.brief.update({
    where: { id },
    data: { status: body.status },
    include: briefInclude,
  });

  await logActivity({
    action: "BRIEF_STATUS_CHANGED",
    entityType: "BRIEF",
    entityId: brief.id,
    entityLabel: toBriefRecord(updated).displayNumber,
    summary: `Brief status: ${brief.status} → ${body.status}${body.reason ? ` — ${body.reason}` : ""}`,
    actor: user,
    clientId: brief.clientId,
  });

  // Notifications per spec §8: brief ready for founder review / missing info.
  if (body.status === "READY_FOR_REVIEW") {
    await notifyFounders({
      kind: "BRIEF_READY_FOR_REVIEW",
      title: `Brief ${toBriefRecord(updated).displayNumber} is ready for review`,
      body: `${brief.client?.businessName ?? "Client"} — prepared by ${user.displayName}.`,
      entityType: "BRIEF",
      entityId: brief.id,
    });
  }
  if (body.status === "NEEDS_INFORMATION" && brief.ownerUserId) {
    await notifyUsers([brief.ownerUserId], {
      kind: "BRIEF_MISSING_INFO",
      title: `Brief ${toBriefRecord(updated).displayNumber} needs information`,
      body: body.reason ?? "Missing information must be collected before review.",
      entityType: "BRIEF",
      entityId: brief.id,
    });
  }

  return jsonOk(toBriefRecord(updated) as unknown as BriefRecord);
});
