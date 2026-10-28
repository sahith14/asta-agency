import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { SESSION_COOKIE, createSession, verifyPassword, audit, jsonError } from '@/lib/auth'

const schema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
})

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch { return jsonError('Invalid JSON body', 400) }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return jsonError('Please provide a valid email and password', 400)

  const email = parsed.data.email.toLowerCase().trim()
  const employee = await db.employee.findUnique({ where: { email } })
  const clientUser = employee ? null : await db.clientUser.findUnique({ where: { email } })

  const valid = employee?.isActive && verifyPassword(parsed.data.password, employee.passwordHash)
  if (employee && valid) {
    const token = await createSession('EMPLOYEE', employee.id)
    await audit({ userType: 'EMPLOYEE', userId: employee.id, name: employee.name }, 'AUTH_LOGIN', 'Employee', employee.id, 'Signed in')
    const res = NextResponse.json({
      user: { name: employee.name, email: employee.email, role: employee.role, userType: 'EMPLOYEE', mustChangePassword: employee.mustChangePassword },
      // Bearer fallback for embedded contexts where SameSite=Lax cookies are withheld
      sessionToken: token,
    })
    res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7 })
    return res
  }

  const cValid = clientUser?.isActive && verifyPassword(parsed.data.password, clientUser.passwordHash)
  if (clientUser && cValid) {
    const token = await createSession('CLIENT_USER', clientUser.id)
    await audit({ userType: 'CLIENT_USER', userId: clientUser.id, name: clientUser.name }, 'AUTH_LOGIN', 'ClientUser', clientUser.id, 'Signed in to client portal')
    const res = NextResponse.json({
      user: { name: clientUser.name, email: clientUser.email, role: 'CLIENT', userType: 'CLIENT_USER', mustChangePassword: clientUser.mustChangePassword },
      // Bearer fallback for embedded contexts where SameSite=Lax cookies are withheld
      sessionToken: token,
    })
    res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7 })
    return res
  }

  await audit(null, 'AUTH_LOGIN_FAILED', 'Account', null, `Failed sign-in attempt for ${email.slice(0, 3)}***`)
  return jsonError('Invalid email or password', 401)
}
