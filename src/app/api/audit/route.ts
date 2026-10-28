import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, json } from '@/lib/auth'
import { getPagination } from '@/lib/rbac'

export async function GET(req: NextRequest) {
  const { error } = await requireRole(req, ['OWNER', 'CLIENT_MANAGER'])
  if (error) return error
  const url = new URL(req.url)
  const { skip, take } = getPagination(url)
  const entityType = url.searchParams.get('entityType')
  const where = entityType ? { entityType } : {}
  const [total, logs] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
  ])
  return json({ total, logs })
}
