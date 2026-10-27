import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withApi, ok, ApiError, requireUser } from '@/lib/rbac'
import { logAudit, auditFromRequest } from '@/lib/audit'
import { ROLES } from '@/lib/constants'
import { scopedProjectOr404, isDeliveryManager } from '../_scope'

type Ctx = { params: Promise<{ id: string }> }

const createSchema = z.object({
  title: z.string().min(1).max(200),
  notes: z.string().max(2000).optional().nullable(),
  milestoneId: z.string().max(64).optional().nullable(),
  clientVisible: z.boolean().optional(),
})

// POST /api/projects/[id]/deliverables — FOUNDER/CLIENT_MANAGER or the
// assigned WEB_DEVELOPER. Status starts at PLANNED.
export const POST = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  const project = await scopedProjectOr404(user, id)

  const allowed = isDeliveryManager(user) || (user.role === ROLES.WEB_DEVELOPER && project.assignedToId === user.id)
  if (!allowed) throw new ApiError(403, 'You do not have permission to perform this action', 'FORBIDDEN')

  const body = createSchema.parse(await req.json())

  if (body.milestoneId) {
    const milestone = await db.milestone.findFirst({ where: { id: body.milestoneId, projectId: id }, select: { id: true } })
    if (!milestone) throw new ApiError(400, 'Unknown milestone for this project', 'UNKNOWN_MILESTONE')
  }

  const deliverable = await db.deliverable.create({
    data: {
      projectId: id,
      title: body.title.trim(),
      notes: body.notes ?? null,
      milestoneId: body.milestoneId ?? null,
      clientVisible: body.clientVisible ?? true,
      status: 'PLANNED',
    },
  })

  await logAudit(
    auditFromRequest(req, {
      actorId: user.id,
      actorRole: user.role,
      action: 'DELIVERABLE_CREATED',
      entityType: 'Deliverable',
      entityId: deliverable.id,
      result: 'SUCCESS',
      detail: JSON.stringify({ projectId: id, title: deliverable.title }),
    })
  )

  return ok({ deliverable }, 201)
})
