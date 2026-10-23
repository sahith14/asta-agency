import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireStaff, audit, notify, json } from '@/lib/auth'
import { parseBody, getPagination } from '@/lib/rbac'

export async function GET(req: NextRequest) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  const url = new URL(req.url)
  const { skip, take } = getPagination(url)
  const status = url.searchParams.get('status')
  const mine = url.searchParams.get('mine') === 'true'
  const projectId = url.searchParams.get('projectId')

  const where = {
    ...(status ? { status } : {}),
    ...(projectId ? { projectId } : {}),
    ...(mine ? { assigneeId: user.userId } : {}),
  }
  const [total, tasks] = await Promise.all([
    db.task.count({ where }),
    db.task.findMany({
      where, skip, take,
      include: { assignee: { select: { id: true, name: true } }, project: { select: { id: true, name: true, reference: true } }, _count: { select: { comments: true } } },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    }),
  ])
  return json({ total, tasks })
}

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  projectId: z.string().optional(),
  assigneeId: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  dueDate: z.string().datetime().optional(),
})

export async function POST(req: NextRequest) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  const { data, error: vErr } = await parseBody(req, createSchema)
  if (vErr) return vErr

  if (data.assigneeId) {
    const emp = await db.employee.findUnique({ where: { id: data.assigneeId } })
    if (!emp || !emp.isActive) return json({ error: 'Assignee not found' }, 404)
  }
  const task = await db.task.create({
    data: {
      title: data.title, description: data.description,
      projectId: data.projectId, assigneeId: data.assigneeId, createdById: user.userId,
      priority: data.priority, dueDate: data.dueDate ? new Date(data.dueDate) : null,
    },
  })
  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'TASK_CREATED', 'Task', task.id, `Created task "${task.title}"`)
  if (data.assigneeId && data.assigneeId !== user.userId) {
    await notify('EMPLOYEE', data.assigneeId, 'TASK_ASSIGNED', `New task: ${task.title}`, undefined, data.projectId ? `/app/projects/${data.projectId}` : '/app/tasks')
  }
  return json({ task }, 201)
}
