import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, audit, json, jsonError } from '@/lib/auth'
import { parseBody } from '@/lib/rbac'
import { portfolioSchema } from '@/lib/portfolio-schema'

/** Portfolio content management — staff only (portfolio.manage capability). */

/** Staff list — includes unpublished items. */
export async function GET(req: NextRequest) {
  const { error } = await requireRole(req, ['OWNER', 'CLIENT_MANAGER', 'CREATIVE_DIRECTOR'])
  if (error) return error
  const items = await db.portfolioItem.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  })
  return json({ items })
}

/** Create a portfolio item. */
export async function POST(req: NextRequest) {
  const { user, error } = await requireRole(req, ['OWNER', 'CLIENT_MANAGER', 'CREATIVE_DIRECTOR'])
  if (error) return error
  const { data, error: vErr } = await parseBody(req, portfolioSchema)
  if (vErr) return vErr

  const item = await db.portfolioItem.create({ data: { ...data, createdById: user.userId } })
  await audit(
    { userType: 'EMPLOYEE', userId: user.userId, name: user.name },
    'PORTFOLIO_CREATED',
    'PortfolioItem',
    item.id,
    `Created portfolio item "${item.title}" (${data.published ? 'published' : 'draft'})`
  )
  return json({ item }, 201)
}

export async function PUT() {
  return jsonError('Method not allowed — use /api/portfolio/[id]', 405)
}
