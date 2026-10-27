import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { withApi, ok, ApiError, requireRole, isFounder } from '@/lib/rbac'
import { logAudit, auditFromRequest } from '@/lib/audit'
import { notifyUsers, roleUserIds } from '@/lib/notify'
import { ROLES } from '@/lib/constants'
import { scopedDemoOr404 } from '../_scope'

type Ctx = { params: Promise<{ id: string }> }

// POST /api/demos/[id]/ready — submit a demo for founder review
// (FOUNDER/CLIENT_MANAGER/assigned WEB_DEVELOPER). PREPARING (or
// CHANGES_REQUESTED after rework) → READY_FOR_FOUNDER. Re-submitting an
// already-submitted demo is a no-op; already-authorized demos are rejected
// with 409. Audits DEMO_SUBMITTED_FOR_REVIEW and notifies FOUNDER users.
export const POST = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireRole([ROLES.CLIENT_MANAGER, ROLES.WEB_DEVELOPER])
  const { id } = await ctx.params
  const demo = await scopedDemoOr404(user, id)

  if (['AUTHORIZED_FOR_PREVIEW', 'SENT_TO_CLIENT', 'APPROVED'].includes(demo.status)) {
    throw new ApiError(409, 'Demo has already been authorized', 'ALREADY_AUTHORIZED')
  }

  if (demo.status !== 'READY_FOR_FOUNDER') {
    await db.demo.update({ where: { id }, data: { status: 'READY_FOR_FOUNDER' } })
    await notifyUsers(await roleUserIds([ROLES.FOUNDER]), {
      type: 'DEMO_READY_FOR_REVIEW',
      title: 'Demo ready for your review',
      body: `“${demo.title}” (${demo.project.name}) is awaiting founder authorization.`,
      link: '/app/demos',
      dedupeKey: `demo-ready:${id}`,
    })
  }

  await logAudit(
    auditFromRequest(req, {
      actorId: user.id,
      actorRole: user.role,
      action: 'DEMO_SUBMITTED_FOR_REVIEW',
      entityType: 'Demo',
      entityId: id,
      result: 'SUCCESS',
      detail: JSON.stringify({ projectId: demo.projectId, from: demo.status, to: 'READY_FOR_FOUNDER', by: isFounder(user) ? 'FOUNDER' : user.role }),
    })
  )

  return ok({ demo: { id, status: 'READY_FOR_FOUNDER' } })
})
