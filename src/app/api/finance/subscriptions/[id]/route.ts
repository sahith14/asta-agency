import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole, withApi, ok, ApiError, getIp } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { notifyUsers, clientUserIds } from '@/lib/notify'
import { humanizeStatus } from '@/lib/format'
import { ROLES, SUBSCRIPTION_STATUSES } from '@/lib/constants'

type Ctx = { params: Promise<{ id: string }> }

const patchSchema = z.object({
  planName: z.string().min(1).max(120).optional(),
  scopeItems: z.array(z.string().min(1).max(200)).max(30).optional(),
  monthlyPriceCents: z.number().int().positive().max(100_000_000).optional(),
  status: z.enum(SUBSCRIPTION_STATUSES).optional(),
  renewalDate: z.string().optional().nullable(),
})

/** Update a subscription. Plan/price/scope/status changes notify the client. */
export const PATCH = withApi<Ctx>(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireRole([ROLES.SUPPORT_FINANCE])
  const { id } = await ctx.params
  const body = patchSchema.parse(await req.json())

  const subscription = await db.subscription.findUnique({ where: { id } })
  if (!subscription) throw new ApiError(404, 'Subscription not found', 'NOT_FOUND')

  const data: {
    planName?: string
    scopeJson?: string
    monthlyPriceCents?: number
    status?: string
    renewalDate?: Date | null
    currentPeriodEnd?: Date | null
  } = {}
  if (body.planName) data.planName = body.planName
  if (body.scopeItems) data.scopeJson = JSON.stringify(body.scopeItems)
  if (body.monthlyPriceCents) data.monthlyPriceCents = body.monthlyPriceCents
  if (body.status) data.status = body.status
  if (body.renewalDate !== undefined) {
    data.renewalDate = body.renewalDate ? new Date(body.renewalDate) : null
    data.currentPeriodEnd = body.renewalDate ? new Date(body.renewalDate) : null
  }

  if (Object.keys(data).length === 0) return ok({ subscription })

  const updated = await db.subscription.update({
    where: { id: subscription.id },
    data,
    include: { client: { select: { id: true, name: true } } },
  })

  await logAudit({
    actorId: user.id,
    actorRole: user.role,
    action: 'SUBSCRIPTION_UPDATED',
    entityType: 'Subscription',
    entityId: subscription.id,
    result: 'SUCCESS',
    detail: JSON.stringify({
      clientId: subscription.clientId,
      changes: {
        planName: body.planName,
        monthlyPriceCents: body.monthlyPriceCents,
        status: body.status,
        scopeItemsCount: body.scopeItems?.length,
        renewalDate: body.renewalDate ?? undefined,
      },
    }),
    ip: getIp(req),
  })

  const planChanged =
    (body.planName && body.planName !== subscription.planName) ||
    (body.monthlyPriceCents && body.monthlyPriceCents !== subscription.monthlyPriceCents) ||
    (body.scopeItems && JSON.stringify(body.scopeItems) !== subscription.scopeJson) ||
    (body.status && body.status !== subscription.status)

  if (planChanged) {
    const clientIds = await clientUserIds(subscription.clientId)
    await notifyUsers(clientIds, {
      type: 'SUBSCRIPTION_UPDATED',
      title: 'Your care plan has been updated',
      body: `${updated.planName} — £${(updated.monthlyPriceCents / 100).toFixed(2)}/month (${humanizeStatus(updated.status)}).`,
      link: '/portal/billing',
      dedupeKey: null,
    })
  }

  return ok({ subscription: updated })
})
