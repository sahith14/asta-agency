import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withApi, ok, ApiError, requireRole } from '@/lib/rbac'
import { logAudit, auditFromRequest } from '@/lib/audit'
import { ROLES } from '@/lib/constants'
import { scopedDemoOr404 } from '../_scope'

type Ctx = { params: Promise<{ id: string }> }

const feedbackSchema = z.object({
  type: z.enum(['COMMENT', 'CHANGE_REQUEST', 'APPROVAL']),
  message: z.string().min(1).max(4000),
})

// GET /api/demos/[id] — internal demo view: demo fields (never urlToken) plus
// the full feedback thread (author name/role, type, message, createdAt).
// Scoping: founder/manager any demo; developer only demos of assigned projects.
export const GET = withApi(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireRole([ROLES.CLIENT_MANAGER, ROLES.WEB_DEVELOPER])
  const { id } = await ctx.params
  const demo = await scopedDemoOr404(user, id)

  const feedback = await db.demoFeedback.findMany({
    where: { demoId: id },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      type: true,
      message: true,
      authorRole: true,
      createdAt: true,
      author: { select: { id: true, name: true } },
    },
  })

  return ok({
    demo: {
      id: demo.id,
      title: demo.title,
      demoUrl: demo.demoUrl,
      status: demo.status,
      preparedById: demo.preparedById,
      authorizedById: demo.authorizedById,
      authorizedAt: demo.authorizedAt,
      clientApprovedAt: demo.clientApprovedAt,
      createdAt: demo.createdAt,
      projectId: demo.project.id,
      projectName: demo.project.name,
      clientId: demo.project.clientId,
      clientName: demo.project.client.name,
    },
    feedback,
  })
})

// POST /api/demos/[id]/feedback — add internal feedback
// (FOUNDER/CLIENT_MANAGER/assigned WEB_DEVELOPER).
export const POST = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireRole([ROLES.CLIENT_MANAGER, ROLES.WEB_DEVELOPER])
  const { id } = await ctx.params
  const demo = await scopedDemoOr404(user, id)

  const body = feedbackSchema.parse(await req.json())

  const feedback = await db.demoFeedback.create({
    data: {
      demoId: id,
      authorId: user.id,
      authorRole: user.role,
      type: body.type,
      message: body.message.trim(),
    },
  })

  await logAudit(
    auditFromRequest(req, {
      actorId: user.id,
      actorRole: user.role,
      action: 'DEMO_FEEDBACK_ADDED',
      entityType: 'Demo',
      entityId: id,
      result: 'SUCCESS',
      detail: JSON.stringify({ feedbackId: feedback.id, type: feedback.type }),
    })
  )

  return ok({ feedback: { ...feedback, authorName: user.name } }, 201)
})
