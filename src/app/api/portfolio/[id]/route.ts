import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, audit, json, jsonError } from '@/lib/auth'
import { parseBody } from '@/lib/rbac'
import { portfolioSchema } from '@/lib/portfolio-schema'

const updateSchema = portfolioSchema.partial()

/** Update a portfolio item (publish/feature toggles, edits). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireRole(req, ['OWNER', 'CLIENT_MANAGER', 'CREATIVE_DIRECTOR'])
  if (error) return error
  const { id } = await params

  const item = await db.portfolioItem.findUnique({ where: { id } })
  if (!item) return jsonError('Portfolio item not found', 404)

  const { data, error: vErr } = await parseBody(req, updateSchema)
  if (vErr) return vErr

  const updated = await db.portfolioItem.update({ where: { id }, data })
  await audit(
    { userType: 'EMPLOYEE', userId: user.userId, name: user.name },
    'PORTFOLIO_UPDATED',
    'PortfolioItem',
    id,
    `Updated portfolio item "${updated.title}"`
  )
  return json({ item: updated })
}

/** Delete a portfolio item. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireRole(req, ['OWNER', 'CLIENT_MANAGER', 'CREATIVE_DIRECTOR'])
  if (error) return error
  const { id } = await params

  const item = await db.portfolioItem.findUnique({ where: { id } })
  if (!item) return jsonError('Portfolio item not found', 404)

  await db.portfolioItem.delete({ where: { id } })
  await audit(
    { userType: 'EMPLOYEE', userId: user.userId, name: user.name },
    'PORTFOLIO_DELETED',
    'PortfolioItem',
    id,
    `Deleted portfolio item "${item.title}"`
  )
  return json({ ok: true })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireRole(req, ['OWNER', 'CLIENT_MANAGER', 'CREATIVE_DIRECTOR'])
  if (error) return error
  const { id } = await params
  const item = await db.portfolioItem.findUnique({ where: { id } })
  if (!item) return jsonError('Portfolio item not found', 404)
  return json({ item })
}
