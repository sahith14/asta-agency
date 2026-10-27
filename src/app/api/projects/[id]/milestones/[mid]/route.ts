import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withApi, ok, ApiError, requireRole, isFounder } from '@/lib/rbac'
import { logAudit, auditFromRequest } from '@/lib/audit'
import { ROLES, MILESTONE_STATUSES } from '@/lib/constants'
import { scopedProjectOr404 } from '../../_scope'

type Ctx = { params: Promise<{ id: string; mid: string }> }

const patchSchema = z.object({
  status: z.enum(MILESTONE_STATUSES).optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  clientVisible: z.boolean().optional(),
})

// Allowed forward transitions: PENDING → IN_PROGRESS → DELIVERED → APPROVED.
const TRANSITIONS: Record<string, string> = {
  PENDING: 'IN_PROGRESS',
  IN_PROGRESS: 'DELIVERED',
  DELIVERED: 'APPROVED',
}

// PATCH /api/projects/[id]/milestones/[mid] — update milestone
// (FOUNDER/CLIENT_MANAGER). Employees must follow the forward transition
// chain; FOUNDER is unrestricted and may set any status. Delivering or
// approving a milestone stamps completedAt.
export const PATCH = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireRole([ROLES.CLIENT_MANAGER])
  const { id, mid } = await ctx.params
  await scopedProjectOr404(user, id)

  const milestone = await db.milestone.findFirst({ where: { id: mid, projectId: id } })
  if (!milestone) throw new ApiError(404, 'Not found', 'NOT_FOUND')

  const body = patchSchema.parse(await req.json())

  if (body.status && body.status !== milestone.status) {
    if (!isFounder(user) && TRANSITIONS[milestone.status] !== body.status) {
      throw new ApiError(400, `Invalid status transition: ${milestone.status} → ${body.status}`, 'INVALID_TRANSITION')
    }
  }

  const data: Record<string, unknown> = {}
  if (body.status !== undefined) data.status = body.status
  if (body.title !== undefined) data.title = body.title.trim()
  if (body.description !== undefined) data.description = body.description
  if (body.dueDate !== undefined) data.dueDate = body.dueDate
  if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder
  if (body.clientVisible !== undefined) data.clientVisible = body.clientVisible

  // Completing a milestone (DELIVERED or APPROVED) stamps completedAt once.
  if (body.status === 'DELIVERED' || body.status === 'APPROVED') {
    data.completedAt = milestone.completedAt ?? new Date()
  }

  const updated = await db.milestone.update({ where: { id: mid }, data })

  await logAudit(
    auditFromRequest(req, {
      actorId: user.id,
      actorRole: user.role,
      action: 'MILESTONE_UPDATED',
      entityType: 'Milestone',
      entityId: mid,
      result: 'SUCCESS',
      detail: JSON.stringify({ projectId: id, fields: Object.keys(data), status: updated.status }),
    })
  )

  return ok({ milestone: updated })
})
