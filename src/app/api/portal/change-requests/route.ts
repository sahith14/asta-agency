import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok } from '@/lib/rbac'
import { withApi, portalUser, scopedClientId } from '../_portal'

/**
 * GET /api/portal/change-requests — the caller's own change requests (via
 * project.clientId), including the founder's decision summary (founderNotes),
 * scope impact and decision date.
 */
export const GET = withApi(async (req: NextRequest) => {
  const user = await portalUser()
  const clientId = await scopedClientId(req, user)

  const changeRequests = await db.changeRequest.findMany({
    where: { project: { clientId } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      details: true,
      status: true,
      scopeImpact: true,
      founderNotes: true,
      decisionAt: true,
      createdAt: true,
      demo: { select: { id: true, title: true } },
      project: { select: { id: true, name: true } },
    },
  })

  return ok({
    changeRequests: changeRequests.map((cr) => ({
      id: cr.id,
      title: cr.title,
      details: cr.details,
      status: cr.status,
      // Decision outcome is fine to share; internal review chatter is not stored here.
      scopeImpact: cr.scopeImpact,
      founderNotes: cr.founderNotes,
      decisionAt: cr.decisionAt,
      createdAt: cr.createdAt,
      demoId: cr.demo?.id ?? null,
      demoTitle: cr.demo?.title ?? null,
      projectId: cr.project.id,
      projectName: cr.project.name,
    })),
  })
})
