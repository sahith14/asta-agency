import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withApi, ok, ApiError, requireRole, getIp } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { hashPassword, generatePassword } from '@/lib/auth'
import { ROLES } from '@/lib/constants'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Approve a sign-up request (Stage 2) — FOUNDER only.
 * Creates the portal user (role CLIENT, mustChangePassword=true) linked to an
 * existing client of the Founder's choosing, or to a brand-new Client (LEAD).
 * The generated temporary password is returned ONCE and never audited or
 * stored in plaintext. Session model and credential handling are identical to
 * the existing founder-mediated reset flow (/api/team/[id]/reset-password).
 */
const approveSchema = z.object({
  clientId: z.string().max(64).optional(),
  clientName: z.string().trim().max(160).optional(),
  userName: z.string().trim().max(120).optional(),
})

export const POST = withApi<Ctx>(async (req: NextRequest, ctx: Ctx) => {
  const actor = await requireRole([ROLES.FOUNDER])
  const { id } = await ctx.params
  const body = approveSchema.parse(await req.json().catch(() => ({})))

  const request = await db.signupRequest.findUnique({ where: { id } })
  if (!request) throw new ApiError(404, 'Request not found', 'NOT_FOUND')
  if (request.status !== 'PENDING') {
    throw new ApiError(400, 'This request has already been reviewed', 'ALREADY_REVIEWED')
  }

  const emailTaken = await db.user.findUnique({ where: { email: request.email }, select: { id: true } })
  if (emailTaken) {
    throw new ApiError(400, 'A user with this email already exists', 'EMAIL_TAKEN')
  }

  // Resolve or create the client business.
  let clientId = body.clientId
  if (clientId) {
    const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true } })
    if (!client) throw new ApiError(400, 'Unknown client', 'INVALID_CLIENT')
  } else {
    const name = (body.clientName ?? request.company).slice(0, 160)
    const client = await db.client.create({
      data: {
        name,
        contactName: body.userName ?? request.name,
        email: request.email,
        status: 'LEAD',
        internalNotes: 'Created from an approved portal access request.',
      },
      select: { id: true },
    })
    clientId = client.id
  }

  const password = generatePassword()
  const user = await db.user.create({
    data: {
      email: request.email,
      name: body.userName ?? request.name,
      role: ROLES.CLIENT,
      clientId,
      passwordHash: hashPassword(password),
      mustChangePassword: true,
    },
    select: { id: true, name: true, email: true, clientId: true },
  })

  await db.signupRequest.update({
    where: { id },
    data: {
      status: 'APPROVED',
      reviewedById: actor.id,
      reviewedAt: new Date(),
      createdClientId: clientId,
      createdUserId: user.id,
    },
  })

  await logAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'SIGNUP_REQUEST_APPROVED',
    entityType: 'SignupRequest',
    entityId: id,
    result: 'SUCCESS',
    detail: JSON.stringify({ userId: user.id, clientId, mustChangePassword: true }),
    ip: getIp(req),
  })

  return ok({ user, clientId, generatedPassword: password })
})
