import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireStaff, json } from '@/lib/auth'

// GET /api/finance/summary — budget vs actual, revenue, margins (real aggregation)
export async function GET(req: NextRequest) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  if (!['OWNER', 'SUPPORT_FINANCE', 'CLIENT_MANAGER'].includes(user.role)) return json({ error: 'You do not have permission to view finance summary' }, 403)

  const serviceType = new URL(req.url).searchParams.get('serviceType')
  const projectWhere = { isArchived: false, ...(serviceType === 'WEBSITE' || serviceType === 'VIDEO_PRODUCTION' ? { serviceType: serviceType as 'WEBSITE' | 'VIDEO_PRODUCTION' } : {}) }

  const projects = await db.project.findMany({
    where: projectWhere,
    select: {
      id: true, name: true, reference: true, serviceType: true, agreedPrice: true, budget: true, status: true,
      client: { select: { name: true } },
      expenses: { select: { amount: true } },
      invoices: { select: { amount: true, status: true } },
      _count: { select: { deliverables: true } },
    },
  })

  const rows = projects.map(p => {
    const budget = p.budget ?? p.agreedPrice ?? 0
    const actual = p.expenses.reduce((s, e) => s + e.amount, 0)
    const contribution = budget - actual
    const marginPct = budget > 0 ? Math.round((contribution / budget) * 100) : null
    const invoiced = p.invoices.filter(i => ['SENT', 'PAID', 'OVERDUE'].includes(i.status)).reduce((s, i) => s + i.amount, 0)
    const collected = p.invoices.filter(i => i.status === 'PAID').reduce((s, i) => s + i.amount, 0)
    const outstanding = invoiced - collected
    return {
      id: p.id, name: p.name, reference: p.reference, serviceType: p.serviceType,
      client: p.client.name, status: p.status, deliverables: p._count.deliverables,
      budget, actual, contribution, marginPct, invoiced, collected, outstanding,
    }
  })

  const totals = {
    budget: rows.reduce((s, r) => s + r.budget, 0),
    actual: rows.reduce((s, r) => s + r.actual, 0),
    invoiced: rows.reduce((s, r) => s + r.invoiced, 0),
    collected: rows.reduce((s, r) => s + r.collected, 0),
    outstanding: rows.reduce((s, r) => s + r.outstanding, 0),
    contribution: rows.reduce((s, r) => s + r.contribution, 0),
  }

  return json({ projects: rows, totals })
}
