import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser, json, jsonError } from '@/lib/auth'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user) return jsonError('Authentication required', 401)
  const { id } = await ctx.params
  const notification = await db.notification.findUnique({ where: { id } })
  if (!notification || notification.userType !== user.userType || notification.userId !== user.userId) {
    return jsonError('Notification not found', 404)
  }
  await db.notification.update({ where: { id }, data: { readAt: new Date() } })
  return json({ ok: true })
}
