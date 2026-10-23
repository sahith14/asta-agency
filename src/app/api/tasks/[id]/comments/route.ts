import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireStaff, json, jsonError } from '@/lib/auth'

// GET /api/tasks/[id]/comments — task comment thread
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  const { id } = await ctx.params
  const task = await db.task.findUnique({ where: { id } })
  if (!task) return jsonError('Task not found', 404)
  // assigned-only roles may only read their own tasks' comments
  if (!['OWNER', 'CLIENT_MANAGER', 'SUPPORT_FINANCE', 'CREATIVE_DIRECTOR'].includes(user.role) && task.assigneeId !== user.userId && task.createdById !== user.userId) {
    return jsonError('You do not have access to this task', 403)
  }
  const comments = await db.taskComment.findMany({
    where: { taskId: id },
    include: { author: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return json({ comments })
}
