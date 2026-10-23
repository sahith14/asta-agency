import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireStaff, audit, hashPassword, generateToken, notify, json, jsonError } from '@/lib/auth'
import { can, parseBody } from '@/lib/rbac'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  const { id } = await ctx.params
  const client = await db.client.findUnique({
    where: { id },
    include: {
      projects: { select: { id: true, name: true, reference: true, serviceType: true, status: true, targetDate: true } },
      portalUsers: { select: { id: true, name: true, email: true, isActive: true } },
      _count: { select: { invoices: true, tickets: true } },
    },
  })
  if (!client) return jsonError('Client not found', 404)
  return json({ client })
}

const updateSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  businessCategory: z.string().max(80).optional(),
  contactName: z.string().max(120).optional(),
  contactEmail: z.string().email().max(200).optional(),
  contactPhone: z.string().max(60).optional(),
  address: z.string().max(400).optional(),
  notes: z.string().max(4000).optional(),
  isActive: z.boolean().optional(),
})

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  if (!can(user, 'clients.manage')) return jsonError('You do not have permission to update clients', 403)
  const { id } = await ctx.params
  const { data, error: vErr } = await parseBody(req, updateSchema)
  if (vErr) return vErr
  const client = await db.client.findUnique({ where: { id } })
  if (!client) return jsonError('Client not found', 404)
  const updated = await db.client.update({ where: { id }, data })
  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'CLIENT_UPDATED', 'Client', id, `Updated client ${updated.name}`)
  return json({ client: updated })
}

const portalUserSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // Create a portal user for this client (OWNER / CLIENT_MANAGER)
  const { user, error } = await requireStaff(req)
  if (error) return error
  if (!['OWNER', 'CLIENT_MANAGER'].includes(user.role)) return jsonError('You do not have permission to create portal users', 403)
  const { id } = await ctx.params
  const { data, error: vErr } = await parseBody(req, portalUserSchema)
  if (vErr) return vErr

  const client = await db.client.findUnique({ where: { id } })
  if (!client) return jsonError('Client not found', 404)
  const email = data.email.toLowerCase().trim()
  const exists = await db.clientUser.findUnique({ where: { email } })
  if (exists) return jsonError('A portal user with this email already exists', 409)

  const tempPassword = generateToken().slice(0, 16)
  const portalUser = await db.clientUser.create({
    data: { name: data.name, email, clientId: id, passwordHash: hashPassword(tempPassword), mustChangePassword: true },
  })
  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'PORTAL_USER_CREATED', 'ClientUser', portalUser.id, `Created portal user for ${client.name}`)
  return json({ portalUser: { id: portalUser.id, name: portalUser.name, email: portalUser.email }, temporaryPassword: tempPassword }, 201)
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // Archive (soft) — never hard-delete commercial records
  const { user, error } = await requireStaff(req)
  if (error) return error
  if (!can(user, 'clients.manage')) return jsonError('You do not have permission to archive clients', 403)
  const { id } = await ctx.params
  const client = await db.client.findUnique({ where: { id } })
  if (!client) return jsonError('Client not found', 404)
  await db.client.update({ where: { id }, data: { isActive: false } })
  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'CLIENT_ARCHIVED', 'Client', id, `Archived client ${client.name}`)
  return json({ ok: true })
}

// portal user reset: PUT /api/clients/[id] with { portalUserId, newPassword? }
const resetPortalSchema = z.object({
  portalUserId: z.string().min(1),
})

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  if (!['OWNER', 'CLIENT_MANAGER'].includes(user.role)) return jsonError('You do not have permission to reset portal passwords', 403)
  const { id } = await ctx.params
  const { data, error: vErr } = await parseBody(req, resetPortalSchema)
  if (vErr) return vErr
  const portalUser = await db.clientUser.findUnique({ where: { id: data.portalUserId } })
  if (!portalUser || portalUser.clientId !== id) return jsonError('Portal user not found', 404)
  const newPassword = generateToken().slice(0, 16)
  await db.clientUser.update({ where: { id: portalUser.id }, data: { passwordHash: hashPassword(newPassword), mustChangePassword: true } })
  await db.session.deleteMany({ where: { userType: 'CLIENT_USER', userId: portalUser.id } })
  await notify('CLIENT_USER', portalUser.id, 'PORTAL_PASSWORD_RESET', 'Your portal password was reset', 'Ask your account manager for the new temporary password.', '/login')
  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'PORTAL_PASSWORD_RESET', 'ClientUser', portalUser.id, `Reset portal password for ${portalUser.name}`)
  return json({ ok: true, temporaryPassword: newPassword })
}
