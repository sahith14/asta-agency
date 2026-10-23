import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireStaff, audit, json } from '@/lib/auth'
import { can, parseBody } from '@/lib/rbac'

export async function GET(req: NextRequest) {
  const { error } = await requireStaff(req)
  if (error) return error
  const items = await db.equipmentItem.findMany({
    include: { reservations: { where: { endAt: { gte: new Date() } }, include: { session: { select: { id: true, title: true, date: true, startTime: true, endTime: true } } } } },
    orderBy: { name: 'asc' },
  })
  return json({ items })
}

const createSchema = z.object({
  name: z.string().min(1).max(160),
  category: z.string().max(80).optional(),
  serial: z.string().max(120).optional(),
  notes: z.string().max(1000).optional(),
})

export async function POST(req: NextRequest) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  if (!can(user, 'equipment.manage')) return json({ error: 'You do not have permission to add equipment' }, 403)
  const { data, error: vErr } = await parseBody(req, createSchema)
  if (vErr) return vErr
  const item = await db.equipmentItem.create({ data })
  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'EQUIPMENT_CREATED', 'EquipmentItem', item.id, `Added equipment ${item.name}`)
  return json({ item }, 201)
}
