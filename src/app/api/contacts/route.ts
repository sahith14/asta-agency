import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireStaff, audit, json } from '@/lib/auth'
import { parseBody } from '@/lib/rbac'

export async function GET(req: NextRequest) {
  const { error } = await requireStaff(req)
  if (error) return error
  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim()
  const contacts = await db.contact.findMany({
    where: q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }, { company: { contains: q } }] } : {},
    include: { client: { select: { id: true, name: true } } },
    orderBy: { name: 'asc' },
    take: 200,
  })
  return json({ contacts })
}

const createSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(200).optional(),
  phone: z.string().max(60).optional(),
  company: z.string().max(160).optional(),
  jobTitle: z.string().max(120).optional(),
  clientId: z.string().optional(),
  notes: z.string().max(2000).optional(),
})

export async function POST(req: NextRequest) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  const { data, error: vErr } = await parseBody(req, createSchema)
  if (vErr) return vErr
  const contact = await db.contact.create({ data: { ...data, createdById: user.userId } })
  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'CONTACT_CREATED', 'Contact', contact.id, `Created contact ${contact.name}`)
  return json({ contact }, 201)
}
