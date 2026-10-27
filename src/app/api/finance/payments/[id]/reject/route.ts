import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole, withApi, ok, ApiError, getIp } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { ROLES } from '@/lib/constants'

type Ctx = { params: Promise<{ id: string }> }

const rejectSchema = z.object({
  reason: z.string().trim().min(3, 'A reason is required to reject a payment').max(1000),
})

/** Reject a PENDING payment (e.g. bank transfer not found on the statement). */
export const POST = withApi<Ctx>(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireRole([ROLES.SUPPORT_FINANCE])
  const { id } = await ctx.params
  const body = rejectSchema.parse(await req.json())

  const payment = await db.payment.findUnique({ where: { id }, include: { invoice: true } })
  if (!payment) throw new ApiError(404, 'Payment not found', 'NOT_FOUND')
  if (payment.status !== 'PENDING') {
    throw new ApiError(400, 'Only pending payments can be rejected', 'INVALID_PAYMENT_STATUS')
  }

  const rejected = await db.payment.update({
    where: { id: payment.id },
    data: { status: 'REJECTED', evidenceNote: body.reason },
  })

  await logAudit({
    actorId: user.id,
    actorRole: user.role,
    action: 'PAYMENT_REJECTED',
    entityType: 'Payment',
    entityId: payment.id,
    result: 'SUCCESS',
    detail: JSON.stringify({
      invoiceNumber: payment.invoice.number,
      amountCents: payment.amountCents,
      reason: body.reason,
    }),
    ip: getIp(req),
  })

  return ok({ payment: rejected })
})
