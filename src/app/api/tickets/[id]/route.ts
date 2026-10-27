import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireEmployee, requireRole, withApi, ok, ApiError, getIp } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { notifyUsers, clientUserIds } from '@/lib/notify'
import { ROLES, TICKET_STATUSES, TASK_PRIORITIES } from '@/lib/constants'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Ticket detail & status/priority updates.
 * - GET: staff read; WEB_DEVELOPER only tickets on their assigned projects or
 *   tickets they created (404 otherwise — no existence leak).
 * - PATCH: FOUNDER / CLIENT_MANAGER / SUPPORT_FINANCE only. Developers cannot
 *   change ticket status or priority.
 */
export const GET = withApi<Ctx>(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireEmployee()
  const { id } = await ctx.params

  const ticket = await db.supportTicket.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true } },
      project: { select: { id: true, name: true, assignedToId: true } },
      createdBy: { select: { id: true, name: true, role: true } },
      replies: {
        include: { author: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!ticket) throw new ApiError(404, 'Ticket not found', 'NOT_FOUND')

  if (user.role === ROLES.WEB_DEVELOPER) {
    const allowed = ticket.project?.assignedToId === user.id || ticket.createdById === user.id
    if (!allowed) throw new ApiError(404, 'Ticket not found', 'NOT_FOUND')
  }

  return ok({ ticket, viewer: { id: user.id, role: user.role } })
})

const patchSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
})

export const PATCH = withApi<Ctx>(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireRole([ROLES.CLIENT_MANAGER, ROLES.SUPPORT_FINANCE])
  const { id } = await ctx.params
  const body = patchSchema.parse(await req.json())

  const ticket = await db.supportTicket.findUnique({
    where: { id },
    include: { project: { select: { assignedToId: true } } },
  })
  if (!ticket) throw new ApiError(404, 'Ticket not found', 'NOT_FOUND')

  const data: { status?: string; priority?: string; resolvedAt?: Date | null } = {}
  if (body.status && body.status !== ticket.status) data.status = body.status
  if (body.priority && body.priority !== ticket.priority) data.priority = body.priority
  if (data.status === 'RESOLVED') data.resolvedAt = new Date()
  if (data.status && data.status !== 'RESOLVED') data.resolvedAt = null

  if (Object.keys(data).length === 0) {
    return ok({ ticket })
  }

  const updated = await db.supportTicket.update({
    where: { id: ticket.id },
    data,
    include: {
      client: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  })

  if (data.status) {
    await logAudit({
      actorId: user.id,
      actorRole: user.role,
      action: 'TICKET_STATUS_CHANGED',
      entityType: 'SupportTicket',
      entityId: ticket.id,
      result: 'SUCCESS',
      detail: JSON.stringify({ subject: ticket.subject, from: ticket.status, to: data.status }),
      ip: getIp(req),
    })

    if (data.status === 'RESOLVED' || data.status === 'CLOSED') {
      const clientIds = await clientUserIds(ticket.clientId)
      await notifyUsers(clientIds, {
        type: 'TICKET_UPDATE',
        title: data.status === 'RESOLVED' ? `Ticket resolved: ${ticket.subject}` : `Ticket closed: ${ticket.subject}`,
        body: 'Your support ticket has been updated by our team.',
        link: `/portal/support/${ticket.id}`,
        dedupeKey: `ticket-status:${ticket.id}:${data.status}`,
      })
    }
  }

  if (data.priority) {
    await logAudit({
      actorId: user.id,
      actorRole: user.role,
      action: 'TICKET_PRIORITY_CHANGED',
      entityType: 'SupportTicket',
      entityId: ticket.id,
      result: 'SUCCESS',
      detail: JSON.stringify({ subject: ticket.subject, from: ticket.priority, to: data.priority }),
      ip: getIp(req),
    })
  }

  return ok({ ticket: updated })
})
