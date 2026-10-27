import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole, withApi, ok, ApiError, getIp } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { ROLES, INVOICE_STATUSES } from '@/lib/constants'

type Ctx = { params: Promise<{ id: string }> }

const patchSchema = z.object({
  status: z.enum(INVOICE_STATUSES).optional(),
  dueDate: z.string().optional().nullable(),
  description: z.string().min(1).max(300).optional(),
})

/** Update an invoice (status / due date / description). FOUNDER + SUPPORT_FINANCE only. */
export const PATCH = withApi<Ctx>(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireRole([ROLES.SUPPORT_FINANCE])
  const { id } = await ctx.params
  const body = patchSchema.parse(await req.json())

  const invoice = await db.invoice.findUnique({ where: { id } })
  if (!invoice) throw new ApiError(404, 'Invoice not found', 'NOT_FOUND')

  const data: { status?: string; dueDate?: Date | null; description?: string; paidAt?: Date | null; issuedAt?: Date | null } = {}
  if (body.status && body.status !== invoice.status) data.status = body.status
  if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null
  if (body.description) data.description = body.description
  if (data.status === 'PAID') data.paidAt = new Date()
  if (data.status && data.status !== 'PAID') data.paidAt = null
  if (data.status === 'ISSUED' && !invoice.issuedAt) data.issuedAt = new Date()

  if (Object.keys(data).length === 0) return ok({ invoice })

  const updated = await db.invoice.update({
    where: { id: invoice.id },
    data,
    include: { client: { select: { id: true, name: true } }, payments: true },
  })

  if (data.status) {
    await logAudit({
      actorId: user.id,
      actorRole: user.role,
      action: 'INVOICE_STATUS_CHANGED',
      entityType: 'Invoice',
      entityId: invoice.id,
      result: 'SUCCESS',
      detail: JSON.stringify({ number: invoice.number, from: invoice.status, to: data.status }),
      ip: getIp(req),
    })
  }

  return ok({ invoice: updated })
})
