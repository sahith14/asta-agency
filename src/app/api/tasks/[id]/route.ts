import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireStaff, audit, notify, json, jsonError } from '@/lib/auth'
import { parseBody } from '@/lib/rbac'

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
})

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  const { id } = await ctx.params
  const { data, error: vErr } = await parseBody(req, updateSchema)
  if (vErr) return vErr

  const task = await db.task.findUnique({ where: { id } })
  if (!task) return jsonError('Task not found', 404)
  // Managers can fully edit; assignee can work their own task
  const isManagerial = ['OWNER', 'CLIENT_MANAGER', 'SUPPORT_FINANCE', 'CREATIVE_DIRECTOR'].includes(user.role)
  const isAssignee = task.assigneeId === user.userId
  if (!isManagerial && !isAssignee) return jsonError('You do not have permission to update this task', 403)

  const updateData: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (!isManagerial && !['status', 'description'].includes(k)) continue
    updateData[k] = v
  }
  const updated = await db.task.update({
    where: { id },
    data: { ...updateData, dueDate: data.dueDate === undefined ? undefined : data.dueDate ? new Date(data.dueDate) : null },
  })
  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'TASK_UPDATED', 'Task', id, `Updated task "${updated.title}" (${updated.status})`)
  return json({ task: updated })
}

const commentSchema = z.object({ body: z.string().min(1).max(4000) })

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  const { id } = await ctx.params
  const { data, error: vErr } = await parseBody(req, commentSchema)
  if (vErr) return vErr
  const task = await db.task.findUnique({ where: { id } })
  if (!task) return jsonError('Task not found', 404)
  const comment = await db.taskComment.create({ data: { taskId: id, authorId: user.userId, body: data.body } })
  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'TASK_COMMENT', 'Task', id, `Commented on task "${task.title}"`)
  if (task.assigneeId && task.assigneeId !== user.userId) {
    await notify('EMPLOYEE', task.assigneeId, 'TASK_COMMENT', `New comment on task: ${task.title}`, data.body.slice(0, 120), task.projectId ? `/app/projects/${task.projectId}` : '/app/tasks')
  }
  return json({ comment }, 201)
}
