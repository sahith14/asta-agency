import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, destroySession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (token) await destroySession(token)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 })
  return res
}
