import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireStaff, audit, json } from '@/lib/auth'
import { can, parseBody } from '@/lib/rbac'

export async function GET(req: NextRequest) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  if (!['OWNER', 'SUPPORT_FINANCE', 'CLIENT_MANAGER', 'CREATIVE_DIRECTOR'].includes(user.role)) return json({ error: 'You do not have permission to view expenses' }, 403)
  const url = new URL(req.url)
  const projectId = url.searchParams.get('projectId')
  const expenses = await db.productionExpense.findMany({
    where: projectId ? { projectId } : {},
    include: { project: { select: { id: true, name: true, reference: true, client: { select: { name: true } } } } },
    orderBy: { incurredAt: 'desc' },
    take: 200,
  })
  const total = expenses.reduce((sum, e) => sum + e.amount, 0)
  return json({ expenses, total })
}

const createSchema = z.object({
  projectId: z.string().min(1),
  category: z.enum(['VIDEOGRAPHER', 'EDITOR_FREELANCER', 'TRAVEL_FUEL', 'EQUIPMENT_RENTAL', 'LOCATION_FEE', 'MUSIC_LICENCE', 'OTHER']).default('OTHER'),
  description: z.string().min(1).max(500),
  amount: z.number().min(0.01).max(1_000_000),
  incurredAt: z.string().datetime().optional(),
})

export async function POST(req: NextRequest) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  if (!can(user, 'finance.manage')) return json({ error: 'You do not have permission to record expenses' }, 403)
  const { data, error: vErr } = await parseBody(req, createSchema)
  if (vErr) return vErr
  const project = await db.project.findUnique({ where: { id: data.projectId } })
  if (!project) return json({ error: 'Project not found' }, 404)
  const expense = await db.productionExpense.create({
    data: {
      projectId: data.projectId, category: data.category, description: data.description,
      amount: data.amount, incurredAt: data.incurredAt ? new Date(data.incurredAt) : new Date(),
      recordedById: user.userId,
    },
  })
  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'EXPENSE_CREATED', 'ProductionExpense', expense.id, `Recorded ${data.category} expense ${data.amount} on ${project.name}`)
  return json({ expense }, 201)
}
