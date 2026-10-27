import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withApi, ok, ApiError, requireUser, isFounder } from '@/lib/rbac'
import { logAudit, auditFromRequest } from '@/lib/audit'
import { notifyUsers, roleUserIds, clientUserIds } from '@/lib/notify'
import { ROLES, SCOPE_IMPACTS } from '@/lib/constants'

type Ctx = { params: Promise<{ id: string }> }

const reviewSchema = z.object({
  action: z.enum(['start-review', 'scope-review', 'approve', 'reject']),
  founderNotes: z.string().max(4000).optional(),
  scopeImpact: z.enum(SCOPE_IMPACTS).optional(),
})

// POST /api/change-requests/[id]/review — FOUNDER ONLY. Founder review
// workflow:
//   start-review : SUBMITTED → UNDER_FOUNDER_REVIEW
//   scope-review : UNDER_FOUNDER_REVIEW → SCOPE_REVIEWED (+scopeImpact, notes)
//   approve      : (UNDER_FOUNDER_REVIEW|SCOPE_REVIEWED) → APPROVED, notify manager
//   reject       : → REJECTED with notes, notify the raising client's users
// approve/reject stamp decisionAt; every action is audited and recorded as an
// ApprovalEvent where applicable.
export const POST = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  if (!isFounder(user)) {
    await logAudit(
      auditFromRequest(req, {
        actorId: user.id,
        actorRole: user.role,
        action: 'CHANGE_REQUEST_REVIEWED',
        entityType: 'ChangeRequest',
        entityId: (await ctx.params).id,
        result: 'DENIED',
        detail: 'Non-founder attempted change request review',
      })
    )
    throw new ApiError(403, 'Only the founder can review change requests', 'FORBIDDEN')
  }

  const { id } = await ctx.params
  const cr = await db.changeRequest.findUnique({
    where: { id },
    include: { project: { select: { id: true, name: true, clientId: true, client: { select: { name: true } } } } },
  })
  if (!cr) throw new ApiError(404, 'Not found', 'NOT_FOUND')

  const body = reviewSchema.parse(await req.json())

  switch (body.action) {
    case 'start-review': {
      if (cr.status !== 'SUBMITTED') {
        throw new ApiError(400, `Cannot start review from status ${cr.status}`, 'INVALID_STATUS')
      }
      await db.changeRequest.update({ where: { id }, data: { status: 'UNDER_FOUNDER_REVIEW' } })
      break
    }
    case 'scope-review': {
      if (cr.status !== 'UNDER_FOUNDER_REVIEW') {
        throw new ApiError(400, `Cannot scope-review from status ${cr.status}`, 'INVALID_STATUS')
      }
      if (!body.scopeImpact) {
        throw new ApiError(400, 'scopeImpact is required for scope review', 'SCOPE_IMPACT_REQUIRED')
      }
      await db.changeRequest.update({
        where: { id },
        data: {
          status: 'SCOPE_REVIEWED',
          scopeImpact: body.scopeImpact,
          founderNotes: body.founderNotes ?? cr.founderNotes ?? null,
        },
      })
      await db.approvalEvent.create({
        data: {
          entityType: 'CHANGE_REQUEST',
          entityId: id,
          actorId: user.id,
          actorRole: user.role,
          action: 'FOUNDER_SCOPE_REVIEWED',
          note: body.founderNotes ?? null,
          resultingAction: `Scope impact: ${body.scopeImpact === 'EXTRA_COST_QUOTED' ? 'extra cost quoted' : 'none'}`,
        },
      })
      break
    }
    case 'approve': {
      if (cr.status !== 'SCOPE_REVIEWED' && cr.status !== 'UNDER_FOUNDER_REVIEW') {
        throw new ApiError(400, `Cannot approve from status ${cr.status}`, 'INVALID_STATUS')
      }
      await db.changeRequest.update({
        where: { id },
        data: {
          status: 'APPROVED',
          founderNotes: body.founderNotes ?? cr.founderNotes ?? null,
          decisionAt: new Date(),
        },
      })
      await db.approvalEvent.create({
        data: {
          entityType: 'CHANGE_REQUEST',
          entityId: id,
          actorId: user.id,
          actorRole: user.role,
          action: 'CHANGE_APPROVED',
          note: body.founderNotes ?? null,
          resultingAction: 'Change approved — ready to convert to a task',
        },
      })
      await notifyUsers(await roleUserIds([ROLES.CLIENT_MANAGER]), {
        type: 'CHANGE_REQUEST_APPROVED',
        title: 'Change request approved',
        body: `“${cr.title}” (${cr.project.client.name}) was approved by the founder.`,
        link: '/app/change-requests',
        dedupeKey: `cr-approved:${id}`,
      })
      break
    }
    case 'reject': {
      if (!['SUBMITTED', 'UNDER_FOUNDER_REVIEW', 'SCOPE_REVIEWED'].includes(cr.status)) {
        throw new ApiError(400, `Cannot reject from status ${cr.status}`, 'INVALID_STATUS')
      }
      await db.changeRequest.update({
        where: { id },
        data: {
          status: 'REJECTED',
          founderNotes: body.founderNotes ?? null,
          decisionAt: new Date(),
        },
      })
      await db.approvalEvent.create({
        data: {
          entityType: 'CHANGE_REQUEST',
          entityId: id,
          actorId: user.id,
          actorRole: user.role,
          action: 'CHANGE_REJECTED',
          note: body.founderNotes ?? null,
          resultingAction: 'Change request rejected — requester notified',
        },
      })
      await notifyUsers(await clientUserIds(cr.project.clientId), {
        type: 'CHANGE_REQUEST_REJECTED',
        title: 'Your change request was reviewed',
        body: `“${cr.title}” was not approved.${body.founderNotes ? ` Note: ${body.founderNotes}` : ''}`,
        link: '/portal',
        dedupeKey: `cr-rejected:${id}`,
      })
      break
    }
  }

  await logAudit(
    auditFromRequest(req, {
      actorId: user.id,
      actorRole: user.role,
      action: 'CHANGE_REQUEST_REVIEWED',
      entityType: 'ChangeRequest',
      entityId: id,
      result: 'SUCCESS',
      detail: JSON.stringify({ reviewAction: body.action, from: cr.status, founderNotes: body.founderNotes ?? null, scopeImpact: body.scopeImpact ?? null }),
    })
  )

  const updated = await db.changeRequest.findUnique({ where: { id } })
  return ok({ changeRequest: updated })
})
