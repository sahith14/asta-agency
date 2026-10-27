import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireEmployee, withApi, ok, ApiError, getIp } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { notifyUsers, clientUserIds } from '@/lib/notify'
import { ROLES, TICKET_STATUSES, TICKET_TYPES, TASK_PRIORITIES } from '@/lib/constants'

/**
 * Internal support tickets.
 * - All employees may list/create (CLIENT role is rejected by requireEmployee).
 * - WEB_DEVELOPER is read-scoped: only tickets on projects assigned to them or
 *   tickets they created. Finance sees all (billing/support is their job).
 */

const listQuerySchema = z.object({
  status: z.string().optional(),
  clientId: z.string().optional(),
  projectId: z.string().optional(),
  priority: z.string().optional(),
})

export const GET = withApi(async (req: NextRequest) => {
  const user = await requireEmployee()
  const url = new URL(req.url)
  const q = listQuerySchema.parse(Object.fromEntries(url.searchParams.entries()))

  const filters: Record<string, unknown> = {}
  if (q.status && TICKET_STATUSES.includes(q.status as (typeof TICKET_STATUSES)[number])) filters.status = q.status
  if (q.clientId) filters.clientId = q.clientId
  if (q.projectId) filters.projectId = q.projectId
  if (q.priority && TASK_PRIORITIES.includes(q.priority as (typeof TASK_PRIORITIES)[number])) filters.priority = q.priority

  // Developer scope: tickets on projects assigned to them, or created by them.
  if (user.role === ROLES.WEB_DEVELOPER) {
    filters.OR = [{ project: { assignedToId: user.id } }, { createdById: user.id }]
  }

  const tickets = await db.supportTicket.findMany({
    where: filters,
    include: {
      client: { select: { id: true, name: true } },
      project: { select: { id: true, name: true, assignedToId: true } },
      createdBy: { select: { id: true, name: true } },
      _count: { select: { replies: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  return ok({ tickets })
})

const createSchema = z.object({
  clientId: z.string().min(1),
  projectId: z.string().min(1).optional().nullable(),
  subject: z.string().min(3).max(200),
  details: z.string().min(1).max(5000),
  type: z.enum(TICKET_TYPES),
  priority: z.enum(TASK_PRIORITIES),
})

export const POST = withApi(async (req: NextRequest) => {
  const user = await requireEmployee()
  const body = createSchema.parse(await req.json())

  const client = await db.client.findUnique({ where: { id: body.clientId } })
  if (!client) throw new ApiError(400, 'Unknown client', 'INVALID_CLIENT')
  if (body.projectId) {
    const project = await db.project.findUnique({ where: { id: body.projectId } })
    if (!project || project.clientId !== body.clientId) {
      throw new ApiError(400, 'Project does not belong to the selected client', 'INVALID_PROJECT')
    }
  }

  const ticket = await db.supportTicket.create({
    data: {
      clientId: body.clientId,
      projectId: body.projectId ?? null,
      createdById: user.id,
      source: 'INTERNAL',
      type: body.type,
      subject: body.subject,
      details: body.details,
      priority: body.priority,
      status: 'OPEN',
    },
    include: {
      client: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  })

  await logAudit({
    actorId: user.id,
    actorRole: user.role,
    action: 'TICKET_CREATED',
    entityType: 'SupportTicket',
    entityId: ticket.id,
    result: 'SUCCESS',
    detail: JSON.stringify({ subject: ticket.subject, clientId: ticket.clientId, source: 'INTERNAL' }),
    ip: getIp(req),
  })

  // Heads-up for the client's portal users that the agency opened a ticket on their behalf.
  const clientIds = await clientUserIds(ticket.clientId)
  await notifyUsers(clientIds, {
    type: 'TICKET_UPDATE',
    title: `Support ticket opened: ${ticket.subject}`,
    body: 'Our team opened a support ticket for your account. We will keep you updated here.',
    link: `/portal/support/${ticket.id}`,
    dedupeKey: `ticket-opened:${ticket.id}`,
  })

  return ok({ ticket })
})
