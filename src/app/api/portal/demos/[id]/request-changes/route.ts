import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, getIp, isFounder, ok, requireClientScope } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { notifyUsers, roleUserIds } from '@/lib/notify'
import { ROLES } from '@/lib/constants'
import { withApi, DEMO_ACTIONABLE_STATUSES, notFound, portalUser } from '../../../_portal'

const requestChangesSchema = z.object({
  title: z.string().trim().min(3, 'Please give your request a short title').max(150),
  details: z.string().trim().min(5, 'Please describe the changes you need').max(4000),
})

/**
 * POST /api/portal/demos/[id]/request-changes
 * Client requests changes on a demo: demo → CHANGES_REQUESTED, ChangeRequest
 * created (SUBMITTED), DemoFeedback (CHANGE_REQUEST), ApprovalEvent
 * (CLIENT_CHANGES_REQUESTED), audited, founder + manager notified.
 */
export const POST = withApi<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params
  const user = await portalUser()
  const body = requestChangesSchema.parse(await req.json().catch(() => ({})))

  const demo = await db.demo.findFirst({
    where:
      user.role === ROLES.CLIENT
        ? { id, status: { in: [...DEMO_ACTIONABLE_STATUSES] }, project: { clientId: await requireClientScope(user) } }
        : isFounder(user)
          ? { id, status: { in: [...DEMO_ACTIONABLE_STATUSES] } }
          : { id: '__never__' },
    select: {
      id: true,
      title: true,
      status: true,
      projectId: true,
      project: { select: { name: true, client: { select: { name: true } } } },
    },
  })
  if (!demo) notFound()

  if (demo.status === 'APPROVED') {
    throw new ApiError(409, 'This demo has already been approved — please raise a new change request via Support', 'ALREADY_APPROVED')
  }

  const now = new Date()
  const { changeRequestId } = await db.$transaction(async (tx) => {
    const updated = await tx.demo.updateMany({
      where: { id: demo.id, status: { in: [...DEMO_ACTIONABLE_STATUSES] } },
      data: { status: 'CHANGES_REQUESTED' },
    })
    if (updated.count === 0) {
      throw new ApiError(409, 'This demo cannot be updated right now', 'INVALID_STATE')
    }
    const changeRequest = await tx.changeRequest.create({
      data: {
        projectId: demo.projectId,
        demoId: demo.id,
        raisedById: user.id,
        title: body.title,
        details: body.details,
        status: 'SUBMITTED',
      },
    })
    await tx.demoFeedback.create({
      data: {
        demoId: demo.id,
        authorId: user.id,
        authorRole: user.role,
        type: 'CHANGE_REQUEST',
        message: `${body.title}\n\n${body.details}`,
      },
    })
    await tx.approvalEvent.create({
      data: {
        entityType: 'DEMO',
        entityId: demo.id,
        actorId: user.id,
        actorRole: user.role,
        action: 'CLIENT_CHANGES_REQUESTED',
        note: body.title,
        resultingAction: 'Change request submitted — awaiting Founder review',
      },
    })
    return { changeRequestId: changeRequest.id }
  })

  await logAudit({
    actorId: user.id,
    actorRole: user.role,
    action: 'DEMO_CHANGES_REQUESTED',
    entityType: 'DEMO',
    entityId: demo.id,
    result: 'SUCCESS',
    detail: JSON.stringify({ changeRequestId, title: body.title }),
    ip: getIp(req),
  })

  await notifyUsers(await roleUserIds([ROLES.FOUNDER, ROLES.CLIENT_MANAGER]), {
    type: 'DEMO_CHANGE_REQUESTED',
    title: 'Client requested changes',
    body: `${demo.project.client.name} requested changes on "${demo.title}": ${body.title}`,
    link: '/app/demos',
    dedupeKey: `cr-submitted:${changeRequestId}`,
  })

  return ok({
    changeRequestId,
    demo: { id: demo.id, status: 'CHANGES_REQUESTED', updatedAt: now.toISOString() },
  })
})
