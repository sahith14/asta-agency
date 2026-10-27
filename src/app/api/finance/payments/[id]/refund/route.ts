import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole, withApi, ok, ApiError, getIp } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { notifyUsers, roleUserIds } from '@/lib/notify'
import { ROLES } from '@/lib/constants'

type Ctx = { params: Promise<{ id: string }> }

const refundSchema = z.object({
  amountCents: z.number().int().positive().max(100_000_000).optional(),
  reason: z.string().trim().min(10, 'A reason of at least 10 characters is required to issue a refund').max(1000),
})

/**
 * Issue a refund — FOUNDER ONLY. Creates a new REFUND payment that is already
 * VERIFIED (the founder's action is the approval; the reason is the evidence).
 * The original invoice keeps its status (e.g. stays PAID).
 */
export const POST = withApi<Ctx>(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireRole([ROLES.FOUNDER])
  const { id } = await ctx.params
  const body = refundSchema.parse(await req.json())

  const payment = await db.payment.findUnique({ where: { id }, include: { invoice: true } })
  if (!payment) throw new ApiError(404, 'Payment not found', 'NOT_FOUND')
  if (payment.status !== 'VERIFIED') {
    throw new ApiError(400, 'Only verified payments can be refunded', 'INVALID_PAYMENT_STATUS')
  }

  const amountCents = body.amountCents ?? payment.amountCents
  if (amountCents > payment.amountCents) {
    throw new ApiError(400, 'Refund cannot exceed the original payment amount', 'REFUND_TOO_LARGE')
  }

  const refund = await db.payment.create({
    data: {
      invoiceId: payment.invoiceId,
      amountCents,
      method: 'REFUND',
      reference: `Refund of payment ${payment.id}`,
      status: 'VERIFIED',
      evidenceNote: body.reason,
      verifiedById: user.id,
      verifiedAt: new Date(),
    },
  })

  await logAudit({
    actorId: user.id,
    actorRole: user.role,
    action: 'REFUND_ISSUED',
    entityType: 'Payment',
    entityId: refund.id,
    result: 'SUCCESS',
    detail: JSON.stringify({
      originalPaymentId: payment.id,
      invoiceNumber: payment.invoice.number,
      amountCents,
      reason: body.reason,
    }),
    ip: getIp(req),
  })

  const staffIds = await roleUserIds([ROLES.SUPPORT_FINANCE, ROLES.CLIENT_MANAGER])
  await notifyUsers(staffIds, {
    type: 'REFUND_ISSUED',
    title: `Refund issued for invoice ${payment.invoice.number}`,
    body: `£${(amountCents / 100).toFixed(2)} refunded — ${body.reason}`,
    link: '/app/finance',
    dedupeKey: `refund:${refund.id}`,
  })

  return ok({ refund })
})
