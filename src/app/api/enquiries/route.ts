import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createHash } from 'crypto'
import { db } from '@/lib/db'
import { audit, json, jsonError, makeReference, notify, requireRole } from '@/lib/auth'
import { rateLimitAll, rateLimit } from '@/lib/rate-limit'
import { getPagination } from '@/lib/rbac'
import { site } from '@/lib/site-content'

/**
 * PUBLIC endpoint — website enquiry submission. No authentication.
 * Protections: sliding-window rate limits (per hashed IP + global),
 * honeypot field, submit-speed trap, message heuristics, strict zod validation.
 * Raw visitor IPs are never stored — only a salted-sha256 digest used for abuse tracking.
 */

const SERVICE_VALUES = site.contact.services as unknown as string[]

const enquirySchema = z
  .object({
    name: z.string().trim().min(2, 'Please enter your name').max(120),
    email: z.string().trim().email('Enter a valid email address').max(200).optional(),
    phone: z.string().trim().min(5).max(40).optional(),
    companyName: z.string().trim().max(160).optional(),
    service: z.string().refine(v => SERVICE_VALUES.includes(v), 'Choose a service from the list'),
    message: z.string().trim().min(20, 'Please describe your project (at least 20 characters)').max(4000),
    contactMethod: z.enum(['EMAIL', 'PHONE', 'NO_PREFERENCE']).default('NO_PREFERENCE'),
    consent: z.literal(true, { error: 'We need your consent to store this enquiry' }),
    // Honeypot + timing — see handler
    website: z.string().max(200).optional().default(''),
    formAgeMs: z.number().int().min(0).max(24 * 3600 * 1000).default(0),
  })
  .refine(d => !!d.email || !!d.phone, { error: 'Provide an email address or a phone number', path: ['email'] })
  .refine(d => (d.contactMethod === 'EMAIL' ? !!d.email : true), { error: 'Email required when email is the preferred contact method', path: ['email'] })
  .refine(d => (d.contactMethod === 'PHONE' ? !!d.phone : true), { error: 'Phone required when phone is the preferred contact method', path: ['phone'] })

function clientIpHash(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for') ?? ''
  const ip = fwd.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown'
  return createHash('sha256').update(`enquiry-v1:${ip}`).digest('hex')
}

export async function POST(req: NextRequest) {
  const ipHash = clientIpHash(req)

  // 1) Rate limits — 5/hour and 12/day per hashed IP; 150/day global circuit breaker.
  const rl = rateLimitAll(ipHash, [
    { limit: 5, windowMs: 3600_000 },
    { limit: 12, windowMs: 24 * 3600_000 },
  ])
  const globalRl = rateLimit('enq-global-circuit', 150, 24 * 3600_000)
  if (!rl.ok || !globalRl.ok) {
    const retry = Math.max(rl.retryAfterSec, globalRl.retryAfterSec)
    return jsonError(`Too many enquiries submitted. Please try again later (${Math.ceil(retry / 60)} minutes).`, 429)
  }

  // 2) Validation
  const { data, error: vErr } = await (async () => {
    let raw: unknown
    try {
      raw = await req.json()
    } catch {
      return { data: null, error: 'Invalid request body' as const }
    }
    const parsed = enquirySchema.safeParse(raw)
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      return { data: null, error: `${first?.path?.join('.') ?? 'form'} — ${first?.message ?? 'validation failed'}` as const }
    }
    return { data: parsed.data, error: null }
  })()
  if (vErr) return jsonError(vErr, 400)

  // 3) Spam traps — honeypot filled or submitted inhumanly fast.
  //    Reply with a normal success so bots learn nothing; nothing is stored.
  if (data.website.trim() !== '' || data.formAgeMs < 1500) {
    return json({ ok: true, reference: null })
  }

  // 4) Cheap message heuristic: excessive links are characteristic of spam.
  const linkCount = (data.message.match(/https?:\/\//g) ?? []).length
  if (linkCount > 8) {
    return jsonError('Your message contains too many links. Please summarise and send fewer references.', 400)
  }

  const reference = makeReference('ENQ')
  const enquiry = await db.siteEnquiry.create({
    data: {
      reference,
      name: data.name,
      email: data.email ?? null,
      phone: data.phone ?? null,
      companyName: data.companyName ?? null,
      service: data.service,
      message: data.message,
      contactMethod: data.contactMethod,
      ipHash,
      userAgent: (req.headers.get('user-agent') ?? '').slice(0, 300) || null,
    },
  })

  // Record in audit log (visitor actions are attributed to SYSTEM, never to a staff actor)
  await audit(null, 'PUBLIC_ENQUIRY_RECEIVED', 'SiteEnquiry', enquiry.id, `New website enquiry ${reference} — ${data.service}`)

  // Alert active owners so someone follows up via the existing workflow tools
  const owners = await db.employee.findMany({ where: { role: 'OWNER', isActive: true }, select: { id: true } })
  await Promise.all(
    owners.map(o =>
      notify('EMPLOYEE', o.id, 'ENQUIRY', 'New website enquiry', `${data.name} — ${data.service}`, '/app/enquiries')
    )
  )

  return json({ ok: true, reference }, 201)
}

const STATUSES = ['NEW', 'IN_PROGRESS', 'CONVERTED', 'CLOSED'] as const

/** Staff list of public-site enquiries. Requires enquiries.read (OWNER / CLIENT_MANAGER / SUPPORT_FINANCE). */
export async function GET(req: NextRequest) {
  const { error } = await requireRole(req, ['OWNER', 'CLIENT_MANAGER', 'SUPPORT_FINANCE'])
  if (error) return error

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const { skip, take, page, pageSize } = getPagination(url)

  const where = status && (STATUSES as readonly string[]).includes(status) ? { status } : {}
  const [enquiries, total] = await Promise.all([
    db.siteEnquiry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true, reference: true, name: true, email: true, phone: true, companyName: true,
        service: true, message: true, contactMethod: true, status: true,
        convertedContactId: true, notes: true, createdAt: true,
      },
    }),
    db.siteEnquiry.count({ where }),
  ])

  return json({ enquiries, total, page, pageSize })
}
