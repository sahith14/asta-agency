import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { withApi, ok, ApiError, requireRole } from '@/lib/rbac'
import { ROLES, BRIEF_STATUSES } from '@/lib/constants'
import { briefCreateSchema, createBrief } from './_briefs'

/**
 * Briefs (Stage 2) — employee-side list + create-on-behalf.
 *  - GET:  employees (CLIENT_MANAGER / WEB_DEVELOPER / SUPPORT_FINANCE; FOUNDER unrestricted)
 *  - POST: FOUNDER / CLIENT_MANAGER (explicit clientId required — creating on behalf)
 * Clients manage their own briefs via /api/portal/briefs. The status machine
 * lives in the [id] routes.
 */
export const GET = withApi(async (req: NextRequest) => {
  await requireRole([ROLES.CLIENT_MANAGER, ROLES.WEB_DEVELOPER, ROLES.SUPPORT_FINANCE])
  const url = new URL(req.url)
  const status = url.searchParams.get('status')?.trim()
  if (status && !BRIEF_STATUSES.includes(status as (typeof BRIEF_STATUSES)[number])) {
    throw new ApiError(400, 'Invalid status filter', 'INVALID_FILTER')
  }

  const briefs = await db.brief.findMany({
    where: status ? { status } : {},
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      status: true,
      budget: true,
      timeline: true,
      submittedAt: true,
      createdAt: true,
      updatedAt: true,
      clientId: true,
      projectId: true,
      client: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      reviewedBy: { select: { id: true, name: true } },
    },
  })
  return ok({ briefs })
})

/** POST — founder / manager creates a brief on behalf of a client. */
export const POST = withApi(async (req: NextRequest) => {
  const user = await requireRole([ROLES.CLIENT_MANAGER])
  const body = briefCreateSchema.parse(await req.json())

  const client = await db.client.findUnique({ where: { id: body.clientId }, select: { id: true } })
  if (!client) throw new ApiError(400, 'Unknown client', 'INVALID_CLIENT')

  const brief = await createBrief(req, user, body.clientId, body)
  return ok({ brief }, 201)
})
