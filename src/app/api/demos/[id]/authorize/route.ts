import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withApi, ok, ApiError, requireUser, isFounder } from '@/lib/rbac'
import { logAudit, auditFromRequest } from '@/lib/audit'
import { notifyUsers, clientUserIds } from '@/lib/notify'
import { scopedDemoOr404 } from '../_scope'

type Ctx = { params: Promise<{ id: string }> }

const authorizeSchema = z.object({
  note: z.string().max(2000).optional(),
})

// POST /api/demos/[id]/authorize — FOUNDER ONLY. Marks the demo
// AUTHORIZED_FOR_PREVIEW, stamps authorizedById/At, records an ApprovalEvent,
// audits DEMO_AUTHORIZED and notifies the client's users with their portal
// demo link (idempotent via dedupeKey). An optional note is stored as a
// founder COMMENT in the demo feedback thread.
export const POST = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  if (!isFounder(user)) {
    await logAudit(
      auditFromRequest(req, {
        actorId: user.id,
        actorRole: user.role,
        action: 'DEMO_AUTHORIZED',
        entityType: 'Demo',
        entityId: (await ctx.params).id,
        result: 'DENIED',
        detail: 'Non-founder attempted demo authorization',
      })
    )
    throw new ApiError(403, 'Only the founder can authorize client previews', 'FORBIDDEN')
  }
  const { id } = await ctx.params
  const demo = await scopedDemoOr404(user, id)

  if (['AUTHORIZED_FOR_PREVIEW', 'SENT_TO_CLIENT', 'APPROVED'].includes(demo.status)) {
    throw new ApiError(409, 'Demo has already been authorized', 'ALREADY_AUTHORIZED')
  }

  const body = authorizeSchema.parse(await req.json().catch(() => ({})))

  const authorizedAt = new Date()
  await db.demo.update({
    where: { id },
    data: { status: 'AUTHORIZED_FOR_PREVIEW', authorizedById: user.id, authorizedAt },
  })

  await db.approvalEvent.create({
    data: {
      entityType: 'DEMO',
      entityId: id,
      actorId: user.id,
      actorRole: user.role,
      action: 'AUTHORIZED_CLIENT_PREVIEW',
      note: body.note ?? null,
      resultingAction: 'Preview visible in client portal',
    },
  })

  if (body.note && body.note.trim()) {
    await db.demoFeedback.create({
      data: {
        demoId: id,
        authorId: user.id,
        authorRole: user.role,
        type: 'COMMENT',
        message: body.note.trim(),
      },
    })
  }

  await notifyUsers(await clientUserIds(demo.project.clientId), {
    type: 'DEMO_AUTHORIZED',
    title: 'New website preview ready for your review',
    body: `“${demo.title}” has been approved internally and is ready for you to view.`,
    link: `/portal/demos/${id}`,
    dedupeKey: `demo-authorized:${id}`,
  })

  await logAudit(
    auditFromRequest(req, {
      actorId: user.id,
      actorRole: user.role,
      action: 'DEMO_AUTHORIZED',
      entityType: 'Demo',
      entityId: id,
      result: 'SUCCESS',
      detail: JSON.stringify({ projectId: demo.projectId, clientId: demo.project.clientId, note: body.note ?? null }),
    })
  )

  return ok({ demo: { id, status: 'AUTHORIZED_FOR_PREVIEW', authorizedAt } })
})
