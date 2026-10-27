import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, assertOwnershipOrNotFound, getIp, isFounder, ok, requireClientScope } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { notifyUsers, roleUserIds } from '@/lib/notify'
import { ROLES } from '@/lib/constants'
import { withApi, notFound, portalUser, scopedClientId } from '../../_portal'

const questionSchema = z.object({
  type: z.enum(['QUESTION', 'CANCELLATION_REQUEST']).default('QUESTION'),
  subject: z.string().trim().min(3, 'Please add a short subject').max(150),
  message: z.string().trim().min(5, 'Please describe your question').max(4000),
  invoiceId: z.string().min(1).optional().nullable(),
  // FOUNDER only — CLIENT scope is always derived from the session.
  clientId: z.string().min(1).optional(),
})

/** GET — the caller's submitted billing questions (statuses included). */
export const GET = withApi(async (req: NextRequest) => {
  const user = await portalUser()
  const clientId = await scopedClientId(req, user)

  const questions = await db.billingQuestion.findMany({
    where: { clientId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      type: true,
      subject: true,
      message: true,
      status: true,
      response: true,
      createdAt: true,
      resolvedAt: true,
      invoice: { select: { number: true } },
    },
  })
  return ok({ questions: questions.map((q) => ({ ...q, invoiceNumber: q.invoice?.number ?? null })) })
})

/**
 * POST /api/portal/billing/questions — raise a billing question or a
 * cancellation request. This never changes billing records; it only notifies
 * finance. Audited (BILLING_QUESTION_SUBMITTED).
 */
export const POST = withApi(async (req: NextRequest) => {
  const user = await portalUser()
  const body = questionSchema.parse(await req.json().catch(() => ({})))

  let clientId: string
  if (user.role === ROLES.CLIENT) {
    clientId = await requireClientScope(user)
  } else if (isFounder(user)) {
    if (!body.clientId) throw new ApiError(400, 'clientId required', 'CLIENT_ID_REQUIRED')
    clientId = body.clientId
  } else {
    notFound()
  }

  if (body.invoiceId) {
    const invoice = await db.invoice.findFirst({ where: { id: body.invoiceId, clientId }, select: { id: true } })
    assertOwnershipOrNotFound(Boolean(invoice))
    if (!invoice) notFound() // unreachable
  }

  const question = await db.billingQuestion.create({
    data: {
      clientId,
      invoiceId: body.invoiceId ?? null,
      raisedById: user.id,
      type: body.type,
      subject: body.subject,
      message: body.message,
      status: 'OPEN',
    },
  })

  await logAudit({
    actorId: user.id,
    actorRole: user.role,
    action: 'BILLING_QUESTION_SUBMITTED',
    entityType: 'BillingQuestion',
    entityId: question.id,
    result: 'SUCCESS',
    detail: JSON.stringify({ type: body.type, subject: body.subject, invoiceId: body.invoiceId ?? null }),
    ip: getIp(req),
  })

  await notifyUsers(await roleUserIds([ROLES.SUPPORT_FINANCE, ROLES.FOUNDER]), {
    type: body.type === 'CANCELLATION_REQUEST' ? 'BILLING_CANCELLATION_REQUEST' : 'BILLING_QUESTION',
    title: body.type === 'CANCELLATION_REQUEST' ? 'Client requested cancellation' : 'Client billing question',
    body: body.subject,
    link: '/app/finance',
    dedupeKey: `billing-q:${question.id}`,
  })

  return ok({ question: { id: question.id, status: question.status } }, 201)
})
