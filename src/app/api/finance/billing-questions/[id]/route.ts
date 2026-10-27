import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole, withApi, ok, ApiError, getIp } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { notifyUsers, clientUserIds } from '@/lib/notify'
import { ROLES } from '@/lib/constants'

type Ctx = { params: Promise<{ id: string }> }

const patchSchema = z.object({
  status: z.enum(['IN_REVIEW', 'RESOLVED', 'REJECTED', 'ACCEPTED']),
  response: z.string().trim().max(5000).optional(),
})

/**
 * Respond to / progress a billing question. Terminal statuses (RESOLVED,
 * REJECTED, ACCEPTED) set resolvedAt and notify the client's portal users with
 * the written response. The client can never call this route.
 */
export const PATCH = withApi<Ctx>(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireRole([ROLES.SUPPORT_FINANCE])
  const { id } = await ctx.params
  const body = patchSchema.parse(await req.json())

  const question = await db.billingQuestion.findUnique({ where: { id }, include: { invoice: true } })
  if (!question) throw new ApiError(404, 'Billing question not found', 'NOT_FOUND')

  const terminal = body.status === 'RESOLVED' || body.status === 'REJECTED' || body.status === 'ACCEPTED'

  const updated = await db.billingQuestion.update({
    where: { id: question.id },
    data: {
      status: body.status,
      response: body.response ?? question.response,
      resolvedAt: terminal ? new Date() : null,
    },
  })

  await logAudit({
    actorId: user.id,
    actorRole: user.role,
    action: 'BILLING_QUESTION_RESOLVED',
    entityType: 'BillingQuestion',
    entityId: question.id,
    result: 'SUCCESS',
    detail: JSON.stringify({
      subject: question.subject,
      type: question.type,
      from: question.status,
      to: body.status,
      responseIncluded: Boolean(body.response),
    }),
    ip: getIp(req),
  })

  if (terminal) {
    const clientIds = await clientUserIds(question.clientId)
    await notifyUsers(clientIds, {
      type: 'BILLING_QUESTION_RESOLVED',
      title: `Update on your billing query: ${question.subject}`,
      body: updated.response ?? 'Your billing query has been reviewed and updated by our team.',
      link: '/portal/billing',
      dedupeKey: `bq-resolved:${question.id}`,
    })
  }

  return ok({ question: updated })
})
