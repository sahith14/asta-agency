import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireStaff, audit, json } from '@/lib/auth'
import { can, getPagination, parseBody } from '@/lib/rbac'

export async function GET(req: NextRequest) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  // Client directory restricted to client-facing + finance roles (delivery roles see client names via their assigned projects only)
  if (!['OWNER', 'CLIENT_MANAGER', 'SUPPORT_FINANCE', 'CREATIVE_DIRECTOR'].includes(user.role)) {
    return json({ error: 'You do not have permission to view the client directory' }, 403)
  }
  const url = new URL(req.url)
  const { skip, take } = getPagination(url)
  const search = url.searchParams.get('q')?.trim()
  const where = {
    isActive: true,
    ...(search ? { OR: [
      { name: { contains: search } },
      { contactName: { contains: search } },
      { contactEmail: { contains: search } },
    ] } : {}),
  }
  const [total, clients] = await Promise.all([
    db.client.count({ where }),
    db.client.findMany({
      where, skip, take,
      include: { _count: { select: { projects: true, invoices: true, portalUsers: true } } },
      orderBy: { name: 'asc' },
    }),
  ])
  return json({ total, clients })
}

const createSchema = z.object({
  name: z.string().min(1).max(160),
  businessCategory: z.enum(['Restaurant', 'Cafe / Coffee Shop', 'Food and Beverage', 'Real Estate / Property', 'Retail', 'Hospitality', 'Corporate', 'Events', 'Personal Brand', 'Automotive', 'Healthcare / Professional Services', 'Other']).default('Other'),
  contactName: z.string().max(120).optional(),
  contactEmail: z.string().email().max(200).optional(),
  contactPhone: z.string().max(60).optional(),
  address: z.string().max(400).optional(),
  notes: z.string().max(4000).optional(),
})

export async function POST(req: NextRequest) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  if (!can(user, 'clients.manage')) return json({ error: 'You do not have permission to create clients' }, 403)
  const { data, error: vErr } = await parseBody(req, createSchema)
  if (vErr) return vErr

  const client = await db.client.create({ data })
  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'CLIENT_CREATED', 'Client', client.id, `Created client ${client.name}`)
  return json({ client }, 201)
}
