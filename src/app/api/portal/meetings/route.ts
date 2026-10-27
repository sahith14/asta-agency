import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok } from '@/lib/rbac'
import { withApi, portalUser, scopedClientId } from '../_portal'

/**
 * GET /api/portal/meetings — the caller's own client meetings, read-only.
 * Scope is forced server-side (clients can never pass a foreign clientId).
 */
export const GET = withApi(async (req: NextRequest) => {
  const user = await portalUser()
  const clientId = await scopedClientId(req, user)

  const meetings = await db.meeting.findMany({
    where: { clientId },
    orderBy: { startsAt: 'desc' },
    select: {
      id: true,
      title: true,
      description: true,
      startsAt: true,
      durationMinutes: true,
      location: true,
      meetingLink: true,
      status: true,
      outcome: true,
      project: { select: { id: true, name: true } },
    },
  })
  return ok({ meetings })
})
