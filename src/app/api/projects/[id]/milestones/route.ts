import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withApi, ok, requireRole } from '@/lib/rbac'
import { logAudit, auditFromRequest } from '@/lib/audit'
import { ROLES } from '@/lib/constants'
import { scopedProjectOr404 } from '../_scope'

type Ctx = { params: Promise<{ id: string }> }

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  clientVisible: z.boolean().optional(),
})

// POST /api/projects/[id]/milestones — create a milestone (FOUNDER/CLIENT_MANAGER).
export const POST = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireRole([ROLES.CLIENT_MANAGER])
  const { id } = await ctx.params
  await scopedProjectOr404(user, id)

  const body = createSchema.parse(await req.json())

  const milestone = await db.milestone.create({
    data: {
      projectId: id,
      title: body.title.trim(),
      description: body.description ?? null,
      dueDate: body.dueDate ?? null,
      sortOrder: body.sortOrder ?? 0,
      clientVisible: body.clientVisible ?? true,
    },
  })

  await logAudit(
    auditFromRequest(req, {
      actorId: user.id,
      actorRole: user.role,
      action: 'MILESTONE_CREATED',
      entityType: 'Milestone',
      entityId: milestone.id,
      result: 'SUCCESS',
      detail: JSON.stringify({ projectId: id, title: milestone.title }),
    })
  )

  return ok({ milestone }, 201)
})
