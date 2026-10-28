import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser, json, jsonError } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return jsonError('Authentication required', 401)
  const url = new URL(req.url)
  const unreadOnly = url.searchParams.get('unread') === 'true'
  const notifications = await db.notification.findMany({
    where: { userType: user.userType, userId: user.userId, ...(unreadOnly ? { readAt: null } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  const unreadCount = await db.notification.count({ where: { userType: user.userType, userId: user.userId, readAt: null } })
  return json({ notifications, unreadCount })
}
