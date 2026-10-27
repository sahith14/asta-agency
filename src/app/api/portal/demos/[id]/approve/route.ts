import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, getIp, isFounder, ok, requireClientScope } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { notifyUsers, roleUserIds } from '@/lib/notify'
import { ROLES } from '@/lib/constants'
import { withApi, DEMO_ACTIONABLE_STATUSES, notFound, portalUser } from '../../../_portal'

const approveSchema = z.object({
  message: z.string().trim().max(2000).optional(),
})

/**
 * POST /api/portal/demos/[id]/approve
 * Client approval of a demo (P6-3). Only when status is SENT_TO_CLIENT,
 * AUTHORIZED_FOR_PREVIEW or CHANGES_REQUESTED. Creates DemoFeedback (APPROVAL),
 * an ApprovalEvent and an audit entry, and notifies FOUNDER + CLIENT_MANAGER.
 *
 * CRITICAL: this approval must NOT create tasks, change billing, or publish
 * anything — the ApprovalEvent records exactly that.
 */
export const POST = withApi<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params
  const user = await portalUser()
  const body = approveSchema.parse(await req.json().catch(() => ({})))

  // CLIENT: strictly scoped to their own client. FOUNDER: unrestricted
  // super-user (scope derived from the resource itself).
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
    throw new ApiError(409, 'This demo has already been approved', 'ALREADY_APPROVED')
  }

  const now = new Date()
  const note = body.message?.trim() || null

  await db.$transaction(async (tx) => {
    // Atomic state guard — a concurrent duplicate approval lands here as 409.
    const updated = await tx.demo.updateMany({
      where: { id: demo.id, status: { in: [...DEMO_ACTIONABLE_STATUSES] } },
      data: { status: 'APPROVED', clientApprovedAt: now },
    })
    if (updated.count === 0) {
      throw new ApiError(409, 'This demo has already been approved', 'ALREADY_APPROVED')
    }
    await tx.demoFeedback.create({
      data: {
        demoId: demo.id,
        authorId: user.id,
        authorRole: user.role,
        type: 'APPROVAL',
        message: note ?? 'Approved by the client.',
      },
    })
    await tx.approvalEvent.create({
      data: {
        entityType: 'DEMO',
        entityId: demo.id,
        actorId: user.id,
        actorRole: user.role,
        action: 'CLIENT_APPROVED',
        note,
        resultingAction: 'Demo marked APPROVED — no billing, publishing or extra work authorized by this approval',
      },
    })
  })

  await logAudit({
    actorId: user.id,
    actorRole: user.role,
    action: 'DEMO_CLIENT_APPROVED',
    entityType: 'DEMO',
    entityId: demo.id,
    result: 'SUCCESS',
    detail: JSON.stringify({ demoTitle: demo.title, project: demo.project.name }),
    ip: getIp(req),
  })

  await notifyUsers(await roleUserIds([ROLES.FOUNDER, ROLES.CLIENT_MANAGER]), {
    type: 'DEMO_APPROVED',
    title: 'Client approved a demo',
    body: `${demo.project.client.name} approved "${demo.title}"`,
    link: '/app/demos',
    dedupeKey: `demo-client-approved:${demo.id}`,
  })

  return ok({ demo: { id: demo.id, status: 'APPROVED', clientApprovedAt: now.toISOString() } })
})
