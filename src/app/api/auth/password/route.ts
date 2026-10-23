import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getAuthUser, hashPassword, verifyPassword, audit, json, jsonError } from '@/lib/auth'

const schema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(10, 'New password must be at least 10 characters').max(200),
})

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return jsonError('Authentication required', 401)

  let body: unknown
  try { body = await req.json() } catch { return jsonError('Invalid JSON body', 400) }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Invalid input', 400)

  const revokeAll = true
  if (user.userType === 'EMPLOYEE') {
    const emp = await db.employee.findUnique({ where: { id: user.userId } })
    if (!emp) return jsonError('Account not found', 404)
    if (!verifyPassword(parsed.data.currentPassword, emp.passwordHash)) return jsonError('Current password is incorrect', 400)
    await db.employee.update({ where: { id: emp.id }, data: { passwordHash: hashPassword(parsed.data.newPassword), mustChangePassword: false } })
    if (revokeAll) await db.session.deleteMany({ where: { userType: 'EMPLOYEE', userId: emp.id } })
    await audit({ userType: 'EMPLOYEE', userId: emp.id, name: emp.name }, 'AUTH_PASSWORD_CHANGED', 'Employee', emp.id, 'Changed own password (all sessions revoked)')
  } else {
    const cu = await db.clientUser.findUnique({ where: { id: user.userId } })
    if (!cu) return jsonError('Account not found', 404)
    if (!verifyPassword(parsed.data.currentPassword, cu.passwordHash)) return jsonError('Current password is incorrect', 400)
    await db.clientUser.update({ where: { id: cu.id }, data: { passwordHash: hashPassword(parsed.data.newPassword), mustChangePassword: false } })
    if (revokeAll) await db.session.deleteMany({ where: { userType: 'CLIENT_USER', userId: cu.id } })
    await audit({ userType: 'CLIENT_USER', userId: cu.id, name: cu.name }, 'AUTH_PASSWORD_CHANGED', 'ClientUser', cu.id, 'Changed own portal password (all sessions revoked)')
  }

  const res = json({ ok: true })
  res.cookies.set(SESSION_COOKIE_NAME(), '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 })
  return res
}

function SESSION_COOKIE_NAME() {
  return 'agencyos_session'
}
