import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withApi, ok, ApiError, requireRole } from '@/lib/rbac'
import { logAudit, auditFromRequest } from '@/lib/audit'
import { notifyUsers } from '@/lib/notify'
import { ROLES } from '@/lib/constants'
import { briefDetailSelect } from '../_briefs'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Brief detail + employee review actions (Stage 2).
 *  - GET:   employees (CLIENT_MANAGER / WEB_DEVELOPER / SUPPORT_FINANCE; FOUNDER unrestricted)
 *  - PATCH: FOUNDER / CLIENT_MANAGER only — review status machine:
 *           SUBMITTED | IN_REVIEW → IN_REVIEW | ACCEPTED | REJECTED
 *           (ACCEPTED/REJECTED stamp reviewedBy/At; the client author is notified.)
 */
const reviewSchema = z.object({
  status: z.enum(['IN_REVIEW', 'ACCEPTED', 'REJECTED']),
  reviewNotes: z.string().trim().max(2000).optional().nullable(),
})

export const GET = withApi<Ctx>(async (_req: NextRequest, ctx: Ctx) => {
  await requireRole([ROLES.CLIENT_MANAGER, ROLES.WEB_DEVELOPER, ROLES.SUPPORT_FINANCE])
  const { id } = await ctx.params
  const brief = await db.brief.findUnique({ where: { id }, select: briefDetailSelect })
  if (!brief) throw new ApiError(404, 'Not found', 'NOT_FOUND')
  return ok({ brief })
})

export const PATCH = withApi<Ctx>(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireRole([ROLES.CLIENT_MANAGER])
  const { id } = await ctx.params
  const body = reviewSchema.parse(await req.json())

  const existing = await db.brief.findUnique({ where: { id }, select: { id: true, status: true, title: true, createdById: true } })
  if (!existing) throw new ApiError(404, 'Not found', 'NOT_FOUND')

  const reviewable = existing.status === 'SUBMITTED' || existing.status === 'IN_REVIEW'
  if (!reviewable) {
    throw new ApiError(400, `Briefs in status ${existing.status} cannot be reviewed`, 'INVALID_TRANSITION')
  }

  const data: Record<string, unknown> = { status: body.status }
  if (body.reviewNotes !== undefined) data.reviewNotes = body.reviewNotes || null
  if (body.status === 'ACCEPTED' || body.status === 'REJECTED') {
    data.reviewedById = user.id
    data.reviewedAt = new Date()
  }

  const brief = await db.brief.update({
    where: { id },
    data,
    select: {
      id: true,
      title: true,
      status: true,
      reviewNotes: true,
      clientId: true,
      client: { select: { id: true, name: true } },
    },
  })

  await logAudit(
    auditFromRequest(req, {
      actorId: user.id,
      actorRole: user.role,
      action: 'BRIEF_REVIEWED',
      entityType: 'Brief',
      entityId: id,
      result: 'SUCCESS',
      detail: JSON.stringify({ from: existing.status, to: body.status }),
    })
  )

  // Decisions (not in-review moves) go back to the brief's author.
  if (body.status === 'ACCEPTED' || body.status === 'REJECTED') {
    await notifyUsers([existing.createdById], {
      type: 'BRIEF_REVIEWED',
      title: `Brief ${body.status === 'ACCEPTED' ? 'accepted' : 'rejected'}: ${existing.title}`,
      body: body.reviewNotes?.slice(0, 200) || 'Your brief has been reviewed by the agency.',
      link: '/portal/briefs',
      dedupeKey: `brief-reviewed:${id}:${body.status}`,
    })
  }

  return ok({ brief })
})
