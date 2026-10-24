import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'crypto'

export const SESSION_COOKIE = 'agencyos_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7 // 7 days

export type UserType = 'EMPLOYEE' | 'CLIENT_USER'

export interface AuthUser {
  userType: UserType
  userId: string
  email: string
  name: string
  role: string
  clientId: string | null // only for CLIENT_USER
  mustChangePassword: boolean
  isActive: boolean
}

// ── Password hashing (scrypt) ────────────────────────────────

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const candidate = scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  if (candidate.length !== expected.length) return false
  return timingSafeEqual(candidate, expected)
}

export function generateToken(): string {
  return randomBytes(32).toString('hex')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// ── Sessions ─────────────────────────────────────────────────

export async function createSession(userType: UserType, userId: string): Promise<string> {
  const token = generateToken()
  await db.session.create({
    data: { token: hashToken(token), userType, userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  })
  return token
}

export async function destroySession(token: string): Promise<void> {
  await db.session.deleteMany({ where: { token: hashToken(token) } })
}

/**
 * Resolve the session token from a request.
 * Primary: HttpOnly cookie (SameSite=Lax — works for top-level browsing).
 * Fallback: `Authorization: Bearer <token>` header — needed in embedded contexts
 * (e.g. preview-panel iframes) where browsers withhold SameSite=Lax cookies or
 * block third-party cookies entirely. The token is delivered to the client in the
 * login response body over the same origin, so this stays within the session model.
 */
export function getSessionToken(req: NextRequest): string | null {
  const header = req.headers.get('authorization')
  if (header?.startsWith('Bearer ')) {
    const bearer = header.slice(7).trim()
    if (bearer) return bearer
  }
  return req.cookies.get(SESSION_COOKIE)?.value ?? null
}

export async function getAuthUser(req: NextRequest): Promise<AuthUser | null> {
  const token = getSessionToken(req)
  if (!token) return null
  const session = await db.session.findUnique({ where: { token: hashToken(token) } })
  if (!session || session.expiresAt < new Date()) return null

  if (session.userType === 'EMPLOYEE') {
    const emp = await db.employee.findUnique({ where: { id: session.userId } })
    if (!emp || !emp.isActive) return null
    return {
      userType: 'EMPLOYEE', userId: emp.id, email: emp.email, name: emp.name,
      role: emp.role, clientId: null, mustChangePassword: emp.mustChangePassword, isActive: emp.isActive,
    }
  }
  if (session.userType === 'CLIENT_USER') {
    const cu = await db.clientUser.findUnique({ where: { id: session.userId } })
    if (!cu || !cu.isActive) return null
    return {
      userType: 'CLIENT_USER', userId: cu.id, email: cu.email, name: cu.name,
      role: 'CLIENT', clientId: cu.clientId, mustChangePassword: cu.mustChangePassword, isActive: cu.isActive,
    }
  }
  return null
}

// ── API auth guards (server-side enforcement) ────────────────

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export const STAFF_ROLES = ['OWNER', 'CLIENT_MANAGER', 'WEB_DEVELOPER', 'SUPPORT_FINANCE', 'VIDEOGRAPHER', 'VIDEO_EDITOR', 'CREATIVE_DIRECTOR'] as const

/**
 * Accounts provisioned with a one-time temporary password must change it before
 * the API will serve anything beyond the essentials. This is enforced server-side
 * (never UI-only) while the shells route the user to the change-password page.
 */
const PASSWORD_CHANGE_ALLOWLIST: Array<{ method: string; path: RegExp }> = [
  { method: 'GET', path: /^\/api\/auth\/me$/ },
  { method: 'POST', path: /^\/api\/auth\/password$/ },
  { method: 'POST', path: /^\/api\/auth\/logout$/ },
  { method: 'GET', path: /^\/api\/notifications$/ },
]

function passwordChangeBlocked(req: NextRequest, user: AuthUser): NextResponse | null {
  if (!user.mustChangePassword) return null
  const path = req.nextUrl.pathname
  const method = req.method.toUpperCase()
  if (PASSWORD_CHANGE_ALLOWLIST.some(a => a.method === method && a.path.test(path))) return null
  return jsonError('Password change required before using the application', 403)
}

/** Requires an authenticated employee (any active staff role). Returns the user or a 401/403 response. */
export async function requireStaff(req: NextRequest): Promise<{ user: AuthUser; error: null } | { user: null; error: NextResponse }> {
  const user = await getAuthUser(req)
  if (!user) return { user: null, error: jsonError('Authentication required', 401) }
  if (user.userType !== 'EMPLOYEE') return { user: null, error: jsonError('Staff access required', 403) }
  const blocked = passwordChangeBlocked(req, user)
  if (blocked) return { user: null, error: blocked }
  return { user, error: null }
}

/** Requires the employee to hold one of the given roles. */
export async function requireRole(req: NextRequest, roles: readonly string[]): Promise<{ user: AuthUser; error: null } | { user: null; error: NextResponse }> {
  const res = await requireStaff(req)
  if (res.error) return res
  if (!roles.includes(res.user.role)) return { user: null, error: jsonError('You do not have permission to perform this action', 403) }
  return res
}

/** Requires an authenticated client portal user. */
export async function requireClientUser(req: NextRequest): Promise<{ user: AuthUser; error: null } | { user: null; error: NextResponse }> {
  const user = await getAuthUser(req)
  if (!user) return { user: null, error: jsonError('Authentication required', 401) }
  if (user.userType !== 'CLIENT_USER' || !user.clientId) return { user: null, error: jsonError('Client portal access required', 403) }
  const blocked = passwordChangeBlocked(req, user)
  if (blocked) return { user: null, error: blocked }
  return { user, error: null }
}

// ── Audit logging ────────────────────────────────────────────

export async function audit(
  actor: { userType: string; userId?: string; name: string } | null,
  action: string,
  entityType: string,
  entityId: string | null,
  summary: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await db.auditLog.create({
    data: {
      actorType: actor?.userType ?? 'SYSTEM',
      actorId: actor?.userId ?? null,
      actorName: actor?.name ?? 'System',
      action, entityType, entityId, summary,
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
  })
}

// ── Notifications (with 5-minute identical-event dedup) ──────

export async function notify(
  userType: UserType,
  userId: string,
  type: string,
  title: string,
  body?: string,
  link?: string,
): Promise<void> {
  const dedupWindow = new Date(Date.now() - 5 * 60 * 1000)
  const dup = await db.notification.findFirst({
    where: { userType, userId, type, title, link: link ?? null, createdAt: { gte: dedupWindow } },
  })
  if (dup) return
  await db.notification.create({ data: { userType, userId, type, title, body, link } })
}

// ── Reference generators ─────────────────────────────────────

export function makeReference(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}${randomBytes(2).toString('hex').toUpperCase()}`
}
