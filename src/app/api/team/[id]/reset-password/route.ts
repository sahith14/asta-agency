import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole, audit, json, jsonError } from '@/lib/auth'
import { parseBody } from '@/lib/rbac'

// POST /api/team/[id]/reset-password — same handler contract as PATCH on [id]
const resetSchema = z.object({ newPassword: z.string().min(10).max(200).optional() })

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireRole(req, ['OWNER'])
  if (error) return error
  const { id } = await ctx.params
  const { data, error: vErr } = await parseBody(req, resetSchema)
  if (vErr) return vErr

  const employee = await db.employee.findUnique({ where: { id } })
  if (!employee) return jsonError('Team member not found', 404)

  const { hashPassword, generateToken } = await import('@/lib/auth')
  const newPassword = data.newPassword ?? generateToken().slice(0, 16)
  await db.employee.update({ where: { id }, data: { passwordHash: hashPassword(newPassword), mustChangePassword: true } })
  await db.session.deleteMany({ where: { userType: 'EMPLOYEE', userId: id } })
  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'TEAM_PASSWORD_RESET', 'Employee', id, `Reset password for ${employee.name} (all sessions revoked)`)
  return json({ ok: true, temporaryPassword: newPassword })
}
