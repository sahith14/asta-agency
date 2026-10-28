import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole, audit, json, jsonError } from '@/lib/auth'
import { parseBody } from '@/lib/rbac'

const submitSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  company: z.string().max(160).optional(),
  message: z.string().max(4000).optional(),
})

// POST /api/signup-requests — public access-request endpoint (rate limited, generic response)
const attempts = new Map<string, { count: number; resetAt: number }>()
function rateLimit(key: string, limit = 5, windowMs = 60 * 60 * 1000): boolean {
  const now = Date.now()
  const entry = attempts.get(key)
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  entry.count++
  return entry.count <= limit
}

// GET /api/signup-requests — OWNER reviews access requests
export async function GET(req: NextRequest) {
  const { error } = await requireRole(req, ['OWNER'])
  if (error) return error
  const requests = await db.signupRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
  return json({ requests })
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
  if (!rateLimit(ip)) return jsonError('Too many requests. Please try again later.', 429)
  const { data, error: vErr } = await parseBody(req, submitSchema)
  if (vErr) return vErr

  const email = data.email.toLowerCase().trim()
  const existing = await db.signupRequest.findFirst({ where: { email, status: 'PENDING' } })
  if (!existing) {
    const request = await db.signupRequest.create({
      data: { name: data.name, email, company: data.company, message: data.message },
    })
    await audit({ userType: 'SYSTEM', name: 'Access request' }, 'SIGNUP_REQUESTED', 'SignupRequest', request.id, `Access request from ${data.name} (${email.slice(0, 3)}***)`)
  }
  // Generic success regardless of duplicate status
  return json({ message: 'Thank you. Your request has been received and our team will be in touch.' }, 201)
}
