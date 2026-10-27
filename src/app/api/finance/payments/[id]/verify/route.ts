import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole, withApi, ok, ApiError, getIp } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { notifyUsers, clientUserIds } from '@/lib/notify'
import { ROLES } from '@/lib/constants'

type Ctx = { params: Promise<{ id: string }> }

const verifySchema = z.object({
  evidenceNote: z
    .string()
    .trim()
    .min(10, 'An evidence note of at least 10 characters is required to verify a payment'),
  markInvoicePaid: z.boolean().optional(),
})

/**
 * Verify a PENDING payment. Money may never be marked received without evidence:
 * the evidenceNote (≥10 chars) is mandatory, stored on the payment and audited.
 */
export const POST = withApi<Ctx>(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireRole([ROLES.SUPPORT_FINANCE])
  const { id } = await ctx.params
  const body = verifySchema.parse(await req.json())

  const payment = await db.payment.findUnique({ where: { id }, include: { invoice: true } })
  if (!payment) throw new ApiError(404, 'Payment not found', 'NOT_FOUND')
  if (payment.status !== 'PENDING') {
    throw new ApiError(400, 'Only pending payments can be verified', 'INVALID_PAYMENT_STATUS')
  }

  const verified = await db.payment.update({
    where: { id: payment.id },
    data: {
      status: 'VERIFIED',
      evidenceNote: body.evidenceNote,
      verifiedById: user.id,
      verifiedAt: new Date(),
    },
  })

  await logAudit({
    actorId: user.id,
    actorRole: user.role,
    action: 'PAYMENT_VERIFIED',
    entityType: 'Payment',
    entityId: payment.id,
    result: 'SUCCESS',
    detail: JSON.stringify({
      invoiceNumber: payment.invoice.number,
      amountCents: payment.amountCents,
      evidence: body.evidenceNote,
    }),
    ip: getIp(req),
  })

  if (body.markInvoicePaid && payment.invoice.status !== 'PAID') {
    await db.invoice.update({
      where: { id: payment.invoiceId },
      data: { status: 'PAID', paidAt: new Date(), issuedAt: payment.invoice.issuedAt ?? new Date() },
    })
    await logAudit({
      actorId: user.id,
      actorRole: user.role,
      action: 'INVOICE_STATUS_CHANGED',
      entityType: 'Invoice',
      entityId: payment.invoiceId,
      result: 'SUCCESS',
      detail: JSON.stringify({ number: payment.invoice.number, from: payment.invoice.status, to: 'PAID', via: 'payment-verification' }),
      ip: getIp(req),
    })
  }

  const clientIds = await clientUserIds(payment.invoice.clientId)
  await notifyUsers(clientIds, {
    type: 'PAYMENT_CONFIRMED',
    title: `Payment confirmed for invoice ${payment.invoice.number}`,
    body: `We have confirmed your payment of £${(payment.amountCents / 100).toFixed(2)}. Thank you.`,
    link: '/portal/billing',
    dedupeKey: `payment-verified:${payment.id}`,
  })

  return ok({ payment: verified })
})
