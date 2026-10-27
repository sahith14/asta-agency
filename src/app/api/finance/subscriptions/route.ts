import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole, withApi, ok, ApiError, getIp } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { notifyUsers, clientUserIds } from '@/lib/notify'
import { ROLES, SUBSCRIPTION_STATUSES } from '@/lib/constants'

/** Subscription list — FOUNDER + SUPPORT_FINANCE only. */
export const GET = withApi(async (req: NextRequest) => {
  await requireRole([ROLES.SUPPORT_FINANCE])
  const url = new URL(req.url)
  const clientId = url.searchParams.get('clientId')

  const subscriptions = await db.subscription.findMany({
    where: clientId ? { clientId } : undefined,
    include: { client: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return ok({ subscriptions })
})

const createSchema = z.object({
  clientId: z.string().min(1),
  planName: z.string().min(1).max(120),
  monthlyPriceCents: z.number().int().positive().max(100_000_000),
  scopeItems: z.array(z.string().min(1).max(200)).max(30).optional(),
  renewalDate: z.string().optional().nullable(),
  status: z.enum(SUBSCRIPTION_STATUSES).optional(),
})

/** Create a subscription (care plan) for a client. */
export const POST = withApi(async (req: NextRequest) => {
  const user = await requireRole([ROLES.SUPPORT_FINANCE])
  const body = createSchema.parse(await req.json())

  const client = await db.client.findUnique({ where: { id: body.clientId } })
  if (!client) throw new ApiError(400, 'Unknown client', 'INVALID_CLIENT')

  const subscription = await db.subscription.create({
    data: {
      clientId: body.clientId,
      planName: body.planName,
      scopeJson: body.scopeItems ? JSON.stringify(body.scopeItems) : null,
      monthlyPriceCents: body.monthlyPriceCents,
      currency: 'GBP',
      status: body.status ?? 'ACTIVE',
      renewalDate: body.renewalDate ? new Date(body.renewalDate) : null,
      currentPeriodEnd: body.renewalDate ? new Date(body.renewalDate) : null,
    },
    include: { client: { select: { id: true, name: true } } },
  })

  await logAudit({
    actorId: user.id,
    actorRole: user.role,
    action: 'SUBSCRIPTION_CREATED',
    entityType: 'Subscription',
    entityId: subscription.id,
    result: 'SUCCESS',
    detail: JSON.stringify({
      clientId: subscription.clientId,
      planName: subscription.planName,
      monthlyPriceCents: subscription.monthlyPriceCents,
    }),
    ip: getIp(req),
  })

  const clientIds = await clientUserIds(subscription.clientId)
  await notifyUsers(clientIds, {
    type: 'SUBSCRIPTION_UPDATED',
    title: `Your care plan is now active: ${subscription.planName}`,
    body: `£${(subscription.monthlyPriceCents / 100).toFixed(2)}/month. See the billing page for the agreed scope.`,
    link: '/portal/billing',
    dedupeKey: `sub-created:${subscription.id}`,
  })

  return ok({ subscription })
})
