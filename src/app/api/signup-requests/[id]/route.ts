import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole, audit, notify, hashPassword, generateToken, json, jsonError } from '@/lib/auth'
import { parseBody } from '@/lib/rbac'

export async function GET(req: NextRequest) {
  const { error } = await requireRole(req, ['OWNER'])
  if (error) return error
  const requests = await db.signupRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
  return json({ requests })
}

const decideSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  // On approve: create as client (portal) or staff role
  accountType: z.enum(['CLIENT_PORTAL', 'STAFF']).optional(),
  staffRole: z.enum(['CLIENT_MANAGER', 'WEB_DEVELOPER', 'SUPPORT_FINANCE', 'VIDEOGRAPHER', 'VIDEO_EDITOR', 'CREATIVE_DIRECTOR']).optional(),
  companyName: z.string().max(160).optional(),
})

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireRole(req, ['OWNER'])
  if (error) return error
  const { id } = await ctx.params
  const { data, error: vErr } = await parseBody(req, decideSchema)
  if (vErr) return vErr

  const request = await db.signupRequest.findUnique({ where: { id } })
  if (!request) return jsonError('Signup request not found', 404)
  if (request.status !== 'PENDING') return jsonError(`Request already ${request.status.toLowerCase()}`, 422)

  const email = request.email.toLowerCase()

  const tempPassword = generateToken().slice(0, 16)
  if (data.decision === 'APPROVED') {
    // Duplicate guard only blocks account creation (approve). Rejection never
    // creates an account, so a request whose account already exists (e.g. a
    // prior approval before status tracking was fixed) can still be decided.
    const existingEmployee = await db.employee.findUnique({ where: { email } })
    const existingClientUser = await db.clientUser.findUnique({ where: { email } })
    if (existingEmployee || existingClientUser) return jsonError('An account with this email already exists', 409)
    if (data.accountType === 'STAFF') {
      const employee = await db.employee.create({
        data: { name: request.name, email, role: data.staffRole ?? 'CLIENT_MANAGER', passwordHash: hashPassword(tempPassword), mustChangePassword: true },
      })
      await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'SIGNUP_APPROVED_STAFF', 'Employee', employee.id, `Approved access request → staff account ${employee.name} (${employee.role})`)
      await db.signupRequest.update({ where: { id }, data: { status: 'APPROVED', decidedById: user.userId, decidedAt: new Date() } })
      return json({ ok: true, accountType: 'STAFF', temporaryPassword: tempPassword })
    }
    // Client portal account
    const companyName = data.companyName || request.company || request.name
    let client = await db.client.findFirst({ where: { name: companyName } })
    if (!client) client = await db.client.create({ data: { name: companyName, contactName: request.name, contactEmail: email } })
    const portalUser = await db.clientUser.create({
      data: { name: request.name, email, clientId: client.id, passwordHash: hashPassword(tempPassword), mustChangePassword: true },
    })
    await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'SIGNUP_APPROVED_CLIENT', 'ClientUser', portalUser.id, `Approved access request → portal account ${portalUser.name} for ${client.name}`)
    await db.signupRequest.update({ where: { id }, data: { status: 'APPROVED', decidedById: user.userId, decidedAt: new Date() } })
    return json({ ok: true, accountType: 'CLIENT_PORTAL', temporaryPassword: tempPassword, clientId: client.id })
  }

  await db.signupRequest.update({ where: { id }, data: { status: 'REJECTED', decidedById: user.userId, decidedAt: new Date() } })
  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'SIGNUP_REJECTED', 'SignupRequest', id, `Rejected access request from ${request.name} (${email.slice(0, 3)}***)`)
  return json({ ok: true })
}
