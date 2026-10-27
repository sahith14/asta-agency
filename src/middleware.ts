import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/lib/constants'

/**
 * Cheap edge gate: /app/** and /portal/** require a session cookie to exist.
 * Real authorization is re-verified server-side in layouts and every API route
 * (defense in depth — this middleware never grants access by itself).
 */
export function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  const { pathname } = req.nextUrl

  if (!token) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('from', pathname)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/app/:path*', '/portal/:path*'],
}
