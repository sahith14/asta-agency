import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { assertOwnershipOrNotFound, ok } from '@/lib/rbac'
import { withApi, DEMO_CLIENT_VISIBLE_STATUSES, notFound, portalUser, scopedClientId } from '../../_portal'

/**
 * GET /api/portal/demos/[id] — single demo scoped to the caller's client AND
 * to client-visible statuses (internal-stage demos 404 — no existence leaks).
 * All demo feedback is client-visible by design.
 */
export const GET = withApi<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params
  const user = await portalUser()
  const clientId = await scopedClientId(req, user)

  const demo = await db.demo.findFirst({
    where: { id, status: { in: [...DEMO_CLIENT_VISIBLE_STATUSES] }, project: { clientId } },
    select: {
      id: true,
      title: true,
      demoUrl: true,
      status: true,
      authorizedAt: true,
      clientApprovedAt: true,
      createdAt: true,
      project: { select: { id: true, name: true } },
      feedback: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          type: true,
          message: true,
          createdAt: true,
          author: { select: { name: true, role: true } },
        },
      },
    },
  })

  assertOwnershipOrNotFound(Boolean(demo))
  if (!demo) notFound() // unreachable; satisfies TS narrowing with the same 404

  return ok({
    demo: {
      id: demo.id,
      title: demo.title,
      // Status filter guarantees the demo is in a client-visible state.
      demoUrl: demo.demoUrl,
      status: demo.status,
      authorizedAt: demo.authorizedAt,
      clientApprovedAt: demo.clientApprovedAt,
      createdAt: demo.createdAt,
      project: { id: demo.project.id, name: demo.project.name },
      feedback: demo.feedback.map((f) => ({
        id: f.id,
        type: f.type,
        message: f.message,
        createdAt: f.createdAt,
        authorName: f.author.name,
        authorRole: f.author.role,
      })),
    },
  })
})
