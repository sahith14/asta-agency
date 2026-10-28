import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireStaff, audit, json, jsonError } from '@/lib/auth'
import { can, parseBody } from '@/lib/rbac'

const updateSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  category: z.string().max(80).optional(),
  serial: z.string().max(120).optional(),
  status: z.enum(['AVAILABLE', 'RESERVED', 'MAINTENANCE', 'RETIRED']).optional(),
  notes: z.string().max(1000).optional(),
})

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  if (!can(user, 'equipment.manage')) return jsonError('You do not have permission to update equipment', 403)
  const { id } = await ctx.params
  const { data, error: vErr } = await parseBody(req, updateSchema)
  if (vErr) return vErr
  const item = await db.equipmentItem.findUnique({ where: { id } })
  if (!item) return jsonError('Equipment item not found', 404)
  const updated = await db.equipmentItem.update({ where: { id }, data })
  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'EQUIPMENT_UPDATED', 'EquipmentItem', id, `Updated equipment ${updated.name} (${updated.status})`)
  return json({ item: updated })
}
