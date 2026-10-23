import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireClientUser, audit, notify, makeReference, json } from '@/lib/auth'
import { parseBody } from '@/lib/rbac'

export async function GET(req: NextRequest) {
  const { user, error } = await requireClientUser(req)
  if (error) return error
  const tickets = await db.ticket.findMany({
    where: { clientId: user.clientId! },
    include: {
      replies: { where: { isInternal: false }, orderBy: { createdAt: 'asc' } },
      project: { select: { name: true, reference: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })
  return json({ tickets })
}

const createSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(8000),
  projectId: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
})

export async function POST(req: NextRequest) {
  const { user, error } = await requireClientUser(req)
  if (error) return error
  const { data, error: vErr } = await parseBody(req, createSchema)
  if (vErr) return vErr
  const ticket = await db.ticket.create({
    data: {
      reference: makeReference('TK'),
      clientId: user.clientId!,
      projectId: data.projectId,
      subject: data.subject, body: data.body, priority: data.priority,
      raisedByType: 'CLIENT_USER', raisedById: user.userId,
    },
  })
  await audit({ userType: 'CLIENT_USER', userId: user.userId, name: user.name }, 'TICKET_CREATED', 'Ticket', ticket.id, `Support request: ${ticket.subject}`)
  const staff = await db.employee.findMany({ where: { role: { in: ['OWNER', 'SUPPORT_FINANCE', 'CLIENT_MANAGER'] }, isActive: true }, select: { id: true } })
  for (const s of staff) {
    await notify('EMPLOYEE', s.id, 'TICKET_CREATED', `New support request: ${ticket.subject}`, data.body.slice(0, 150), '/app')
  }
  return json({ ticket: { id: ticket.id, reference: ticket.reference, subject: ticket.subject, status: ticket.status } }, 201)
}

const replySchema = z.object({ body: z.string().min(1).max(4000) })

// PUT /api/portal/tickets — reply to own ticket
export async function PUT(req: NextRequest) {
  const { user, error } = await requireClientUser(req)
  if (error) return error
  const { data, error: vErr } = await parseBody(req, z.object({ ticketId: z.string().min(1), body: z.string().min(1).max(4000) }))
  if (vErr) return vErr
  const ticket = await db.ticket.findUnique({ where: { id: data.ticketId } })
  if (!ticket || ticket.clientId !== user.clientId) return json({ error: 'Ticket not found' }, 404)
  const reply = await db.ticketReply.create({
    data: { ticketId: ticket.id, authorType: 'CLIENT_USER', authorId: user.userId, authorName: user.name, body: data.body, isInternal: false },
  })
  await db.ticket.update({ where: { id: ticket.id }, data: { status: ticket.status === 'RESOLVED' || ticket.status === 'CLOSED' ? 'OPEN' : ticket.status } })
  const staff = await db.employee.findMany({ where: { role: { in: ['OWNER', 'SUPPORT_FINANCE', 'CLIENT_MANAGER'] }, isActive: true }, select: { id: true } })
  for (const s of staff) await notify('EMPLOYEE', s.id, 'TICKET_REPLY', `Client replied: ${ticket.subject}`, data.body.slice(0, 150), '/app')
  return json({ reply }, 201)
}
