import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole, audit, hashPassword, generateToken, json, jsonError } from '@/lib/auth'
import { parseBody } from '@/lib/rbac'

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  role: z.enum(['OWNER', 'CLIENT_MANAGER', 'WEB_DEVELOPER', 'SUPPORT_FINANCE', 'VIDEOGRAPHER', 'VIDEO_EDITOR', 'CREATIVE_DIRECTOR']).optional(),
  title: z.string().max(120).optional(),
  phone: z.string().max(60).optional(),
  isActive: z.boolean().optional(),
})

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireRole(req, ['OWNER'])
  if (error) return error
  const { id } = await ctx.params
  const { data, error: vErr } = await parseBody(req, updateSchema)
  if (vErr) return vErr

  const employee = await db.employee.findUnique({ where: { id } })
  if (!employee) return jsonError('Team member not found', 404)

  // Safety: cannot demote or deactivate the last active OWNER
  if ((data.role && data.role !== 'OWNER' && employee.role === 'OWNER') || (data.isActive === false && employee.role === 'OWNER')) {
    const ownerCount = await db.employee.count({ where: { role: 'OWNER', isActive: true } })
    if (ownerCount <= 1) return jsonError('Cannot demote or deactivate the last active Owner', 400)
  }

  const updated = await db.employee.update({ where: { id }, data })
  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'TEAM_UPDATED', 'Employee', id, `Updated team member ${updated.name}`)
  return json({ employee: { id: updated.id, name: updated.name, role: updated.role, isActive: updated.isActive } })
}

const resetSchema = z.object({ newPassword: z.string().min(10, 'Password must be at least 10 characters').max(200).optional() })

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireRole(req, ['OWNER'])
  if (error) return error
  const { id } = await ctx.params
  const { data, error: vErr } = await parseBody(req, resetSchema)
  if (vErr) return vErr

  const employee = await db.employee.findUnique({ where: { id } })
  if (!employee) return jsonError('Team member not found', 404)

  const newPassword = data.newPassword ?? generateToken().slice(0, 16)
  await db.employee.update({
    where: { id },
    data: { passwordHash: hashPassword(newPassword), mustChangePassword: true },
  })
  await db.session.deleteMany({ where: { userType: 'EMPLOYEE', userId: id } })
  await db.passwordResetToken.deleteMany({ where: { userType: 'EMPLOYEE', userId: id } })
  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'TEAM_PASSWORD_RESET', 'Employee', id, `Reset password for ${employee.name} (all sessions revoked)`)

  return json({ ok: true, temporaryPassword: newPassword })
}
