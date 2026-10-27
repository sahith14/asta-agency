import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withApi, ok, ApiError, requireUser, isFounder } from '@/lib/rbac'
import { logAudit, auditFromRequest } from '@/lib/audit'
import { notifyUsers, clientUserIds, roleUserIds } from '@/lib/notify'
import { ROLES } from '@/lib/constants'
import { scopedProjectOr404 } from '../_scope'

type Ctx = { params: Promise<{ id: string }> }

const deploySchema = z.object({
  action: z.enum(['request', 'approve']),
  note: z.string().max(2000).optional(),
})

// POST /api/projects/[id]/deploy — P6-3 final deployment approval.
// action 'request': FOUNDER/CLIENT_MANAGER/assigned WEB_DEVELOPER — sets
//   deployRequestedAt (first time only), audits DEPLOYMENT_REQUESTED and
//   notifies FOUNDER users.
// action 'approve': FOUNDER ONLY — requires a prior request (400 otherwise),
//   stamps deployApprovedById/At, marks the project LAUNCH, writes an
//   ApprovalEvent, audits DEPLOYMENT_APPROVED and notifies the manager team
//   and the client's users.
export const POST = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  const project = await scopedProjectOr404(user, id)

  const canRequest =
    isFounder(user) || user.role === ROLES.CLIENT_MANAGER || (user.role === ROLES.WEB_DEVELOPER && project.assignedToId === user.id)
  if (!canRequest) throw new ApiError(403, 'You do not have permission to perform this action', 'FORBIDDEN')

  const body = deploySchema.parse(await req.json())

  if (body.action === 'request') {
    const alreadyRequested = !!project.deployRequestedAt
    if (!alreadyRequested) {
      await db.project.update({ where: { id }, data: { deployRequestedAt: new Date() } })
      await db.approvalEvent.create({
        data: {
          entityType: 'PROJECT',
          entityId: id,
          actorId: user.id,
          actorRole: user.role,
          action: 'DEPLOYMENT_REQUESTED',
          note: body.note ?? null,
          resultingAction: 'Awaiting founder deployment sign-off',
        },
      })
      await notifyUsers(await roleUserIds([ROLES.FOUNDER]), {
        type: 'DEPLOYMENT_REQUESTED',
        title: 'Deployment approval requested',
        body: `“${project.name}” has been requested for deployment sign-off.`,
        link: `/app/projects/${id}`,
        dedupeKey: `deploy-requested:${id}`,
      })
    }
    await logAudit(
      auditFromRequest(req, {
        actorId: user.id,
        actorRole: user.role,
        action: 'DEPLOYMENT_REQUESTED',
        entityType: 'PROJECT',
        entityId: id,
        result: 'SUCCESS',
        detail: JSON.stringify({ alreadyRequested, note: body.note ?? null }),
      })
    )
    return ok({ project: { id, deployRequestedAt: alreadyRequested ? project.deployRequestedAt : new Date() }, alreadyRequested })
  }

  // action === 'approve' — FOUNDER ONLY (isFounder check is authoritative).
  if (!isFounder(user)) {
    await logAudit(
      auditFromRequest(req, {
        actorId: user.id,
        actorRole: user.role,
        action: 'DEPLOYMENT_APPROVED',
        entityType: 'PROJECT',
        entityId: id,
        result: 'DENIED',
        detail: 'Non-founder attempted deployment approval',
      })
    )
    throw new ApiError(403, 'Only the founder can approve deployment', 'FORBIDDEN')
  }

  if (!project.deployRequestedAt) {
    throw new ApiError(400, 'Deployment must be requested before it can be approved', 'NOT_REQUESTED')
  }

  if (project.deployApprovedAt) {
    throw new ApiError(409, 'Deployment already approved', 'ALREADY_APPROVED')
  }

  const updated = await db.project.update({
    where: { id },
    data: { deployApprovedById: user.id, deployApprovedAt: new Date(), status: 'LAUNCH' },
  })

  await db.approvalEvent.create({
    data: {
      entityType: 'PROJECT',
      entityId: id,
      actorId: user.id,
      actorRole: user.role,
      action: 'DEPLOYMENT_APPROVED',
      note: body.note ?? null,
      resultingAction: 'Project marked LAUNCH — deployment authorized',
    },
  })

  await notifyUsers(await roleUserIds([ROLES.CLIENT_MANAGER]), {
    type: 'DEPLOYMENT_APPROVED',
    title: 'Deployment approved',
    body: `“${project.name}” was approved for deployment and marked LAUNCH.`,
    link: `/app/projects/${id}`,
    dedupeKey: `deploy-approved:${id}`,
  })
  await notifyUsers(await clientUserIds(project.clientId), {
    type: 'DEPLOYMENT_APPROVED',
    title: 'Your website launch is approved',
    body: `“${project.name}” has been approved for launch.`,
    link: '/portal',
    dedupeKey: `deploy-approved:${id}`,
  })

  await logAudit(
    auditFromRequest(req, {
      actorId: user.id,
      actorRole: user.role,
      action: 'DEPLOYMENT_APPROVED',
      entityType: 'PROJECT',
      entityId: id,
      result: 'SUCCESS',
      detail: JSON.stringify({ note: body.note ?? null, resultingStatus: updated.status }),
    })
  )

  return ok({ project: updated })
})
