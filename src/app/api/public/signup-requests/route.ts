import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withApi, ok, getIp } from '@/lib/rbac'
import { rateLimit, maybeCleanup } from '@/lib/ratelimit'

/**
 * Public sign-up requests (Stage 2 — founder-mediated provisioning).
 *
 * This does NOT create accounts. It records a request for the Founder's
 * review queue (/app/signup-requests). Keeping provisioning founder-mediated
 * is deliberate: open self-registration would bypass the agency's security
 * model (rotated credentials, mustChangePassword, client isolation).
 *
 * Anti-abuse: fixed-window IP rate limit + honeypot field. The response is
 * uniform whether or not the email already has a pending request (no
 * enumeration).
 */
const schema = z.object({
  name: z.string().trim().min(2, 'Please tell us your name').max(120),
  email: z.string().trim().max(200).email('Please use a valid email address'),
  company: z.string().trim().min(2, 'Please tell us your business name').max(160),
  message: z.string().trim().max(2000).optional().nullable(),
  // Honeypot — humans never fill this; bots do. Any value ⇒ silent no-op.
  website: z.string().max(200).optional(),
})

const UNIFORM = { ok: true, message: 'Thank you — your request has been received. Our team reviews new requests within one business day.' }

export const POST = withApi(async (req: NextRequest) => {
  maybeCleanup()
  const ip = getIp(req)
  const limit = rateLimit(`signup:${ip}`, 5, 10 * 60 * 1000)
  if (!limit.allowed) {
    // Same uniform body — just slower down. No retry leak beyond 429.
    return ok({ ok: true, message: UNIFORM.message }, 202)
  }

  const body = schema.parse(await req.json().catch(() => null))

  if (body.website && body.website.trim() !== '') {
    // Honeypot tripped: pretend success, store nothing.
    return ok(UNIFORM, 202)
  }

  const existingPending = await db.signupRequest.findFirst({
    where: { email: body.email.toLowerCase(), status: 'PENDING' },
    select: { id: true },
  })
  if (!existingPending) {
    await db.signupRequest.create({
      data: {
        name: body.name,
        email: body.email.toLowerCase(),
        company: body.company,
        message: body.message || null,
        ip,
      },
    })
  }

  // Notify the founder (best effort) that a new request awaits review.
  const { notifyUsers } = await import('@/lib/notify')
  const founder = await db.user.findFirst({ where: { role: 'FOUNDER', isActive: true }, select: { id: true } })
  if (founder && !existingPending) {
    await notifyUsers([founder.id], {
      type: 'SIGNUP_REQUEST',
      title: 'New access request',
      body: `${body.name} (${body.company}) requested portal access.`,
      link: '/app/signup-requests',
      dedupeKey: `signup-request:${body.email.toLowerCase()}`,
    })
  }

  return ok(UNIFORM, 202)
})
