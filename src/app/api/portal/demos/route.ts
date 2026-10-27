import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok } from '@/lib/rbac'
import { withApi, DEMO_CLIENT_VISIBLE_STATUSES, portalUser, scopedClientId } from '../_portal'

/**
 * GET /api/portal/demos — demos of the caller's client projects in
 * client-visible states only (never PREPARING / READY_FOR_FOUNDER).
 */
export const GET = withApi(async (req: NextRequest) => {
  const user = await portalUser()
  const clientId = await scopedClientId(req, user)

  const demos = await db.demo.findMany({
    where: { project: { clientId }, status: { in: [...DEMO_CLIENT_VISIBLE_STATUSES] } },
    orderBy: [{ authorizedAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      title: true,
      demoUrl: true,
      status: true,
      authorizedAt: true,
      clientApprovedAt: true,
      createdAt: true,
      project: { select: { id: true, name: true } },
    },
  })

  return ok({
    demos: demos.map((d) => ({
      id: d.id,
      title: d.title,
      // demoUrl is included only because the status filter above already
      // restricts to client-visible demo states.
      demoUrl: d.demoUrl,
      status: d.status,
      authorizedAt: d.authorizedAt,
      clientApprovedAt: d.clientApprovedAt,
      createdAt: d.createdAt,
      projectId: d.project.id,
      projectName: d.project.name,
    })),
  })
})
