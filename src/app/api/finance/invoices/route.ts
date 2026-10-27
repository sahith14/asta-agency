import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole, withApi, ok, ApiError, getIp } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { notifyUsers, clientUserIds } from '@/lib/notify'
import { ROLES, INVOICE_STATUSES } from '@/lib/constants'

/** Invoice list — FOUNDER + SUPPORT_FINANCE only. */
export const GET = withApi(async (req: NextRequest) => {
  await requireRole([ROLES.SUPPORT_FINANCE])
  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const clientId = url.searchParams.get('clientId')

  const where: Record<string, unknown> = {}
  if (status && INVOICE_STATUSES.includes(status as (typeof INVOICE_STATUSES)[number])) where.status = status
  if (clientId) where.clientId = clientId

  const invoices = await db.invoice.findMany({
    where,
    include: {
      client: { select: { id: true, name: true } },
      payments: { orderBy: { createdAt: 'desc' } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return ok({ invoices })
})

const createSchema = z.object({
  clientId: z.string().min(1),
  subscriptionId: z.string().min(1).optional().nullable(),
  description: z.string().min(1).max(300),
  amountCents: z.number().int().positive().max(100_000_000),
  currency: z.string().length(3).optional(),
  dueDate: z.string().optional().nullable(),
  status: z.enum(INVOICE_STATUSES).optional(),
})

/**
 * Create an invoice. Invoice numbers are auto-generated `INV-<year>-<padded seq>`
 * with a unique-retry loop. Issuing notifies the client's portal users.
 */
export const POST = withApi(async (req: NextRequest) => {
  const user = await requireRole([ROLES.SUPPORT_FINANCE])
  const body = createSchema.parse(await req.json())

  const client = await db.client.findUnique({ where: { id: body.clientId } })
  if (!client) throw new ApiError(400, 'Unknown client', 'INVALID_CLIENT')

  if (body.subscriptionId) {
    const sub = await db.subscription.findUnique({ where: { id: body.subscriptionId } })
    if (!sub || sub.clientId !== body.clientId) {
      throw new ApiError(400, 'Subscription does not belong to the selected client', 'INVALID_SUBSCRIPTION')
    }
  }

  const status = body.status ?? 'ISSUED'
  const year = new Date().getFullYear()

  let seq = (await db.invoice.count()) + 1
  let created: Awaited<ReturnType<typeof db.invoice.create>> | null = null
  for (let attempt = 0; attempt < 10 && !created; attempt++) {
    const number = `INV-${year}-${String(seq).padStart(4, '0')}`
    try {
      created = await db.invoice.create({
        data: {
          clientId: body.clientId,
          subscriptionId: body.subscriptionId ?? null,
          number,
          description: body.description,
          amountCents: body.amountCents,
          currency: body.currency ?? 'GBP',
          status,
          issuedAt: status === 'ISSUED' ? new Date() : null,
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
        },
        include: { client: { select: { id: true, name: true } } },
      })
    } catch (err: unknown) {
      const e = err as { code?: string }
      if (e?.code === 'P2002') {
        seq += 1 // number collision — retry with the next sequence
        continue
      }
      throw err
    }
  }
  if (!created) throw new ApiError(500, 'Could not allocate a unique invoice number', 'NUMBER_EXHAUSTED')
  const invoice = created

  await logAudit({
    actorId: user.id,
    actorRole: user.role,
    action: 'INVOICE_CREATED',
    entityType: 'Invoice',
    entityId: invoice.id,
    result: 'SUCCESS',
    detail: JSON.stringify({
      number: invoice.number,
      clientId: invoice.clientId,
      amountCents: invoice.amountCents,
      status: invoice.status,
    }),
    ip: getIp(req),
  })

  if (invoice.status === 'ISSUED') {
    const clientIds = await clientUserIds(invoice.clientId)
    await notifyUsers(clientIds, {
      type: 'INVOICE_ISSUED',
      title: `New invoice ${invoice.number}`,
      body: `${invoice.description} — £${(invoice.amountCents / 100).toFixed(2)} due ${invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('en-GB') : 'on receipt'}.`,
      link: '/portal/billing',
      dedupeKey: `inv-issued:${invoice.number}`,
    })
  }

  return ok({ invoice })
})
