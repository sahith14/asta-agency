import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireStaff, audit, json, jsonError } from '@/lib/auth'
import { can, parseBody } from '@/lib/rbac'

const updateSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  location: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
})

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  const { id } = await ctx.params
  const { data, error: vErr } = await parseBody(req, updateSchema)
  if (vErr) return vErr
  const meeting = await db.meeting.findUnique({ where: { id } })
  if (!meeting) return jsonError('Meeting not found', 404)
  const start = data.startAt ? new Date(data.startAt) : meeting.startAt
  const end = data.endAt ? new Date(data.endAt) : meeting.endAt
  if (end <= start) return jsonError('End time must be after start time', 400)
  const updated = await db.meeting.update({ where: { id }, data: { ...data, startAt: start, endAt: end } })
  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'MEETING_UPDATED', 'Meeting', id, `Updated meeting "${updated.title}"`)
  return json({ meeting: updated })
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  if (!can(user, 'meetings.manage')) return jsonError('You do not have permission to delete meetings', 403)
  const { id } = await ctx.params
  const meeting = await db.meeting.findUnique({ where: { id } })
  if (!meeting) return jsonError('Meeting not found', 404)
  await db.meeting.delete({ where: { id } })
  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'MEETING_DELETED', 'Meeting', id, `Deleted meeting "${meeting.title}"`)
  return json({ ok: true })
}
