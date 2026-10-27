import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withApi, ok, ApiError, requireRole, getIp } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { ROLES } from '@/lib/constants'

type Ctx = { params: Promise<{ id: string }> }

/** Reject a sign-up request (Stage 2) — FOUNDER only. No notification is sent
 * (the requester has no account yet; email delivery is not connected). */
const rejectSchema = z.object({
  notes: z.string().trim().max(2000).optional().nullable(),
})

export const POST = withApi<Ctx>(async (req: NextRequest, ctx: Ctx) => {
  const actor = await requireRole([ROLES.FOUNDER])
  const { id } = await ctx.params
  const body = rejectSchema.parse(await req.json().catch(() => ({})))

  const request = await db.signupRequest.findUnique({ where: { id }, select: { id: true, status: true } })
  if (!request) throw new ApiError(404, 'Request not found', 'NOT_FOUND')
  if (request.status !== 'PENDING') {
    throw new ApiError(400, 'This request has already been reviewed', 'ALREADY_REVIEWED')
  }

  await db.signupRequest.update({
    where: { id },
    data: {
      status: 'REJECTED',
      reviewNotes: body.notes || null,
      reviewedById: actor.id,
      reviewedAt: new Date(),
    },
  })

  await logAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'SIGNUP_REQUEST_REJECTED',
    entityType: 'SignupRequest',
    entityId: id,
    result: 'SUCCESS',
    detail: JSON.stringify({ notes: body.notes ? 'provided' : null }),
    ip: getIp(req),
  })

  return ok({ success: true })
})
