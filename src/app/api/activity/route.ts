import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireEmployee, withApi, ok } from '@/lib/rbac'

const PAGE_SIZE = 30

/**
 * Sanitized team activity feed — employees only (Stage 2).
 *
 * Reads the SAME single AuditLog stream (no second audit system), but strips
 * security-sensitive material that only the Founder's audit view may show:
 *  - only entries with result ALLOWED | SUCCESS (no DENIED/FAILURE rows)
 *  - never exposes `ip` or `detail` payloads
 * Cross-check: /api/audit (FOUNDER) keeps the full forensic trail.
 */
export const GET = withApi(async (req: NextRequest) => {
  await requireEmployee()
  const url = new URL(req.url)
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1)
  const action = url.searchParams.get('action')?.slice(0, 64)

  const where: Record<string, unknown> = { result: { in: ['ALLOWED', 'SUCCESS'] } }
  if (action) where.action = { contains: action }

  const [total, entries] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        result: true,
        createdAt: true,
        actor: { select: { id: true, name: true, role: true } },
      },
    }),
  ])

  return ok({ entries, total, page, pageSize: PAGE_SIZE, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) })
})
