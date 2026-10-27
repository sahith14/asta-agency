import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getIp, isFounder, ok, requireClientScope } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { notifyUsers, roleUserIds } from '@/lib/notify'
import { ROLES } from '@/lib/constants'
import { withApi, notFound, portalUser } from '../../../_portal'

const replySchema = z.object({
  body: z.string().trim().min(1, 'Please write a reply').max(4000),
})

/**
 * POST /api/portal/tickets/[id]/replies — client reply on THEIR ticket.
 * Creates TicketReply with visibility CLIENT; audited (TICKET_CLIENT_REPLIED);
 * notifies SUPPORT_FINANCE + FOUNDER + CLIENT_MANAGER with a stable dedupeKey.
 * Staff progress updates are posted from the internal app and appear here
 * automatically (client-visible replies only).
 */
export const POST = withApi<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params
  const user = await portalUser()
  const body = replySchema.parse(await req.json().catch(() => ({})))

  // CLIENT: strictly scoped (404 for other clients' tickets — no existence leak).
  // FOUNDER: unrestricted, scope derived from the ticket.
  const where =
    user.role === ROLES.CLIENT
      ? { id, clientId: await requireClientScope(user) }
      : isFounder(user)
        ? { id }
        : { id: '__never__' }
  const ticket = await db.supportTicket.findFirst({
    where,
    select: { id: true },
  })
  if (!ticket) notFound()

  const reply = await db.ticketReply.create({
    data: { ticketId: ticket.id, authorId: user.id, body: body.body, visibility: 'CLIENT' },
  })

  await logAudit({
    actorId: user.id,
    actorRole: user.role,
    action: 'TICKET_CLIENT_REPLIED',
    entityType: 'SupportTicket',
    entityId: ticket.id,
    result: 'SUCCESS',
    detail: JSON.stringify({ replyId: reply.id }),
    ip: getIp(req),
  })

  await notifyUsers(await roleUserIds([ROLES.SUPPORT_FINANCE, ROLES.FOUNDER, ROLES.CLIENT_MANAGER]), {
    type: 'TICKET_REPLY',
    title: 'Client replied to a ticket',
    body: `${user.name} replied to a support ticket.`,
    link: '/app/tickets',
    dedupeKey: `ticket-reply-client:${reply.id}`,
  })

  return ok(
    {
      reply: { id: reply.id, body: reply.body, createdAt: reply.createdAt, authorName: user.name },
    },
    201,
  )
})
