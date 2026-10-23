import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { generateToken, hashToken, audit, json, jsonError } from '@/lib/auth'

const schema = z.object({ email: z.string().email().max(200) })

// Honest password recovery: no email delivery is configured in this environment.
// A single-use reset token is recorded server-side; the plaintext token is NOT
// returned to the requester. Reset is completed by the Founder via team/portal
// user management, or by staff using their current password.
export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch { return jsonError('Invalid JSON body', 400) }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return jsonError('Please provide a valid email address', 400)

  const email = parsed.data.email.toLowerCase().trim()
  const employee = await db.employee.findUnique({ where: { email } })
  const clientUser = employee ? null : await db.clientUser.findUnique({ where: { email } })
  const account = employee ?? clientUser
  const userType = employee ? 'EMPLOYEE' : 'CLIENT_USER'

  if (account && account.isActive) {
    const token = generateToken()
    await db.passwordResetToken.create({
      data: { token: hashToken(token), userType, userId: account.id, expiresAt: new Date(Date.now() + 1000 * 60 * 60) },
    })
    await audit(
      { userType: 'SYSTEM', name: 'Password recovery' },
      'AUTH_RESET_REQUESTED', userType, account.id,
      `Password reset requested for ${email.slice(0, 3)}*** (token recorded; reset completes via Founder-mediated flow)`,
    )
  }
  // Generic response — never reveal whether the account exists
  return json({ message: 'If an account exists for this address, a reset request has been recorded. Please contact your account manager to complete the reset.' })
}
