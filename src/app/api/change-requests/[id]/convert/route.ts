import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withApi, ok, ApiError, requireUser, isFounder } from '@/lib/rbac'
import { logAudit, auditFromRequest } from '@/lib/audit'
import { notifyUsers, roleUserIds } from '@/lib/notify'
import { ROLES } from '@/lib/constants'

type Ctx = { params: Promise<{ id: string }> }

const convertSchema = z.object({
  assignedToId: z.string().max(64).optional().nullable(),
})

// POST /api/change-requests/[id]/convert — FOUNDER ONLY. Requires status
// APPROVED. Creates the developer Task from the change request (priority
// HIGH, status BACKLOG, created by the founder) and marks the CR
// CONVERTED_TO_TASK. THIS is the only path from a client request to developer
// work — client demo approval never creates tasks.
export const POST = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  if (!isFounder(user)) {
    await logAudit(
      auditFromRequest(req, {
        actorId: user.id,
        actorRole: user.role,
        action: 'CHANGE_REQUEST_CONVERTED',
        entityType: 'ChangeRequest',
        entityId: (await ctx.params).id,
        result: 'DENIED',
        detail: 'Non-founder attempted change request conversion',
      })
    )
    throw new ApiError(403, 'Only the founder can convert change requests to tasks', 'FORBIDDEN')
  }

  const { id } = await ctx.params
  const cr = await db.changeRequest.findUnique({
    where: { id },
    include: { project: { select: { id: true, name: true, client: { select: { name: true } } } } },
  })
  if (!cr) throw new ApiError(404, 'Not found', 'NOT_FOUND')

  if (cr.status !== 'APPROVED') {
    throw new ApiError(400, 'Only APPROVED change requests can be converted to a task', 'INVALID_STATUS')
  }

  const body = convertSchema.parse(await req.json().catch(() => ({})))

  if (body.assignedToId) {
    const dev = await db.user.findFirst({
      where: { id: body.assignedToId, role: ROLES.WEB_DEVELOPER, isActive: true },
      select: { id: true },
    })
    if (!dev) throw new ApiError(400, 'Assignee must be an active web developer', 'INVALID_ASSIGNEE')
  }

  const description = cr.founderNotes ? `${cr.details}\n\nFounder notes: ${cr.founderNotes}` : cr.details

  const task = await db.task.create({
    data: {
      projectId: cr.projectId,
      changeRequestId: cr.id,
      title: cr.title,
      description,
      priority: 'HIGH',
      status: 'BACKLOG',
      createdById: user.id,
      assignedToId: body.assignedToId ?? null,
    },
  })

  await db.changeRequest.update({ where: { id }, data: { status: 'CONVERTED_TO_TASK' } })

  await db.approvalEvent.create({
    data: {
      entityType: 'CHANGE_REQUEST',
      entityId: id,
      actorId: user.id,
      actorRole: user.role,
      action: 'CHANGE_CONVERTED_TO_TASK',
      note: null,
      resultingAction: `Task created: ${task.id}`,
    },
  })

  const notifyTargets = await roleUserIds([ROLES.CLIENT_MANAGER])
  if (body.assignedToId) notifyTargets.push(body.assignedToId)
  await notifyUsers(notifyTargets, {
    type: 'CHANGE_REQUEST_CONVERTED',
    title: 'Change request converted to task',
    body: `“${cr.title}” (${cr.project.name}) is now a task ready for development.`,
    link: `/app/projects/${cr.projectId}`,
    dedupeKey: `cr-converted:${id}`,
  })

  await logAudit(
    auditFromRequest(req, {
      actorId: user.id,
      actorRole: user.role,
      action: 'CHANGE_REQUEST_CONVERTED',
      entityType: 'ChangeRequest',
      entityId: id,
      result: 'SUCCESS',
      detail: JSON.stringify({ taskId: task.id, projectId: cr.projectId, assignedToId: body.assignedToId ?? null }),
    })
  )

  return ok({ changeRequest: await db.changeRequest.findUnique({ where: { id } }), task }, 201)
})
