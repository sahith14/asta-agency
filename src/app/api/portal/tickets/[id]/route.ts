import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { isFounder, ok, requireClientScope } from '@/lib/rbac'
import { ROLES } from '@/lib/constants'
import { withApi, notFound, portalUser } from '../../_portal'

/**
 * GET /api/portal/tickets/[id] — the caller's own support ticket with
 * CLIENT-visible replies only. Internal replies and internal ticket fields
 * never cross this boundary. Foreign client's ticket → 404 (no existence
 * leak). FOUNDER may view any ticket via ?clientId= (audited by scopedClientId
 * on list; direct access here is unrestricted for FOUNDER by design).
 */
export const GET = withApi<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const { id } = await params
  const user = await portalUser()

  const where =
    user.role === ROLES.CLIENT
      ? { id, clientId: await requireClientScope(user) }
      : isFounder(user)
        ? { id }
        : { id: '__never__' }

  const ticket = await db.supportTicket.findFirst({
    where,
    select: {
      id: true,
      subject: true,
      details: true,
      status: true,
      priority: true,
      type: true,
      createdAt: true,
      resolvedAt: true,
      clientId: true,
      projectId: true,
      project: { select: { id: true, name: true } },
      replies: {
        where: { visibility: 'CLIENT' },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          body: true,
          createdAt: true,
          author: { select: { id: true, name: true } },
        },
      },
    },
  })
  if (!ticket) notFound()

  return ok({
    ticket: {
      id: ticket.id,
      subject: ticket.subject,
      details: ticket.details,
      status: ticket.status,
      priority: ticket.priority,
      type: ticket.type,
      createdAt: ticket.createdAt,
      resolvedAt: ticket.resolvedAt,
      projectId: ticket.project?.id ?? null,
      projectName: ticket.project?.name ?? null,
      replies: ticket.replies.map((r) => ({
        id: r.id,
        body: r.body,
        createdAt: r.createdAt,
        authorName: r.author.name,
      })),
    },
  })
})
