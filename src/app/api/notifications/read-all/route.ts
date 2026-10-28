import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser, json, jsonError } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return jsonError('Authentication required', 401)
  const result = await db.notification.updateMany({
    where: { userType: user.userType, userId: user.userId, readAt: null },
    data: { readAt: new Date() },
  })
  return json({ ok: true, marked: result.count })
}
