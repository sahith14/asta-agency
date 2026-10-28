import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireStaff, audit, makeReference, json } from '@/lib/auth'
import { can, getPagination, parseBody } from '@/lib/rbac'

export async function GET(req: NextRequest) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  if (!['OWNER', 'SUPPORT_FINANCE', 'CLIENT_MANAGER'].includes(user.role)) return json({ error: 'You do not have permission to view invoices' }, 403)
  const url = new URL(req.url)
  const { skip, take } = getPagination(url)
  const status = url.searchParams.get('status')
  const clientId = url.searchParams.get('clientId')
  const where = {
    ...(status ? { status: status as 'DRAFT' } : {}),
    ...(clientId ? { clientId } : {}),
  }
  const [total, invoices, totals] = await Promise.all([
    db.invoice.count({ where }),
    db.invoice.findMany({
      where, skip, take,
      include: { client: { select: { id: true, name: true } }, project: { select: { id: true, name: true, reference: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    db.invoice.aggregate({ where, _sum: { amount: true } }),
  ])
  return json({ total, invoices, totalAmount: totals._sum.amount ?? 0 })
}

const createSchema = z.object({
  clientId: z.string().min(1),
  projectId: z.string().optional(),
  amount: z.number().min(0.01).max(10_000_000),
  dueDate: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
})

export async function POST(req: NextRequest) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  if (!can(user, 'finance.manage')) return json({ error: 'You do not have permission to create invoices' }, 403)
  const { data, error: vErr } = await parseBody(req, createSchema)
  if (vErr) return vErr
  const client = await db.client.findUnique({ where: { id: data.clientId } })
  if (!client) return json({ error: 'Client not found' }, 404)
  const invoice = await db.invoice.create({
    data: {
      number: makeReference('INV'),
      clientId: data.clientId, projectId: data.projectId, amount: data.amount,
      dueDate: data.dueDate ? new Date(data.dueDate) : null, notes: data.notes,
      status: 'DRAFT',
    },
  })
  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'INVOICE_CREATED', 'Invoice', invoice.id, `Created invoice ${invoice.number} for ${client.name} (${data.amount})`)
  return json({ invoice }, 201)
}
