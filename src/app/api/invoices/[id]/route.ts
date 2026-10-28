import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireStaff, audit, json, jsonError } from '@/lib/auth'
import { can, parseBody } from '@/lib/rbac'

const transitionSchema = z.object({
  action: z.enum(['send', 'markPaid', 'void']),
  paidReference: z.string().max(200).optional(),
})

// POST /api/invoices/[id] — explicit invoice state transitions only (never auto-paid)
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  if (!can(user, 'finance.manage')) return jsonError('You do not have permission to change invoice state', 403)
  const { id } = await ctx.params
  const { data, error: vErr } = await parseBody(req, transitionSchema)
  if (vErr) return vErr

  const invoice = await db.invoice.findUnique({ where: { id }, include: { client: { select: { name: true } } } })
  if (!invoice) return jsonError('Invoice not found', 404)

  const now = new Date()
  const updates: Record<string, unknown> = {}
  let summary = ''
  if (data.action === 'send') {
    if (invoice.status !== 'DRAFT') return jsonError(`Only draft invoices can be sent (current: ${invoice.status})`, 422)
    updates.status = 'SENT'; updates.issuedAt = now
    summary = `Sent invoice ${invoice.number}`
  } else if (data.action === 'markPaid') {
    if (!['SENT', 'OVERDUE'].includes(invoice.status)) return jsonError(`Only sent or overdue invoices can be marked paid (current: ${invoice.status})`, 422)
    updates.status = 'PAID'; updates.paidAt = now
    summary = `Marked invoice ${invoice.number} as paid${data.paidReference ? ` (ref: ${data.paidReference.slice(0, 40)})` : ''}`
  } else {
    if (['PAID', 'VOID'].includes(invoice.status)) return jsonError(`Cannot void a ${invoice.status.toLowerCase()} invoice`, 422)
    updates.status = 'VOID'
    summary = `Voided invoice ${invoice.number}`
  }

  const updated = await db.invoice.update({ where: { id }, data: updates })
  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'INVOICE_STATE', 'Invoice', id, summary)
  return json({ invoice: updated })
}
