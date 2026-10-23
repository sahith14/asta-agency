import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireStaff, audit, json, jsonError } from '@/lib/auth'
import { parseBody } from '@/lib/rbac'

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().max(200).optional(),
  phone: z.string().max(60).optional(),
  company: z.string().max(160).optional(),
  jobTitle: z.string().max(120).optional(),
  clientId: z.string().nullable().optional(),
  notes: z.string().max(2000).optional(),
})

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  if (!['OWNER', 'CLIENT_MANAGER', 'SUPPORT_FINANCE'].includes(user.role)) return jsonError('You do not have permission to update contacts', 403)
  const { id } = await ctx.params
  const { data, error: vErr } = await parseBody(req, updateSchema)
  if (vErr) return vErr
  const contact = await db.contact.findUnique({ where: { id } })
  if (!contact) return jsonError('Contact not found', 404)
  const updated = await db.contact.update({ where: { id }, data })
  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'CONTACT_UPDATED', 'Contact', id, `Updated contact ${updated.name}`)
  return json({ contact: updated })
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  if (!['OWNER', 'CLIENT_MANAGER'].includes(user.role)) return jsonError('You do not have permission to delete contacts', 403)
  const { id } = await ctx.params
  const contact = await db.contact.findUnique({ where: { id } })
  if (!contact) return jsonError('Contact not found', 404)
  await db.contact.delete({ where: { id } })
  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'CONTACT_DELETED', 'Contact', id, `Deleted contact ${contact.name}`)
  return json({ ok: true })
}
