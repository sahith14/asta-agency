import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok } from '@/lib/rbac'
import { withApi, notFound, parseJsonArray, portalUser, scopedClientId } from '../_portal'

/**
 * GET /api/portal/billing — READ-ONLY billing truth for the scoped client.
 * No card data exists anywhere in the system. No endpoint in this module can
 * create or change invoices, payments or subscriptions.
 */
export const GET = withApi(async (req: NextRequest) => {
  const user = await portalUser()
  const clientId = await scopedClientId(req, user)

  const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } })
  if (!client) notFound()

  const [invoices, subscriptions, questions] = await Promise.all([
    db.invoice.findMany({
      where: { clientId, status: { notIn: ['DRAFT'] } },
      orderBy: [{ issuedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        number: true,
        description: true,
        amountCents: true,
        currency: true,
        status: true,
        issuedAt: true,
        dueDate: true,
        paidAt: true,
        payments: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            method: true,
            reference: true,
            status: true,
            amountCents: true,
            createdAt: true,
            verifiedAt: true,
          },
        },
      },
    }),
    db.subscription.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        planName: true,
        scopeJson: true,
        monthlyPriceCents: true,
        currency: true,
        status: true,
        renewalDate: true,
        currentPeriodEnd: true,
      },
    }),
    db.billingQuestion.findMany({
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
    }),
  ])

  const gatewayUrl = process.env.PAYMENT_GATEWAY_URL

  return ok({
    client: { id: client.id, name: client.name },
    invoices,
    subscriptions: subscriptions.map((s) => ({
      id: s.id,
      planName: s.planName,
      scope: parseJsonArray(s.scopeJson).filter((x): x is string => typeof x === 'string'),
      monthlyPriceCents: s.monthlyPriceCents,
      currency: s.currency,
      status: s.status,
      renewalDate: s.renewalDate,
      currentPeriodEnd: s.currentPeriodEnd,
    })),
    paymentGateway: gatewayUrl
      ? { connected: true, url: gatewayUrl }
      : {
          connected: false,
          message:
            'Online payments are not connected yet. Please pay by bank transfer — our team will verify and mark your invoice paid, or contact us for bank details.',
        },
    questions: questions.map((q) => ({ ...q, invoiceNumber: q.invoice?.number ?? null })),
  })
})
