import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, withApi, ok } from '@/lib/rbac'
import { ROLES } from '@/lib/constants'

/**
 * Finance overview — headline numbers for the /app/finance dashboard.
 * FOUNDER + SUPPORT_FINANCE only (developers/managers get 403).
 */
export const GET = withApi(async (_req: NextRequest) => {
  await requireRole([ROLES.SUPPORT_FINANCE])

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const [outstanding, paidThisMonth, pendingVerifications, activeSubscriptions, openBillingQuestions, recentInvoices] =
    await Promise.all([
      db.invoice.aggregate({
        where: { status: { in: ['ISSUED', 'OVERDUE'] } },
        _count: { _all: true },
        _sum: { amountCents: true },
      }),
      db.payment.aggregate({
        where: { status: 'VERIFIED', verifiedAt: { gte: monthStart } },
        _sum: { amountCents: true },
        _count: { _all: true },
      }),
      db.payment.aggregate({
        where: { status: 'PENDING' },
        _count: { _all: true },
        _sum: { amountCents: true },
      }),
      db.subscription.count({ where: { status: 'ACTIVE' } }),
      db.billingQuestion.count({ where: { status: 'OPEN' } }),
      db.invoice.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { client: { select: { id: true, name: true } } },
      }),
    ])

  return ok({
    outstanding: {
      count: outstanding._count._all,
      amountCents: outstanding._sum.amountCents ?? 0,
    },
    paidThisMonth: {
      count: paidThisMonth._count._all,
      amountCents: paidThisMonth._sum.amountCents ?? 0,
      month: monthStart.toISOString().slice(0, 7),
    },
    pendingVerifications: {
      count: pendingVerifications._count._all,
      amountCents: pendingVerifications._sum.amountCents ?? 0,
    },
    subscriptionsActive: activeSubscriptions,
    openBillingQuestions,
    recentInvoices,
  })
})
