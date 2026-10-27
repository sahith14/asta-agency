import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole, withApi, ok, ApiError, getIp } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { ROLES } from '@/lib/constants'

/** Payment list (with invoice + client context) — FOUNDER + SUPPORT_FINANCE only. */
export const GET = withApi(async (req: NextRequest) => {
  await requireRole([ROLES.SUPPORT_FINANCE])
  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const invoiceId = url.searchParams.get('invoiceId')

  const where: Record<string, unknown> = {}
  if (status && ['PENDING', 'VERIFIED', 'REJECTED'].includes(status)) where.status = status
  if (invoiceId) where.invoiceId = invoiceId

  const payments = await db.payment.findMany({
    where,
    include: {
      invoice: {
        select: {
          id: true,
          number: true,
          status: true,
          amountCents: true,
          client: { select: { id: true, name: true } },
        },
      },
      verifiedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return ok({ payments })
})

const createSchema = z.object({
  invoiceId: z.string().min(1),
  amountCents: z.number().int().positive().max(100_000_000),
  method: z.enum(['BANK_TRANSFER', 'CARD_ONLINE', 'MANUAL_CREDIT']),
  reference: z.string().max(120).optional().nullable(),
})

/**
 * Record a payment against an invoice. The payment starts as PENDING — money is
 * only "received" once a SUPPORT_FINANCE/FOUNDER verifies it WITH written evidence.
 */
export const POST = withApi(async (req: NextRequest) => {
  const user = await requireRole([ROLES.SUPPORT_FINANCE])
  const body = createSchema.parse(await req.json())

  const invoice = await db.invoice.findUnique({
    where: { id: body.invoiceId },
    include: { payments: { where: { status: 'VERIFIED' } } },
  })
  if (!invoice) throw new ApiError(404, 'Invoice not found', 'NOT_FOUND')
  if (!['ISSUED', 'OVERDUE'].includes(invoice.status)) {
    throw new ApiError(400, 'Payments can only be recorded against issued or overdue invoices', 'INVALID_INVOICE_STATUS')
  }

  const payment = await db.payment.create({
    data: {
      invoiceId: invoice.id,
      amountCents: body.amountCents,
      method: body.method,
      reference: body.reference ?? null,
      status: 'PENDING',
    },
  })

  await logAudit({
    actorId: user.id,
    actorRole: user.role,
    action: 'PAYMENT_RECORDED',
    entityType: 'Payment',
    entityId: payment.id,
    result: 'SUCCESS',
    detail: JSON.stringify({
      invoiceNumber: invoice.number,
      amountCents: payment.amountCents,
      method: payment.method,
      reference: payment.reference ?? null,
    }),
    ip: getIp(req),
  })

  // Advisory only — the invoice is never auto-flipped; verification decides.
  const verifiedTotal = invoice.payments.reduce((sum, p) => sum + p.amountCents, 0)
  const invoiceFullyCovered = verifiedTotal >= invoice.amountCents

  return ok({
    payment,
    invoiceFullyCovered,
    hint: invoiceFullyCovered
      ? 'Verified payments now cover this invoice — consider marking it paid when you verify.'
      : undefined,
  })
})
