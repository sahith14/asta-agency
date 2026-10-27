/**
 * AgencyOS — Brief handover to development (Phase 5, spec §1B + §3).
 * POST /api/briefs/[id]/handover { developerUserId?, projectName? }
 *
 * Guards (honesty rules): the brief must be MEETING_COMPLETED and carry the
 * founder-approved decisions (clientDecisions or approvedChanges). The
 * handover creates a real Project + a real Task in one transaction and moves
 * the brief to HANDED_TO_DEVELOPMENT. The task description contains ONLY the
 * approved requirements — never the commercial fields.
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, ForbiddenError, NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { assertBriefAccess } from "@/lib/rbac";
import { notifyFounders, notifyUsers } from "@/lib/notify";

const handoverSchema = z.object({
  developerUserId: z.string().min(1).nullish(),
  projectName: z.string().trim().min(2).max(200).optional(),
});

export const POST = withAuth(async (req, user, { params }) => {
  const { id } = await params;
  const body = await parseBody(req, handoverSchema);

  const brief = await db.brief.findUnique({ where: { id } });
  if (!brief) throw new NotFoundError("Brief not found.");
  await assertBriefAccess(user, id, true);

  if (user.role !== "OWNER" && user.role !== "CLIENT_MANAGER") {
    throw new ForbiddenError("Only the founder or the owning client manager can hand over a brief.");
  }
  if (brief.status !== "MEETING_COMPLETED") {
    throw new BadRequestError(
      "A brief can only be handed over after the meeting is completed (current status: " + brief.status + ")."
    );
  }
  const approved = [brief.clientDecisions?.trim(), brief.approvedChanges?.trim()].filter(Boolean).join(" ");
  if (!approved) {
    throw new BadRequestError("Record the founder-approved decisions before handing over to development.");
  }
  if (body.developerUserId) {
    const dev = await db.user.findUnique({ where: { id: body.developerUserId }, select: { id: true, role: true } });
    if (!dev) throw new BadRequestError("The selected developer account no longer exists.");
  }

  const client = await db.client.findUnique({
    where: { id: brief.clientId },
    select: { id: true, businessName: true },
  });
  if (!client) throw new BadRequestError("The linked client no longer exists.");

  const result = await db.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        clientId: client.id,
        name: body.projectName?.trim() || brief.title?.trim() || `${client.businessName} — demo project`,
        projectType: "NEW_WEBSITE",
        status: "LEAD",
        scope: [brief.requestedPages, brief.requestedFeatures].filter(Boolean).join("\n") || null,
        assignedDeveloperId: body.developerUserId ?? null,
      },
    });

    // Approved-requirements summary — deliberately excludes commercial fields.
    const requirements = [
      brief.businessGoals ? `Business goals: ${brief.businessGoals}` : null,
      brief.targetAudience ? `Target audience: ${brief.targetAudience}` : null,
      brief.requestedPages ? `Pages: ${brief.requestedPages}` : null,
      brief.requestedFeatures ? `Features: ${brief.requestedFeatures}` : null,
      brief.brandingInfo ? `Branding/assets: ${brief.brandingInfo}` : null,
      brief.improvement1 ? `Improvement 1: ${brief.improvement1}` : null,
      brief.improvement2 ? `Improvement 2: ${brief.improvement2}` : null,
      brief.improvement3 ? `Improvement 3: ${brief.improvement3}` : null,
      brief.clientDecisions ? `Client decisions: ${brief.clientDecisions}` : null,
      brief.approvedChanges ? `Approved changes: ${brief.approvedChanges}` : null,
      brief.demoUrl ? `Demo URL: ${brief.demoUrl}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const lastTask = await tx.task.findFirst({ orderBy: { taskNumber: "desc" }, select: { taskNumber: true } });
    const task = await tx.task.create({
      data: {
        taskNumber: (lastTask?.taskNumber ?? 0) + 1,
        title: `Handover: ${project.name}`,
        description: requirements || "See the handed-over brief for the approved requirements.",
        status: "BACKLOG",
        priority: "NORMAL",
        clientId: client.id,
        projectId: project.id,
        assigneeId: body.developerUserId ?? null,
        createdById: user.id,
        source: "CLIENT_CHANGE",
        scopeStatus: "IN_SCOPE",
        subscriptionAllowanceIncluded: false,
        approvalRequired: false,
        releaseStatus: "NOT_APPLICABLE",
      },
    });

    const briefUpdated = await tx.brief.update({
      where: { id },
      data: {
        status: "HANDED_TO_DEVELOPMENT",
        handedOverAt: new Date(),
        handedToProjectId: project.id,
      },
    });

    return { project, task, brief: briefUpdated };
  });

  await logActivity({
    action: "HANDOVER_CREATED",
    entityType: "BRIEF",
    entityId: brief.id,
    entityLabel: `BRF-${String(brief.number).padStart(4, "0")}`,
    summary: `Brief handed over to development — project created, handover task assigned`,
    actor: user,
    clientId: client.id,
    projectId: result.project.id,
    kind: "AUDIT",
  });

  const devIds = body.developerUserId ? [body.developerUserId] : [];
  await notifyFounders({
    kind: "HANDOVER_CREATED",
    title: `Brief BRF-${String(brief.number).padStart(4, "0")} handed over`,
    body: `${client.businessName} — project “${result.project.name}” created${devIds.length ? " and developer notified" : ""}.`,
    entityType: "PROJECT",
    entityId: result.project.id,
  });
  await notifyUsers(devIds, {
    kind: "HANDOVER_CREATED",
    title: `New handover: ${result.project.name}`,
    body: `Task T-${String(result.task.taskNumber).padStart(4, "0")} is waiting in your backlog.`,
    entityType: "TASK",
    entityId: result.task.id,
  });

  return jsonOk({
    brief: { id: result.brief.id, status: result.brief.status, handedToProjectId: result.brief.handedToProjectId },
    project: { id: result.project.id, name: result.project.name },
    task: { id: result.task.id, taskNumber: result.task.taskNumber, title: result.task.title },
  });
});
