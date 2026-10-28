import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireStaff, audit, notify, json } from '@/lib/auth'
import { parseBody } from '@/lib/rbac'

export async function GET(req: NextRequest) {
  const { error } = await requireStaff(req)
  if (error) return error
  const url = new URL(req.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const meetings = await db.meeting.findMany({
    where: from && to ? { startAt: { gte: new Date(from), lte: new Date(to) } } : {},
    include: { client: { select: { id: true, name: true } }, project: { select: { id: true, name: true, reference: true } } },
    orderBy: { startAt: 'asc' },
  })
  return json({ meetings })
}

const createSchema = z.object({
  title: z.string().min(1).max(160),
  clientId: z.string().optional(),
  projectId: z.string().optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  location: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
})

export async function POST(req: NextRequest) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  const { data, error: vErr } = await parseBody(req, createSchema)
  if (vErr) return vErr
  const start = new Date(data.startAt)
  const end = new Date(data.endAt)
  if (end <= start) return json({ error: 'End time must be after start time' }, 400)
  const meeting = await db.meeting.create({
    data: { title: data.title, clientId: data.clientId, projectId: data.projectId, startAt: start, endAt: end, location: data.location, notes: data.notes, createdById: user.userId },
  })
  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'MEETING_CREATED', 'Meeting', meeting.id, `Scheduled meeting "${meeting.title}"`)
  return json({ meeting }, 201)
}
