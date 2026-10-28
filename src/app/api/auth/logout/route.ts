import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, destroySession, getSessionToken } from '@/lib/auth'

export async function POST(req: NextRequest) {
  // Accept session token from cookie OR Authorization: Bearer (embedded preview contexts)
  const token = getSessionToken(req)
  if (token) await destroySession(token)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 })
  return res
}
