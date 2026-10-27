import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireEmployee, withApi, ok, ApiError, getIp } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { notifyUsers, clientUserIds } from '@/lib/notify'
import { ROLES, REPLY_VISIBILITIES } from '@/lib/constants'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Post a reply on a ticket.
 * - FOUNDER / CLIENT_MANAGER / SUPPORT_FINANCE: always allowed, any visibility.
 * - WEB_DEVELOPER: only on tickets whose project is assigned to them, and the
 *   reply must be INTERNAL (client-visible updates come from management/finance).
 * - CLIENT role never reaches this (requireEmployee).
 */
export const POST = withApi<Ctx>(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireEmployee()
  const { id } = await ctx.params
  const body = z
    .object({
      body: z.string().min(1).max(5000),
      visibility: z.enum(REPLY_VISIBILITIES),
    })
    .parse(await req.json())

  const ticket = await db.supportTicket.findUnique({
    where: { id },
    include: { project: { select: { assignedToId: true } } },
  })
  if (!ticket) throw new ApiError(404, 'Ticket not found', 'NOT_FOUND')

  if (user.role === ROLES.WEB_DEVELOPER) {
    if (ticket.project?.assignedToId !== user.id) {
      throw new ApiError(403, 'You can only reply on tickets for projects assigned to you', 'FORBIDDEN')
    }
    if (body.visibility === 'CLIENT') {
      throw new ApiError(403, 'Developers can only post internal notes on tickets', 'FORBIDDEN')
    }
  }

  const reply = await db.ticketReply.create({
    data: {
      ticketId: ticket.id,
      authorId: user.id,
      body: body.body,
      visibility: body.visibility,
    },
    include: { author: { select: { id: true, name: true, role: true } } },
  })

  await logAudit({
    actorId: user.id,
    actorRole: user.role,
    action: 'TICKET_REPLY_ADDED',
    entityType: 'TicketReply',
    entityId: reply.id,
    result: 'SUCCESS',
    detail: JSON.stringify({ ticketId: ticket.id, visibility: reply.visibility }),
    ip: getIp(req),
  })

  if (reply.visibility === 'CLIENT') {
    const clientIds = await clientUserIds(ticket.clientId)
    await notifyUsers(clientIds, {
      type: 'TICKET_UPDATE',
      title: 'New update on your support ticket',
      body: reply.body.length > 280 ? `${reply.body.slice(0, 277)}…` : reply.body,
      link: `/portal/support/${ticket.id}`,
      dedupeKey: `ticket-reply:${reply.id}`,
    })
  }

  return ok({ reply })
})
