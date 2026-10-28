import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireStaff, requireRole, audit, hashPassword, generateToken, notify, json, jsonError } from '@/lib/auth'
import { parseBody, getPagination } from '@/lib/rbac'

export async function GET(req: NextRequest) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  // All staff can see the team directory (name/role only, no credentials)
  const url = new URL(req.url)
  const { skip, take } = getPagination(url)
  const where = { isActive: true }
  const [total, employees] = await Promise.all([
    db.employee.count({ where }),
    db.employee.findMany({
      where, skip, take,
      select: { id: true, name: true, email: true, role: true, title: true, phone: true, isActive: true, mustChangePassword: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
  ])
  return json({ total, employees })
}

const createSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  role: z.enum(['OWNER', 'CLIENT_MANAGER', 'WEB_DEVELOPER', 'SUPPORT_FINANCE', 'VIDEOGRAPHER', 'VIDEO_EDITOR', 'CREATIVE_DIRECTOR']),
  title: z.string().max(120).optional(),
  phone: z.string().max(60).optional(),
})

export async function POST(req: NextRequest) {
  const { user, error } = await requireRole(req, ['OWNER'])
  if (error) return error
  const { data, error: vErr } = await parseBody(req, createSchema)
  if (vErr) return vErr

  const email = data.email.toLowerCase().trim()
  const existing = await db.employee.findUnique({ where: { email } })
  if (existing) return jsonError('A team member with this email already exists', 409)

  const tempPassword = generateToken().slice(0, 16)
  const employee = await db.employee.create({
    data: {
      name: data.name, email, role: data.role, title: data.title, phone: data.phone,
      passwordHash: hashPassword(tempPassword), mustChangePassword: true,
    },
  })
  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'TEAM_CREATED', 'Employee', employee.id, `Created team member ${employee.name} (${employee.role})`)
  await notify('EMPLOYEE', employee.id, 'TEAM_WELCOME', 'Welcome to AgencyOS', 'Your account has been created. Please ask the Founder for your temporary password and change it on first sign-in.', '/login')

  return json({ employee: { id: employee.id, name: employee.name, email: employee.email, role: employee.role }, temporaryPassword: tempPassword }, 201)
}
