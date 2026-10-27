import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withApi, ok, ApiError, requireUser } from '@/lib/rbac'
import { logAudit, auditFromRequest } from '@/lib/audit'
import { ROLES, DELIVERABLE_STATUSES } from '@/lib/constants'
import { scopedProjectOr404, isDeliveryManager } from '../../_scope'

type Ctx = { params: Promise<{ id: string; did: string }> }

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  notes: z.string().max(2000).optional().nullable(),
  status: z.enum(DELIVERABLE_STATUSES).optional(),
  milestoneId: z.string().max(64).optional().nullable(),
  clientVisible: z.boolean().optional(),
})

// PATCH /api/projects/[id]/deliverables/[did] — FOUNDER/CLIENT_MANAGER or the
// assigned WEB_DEVELOPER. Statuses: PLANNED → IN_BUILD → READY_FOR_REVIEW →
// AUTHORIZED → APPROVED (or CHANGES_REQUESTED at any point before approval).
export const PATCH = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id, did } = await ctx.params
  const project = await scopedProjectOr404(user, id)

  const allowed = isDeliveryManager(user) || (user.role === ROLES.WEB_DEVELOPER && project.assignedToId === user.id)
  if (!allowed) throw new ApiError(403, 'You do not have permission to perform this action', 'FORBIDDEN')

  const deliverable = await db.deliverable.findFirst({ where: { id: did, projectId: id } })
  if (!deliverable) throw new ApiError(404, 'Not found', 'NOT_FOUND')

  const body = patchSchema.parse(await req.json())

  if (body.milestoneId) {
    const milestone = await db.milestone.findFirst({ where: { id: body.milestoneId, projectId: id }, select: { id: true } })
    if (!milestone) throw new ApiError(400, 'Unknown milestone for this project', 'UNKNOWN_MILESTONE')
  }

  const data: Record<string, unknown> = {}
  if (body.title !== undefined) data.title = body.title.trim()
  if (body.notes !== undefined) data.notes = body.notes
  if (body.status !== undefined) data.status = body.status
  if (body.milestoneId !== undefined) data.milestoneId = body.milestoneId
  if (body.clientVisible !== undefined) data.clientVisible = body.clientVisible

  const updated = await db.deliverable.update({ where: { id: did }, data })

  await logAudit(
    auditFromRequest(req, {
      actorId: user.id,
      actorRole: user.role,
      action: 'DELIVERABLE_UPDATED',
      entityType: 'Deliverable',
      entityId: did,
      result: 'SUCCESS',
      detail: JSON.stringify({ projectId: id, fields: Object.keys(data), status: updated.status }),
    })
  )

  return ok({ deliverable: updated })
})
