import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, withApi, ok } from '@/lib/rbac'
import { ROLES, BILLING_QUESTION_STATUSES } from '@/lib/constants'

/**
 * Client-raised billing questions (includes CANCELLATION_REQUEST type, flagged
 * for attention). FOUNDER + SUPPORT_FINANCE only.
 */
export const GET = withApi(async (req: NextRequest) => {
  await requireRole([ROLES.SUPPORT_FINANCE])
  const url = new URL(req.url)
  const status = url.searchParams.get('status')

  const where: Record<string, unknown> = {}
  if (status && BILLING_QUESTION_STATUSES.includes(status as (typeof BILLING_QUESTION_STATUSES)[number])) {
    where.status = status
  }

  const questions = await db.billingQuestion.findMany({
    where,
    include: {
      client: { select: { id: true, name: true } },
      invoice: { select: { id: true, number: true } },
      raisedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return ok({ questions })
})
