import { NextRequest } from 'next/server'
import { ROLES } from '@/lib/constants'
import { ApiError, getIp, isFounder, requireClientScope, requireUser } from '@/lib/rbac'

// Re-exports so route files can import their whole toolkit from this module.
export { withApi, ok } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import type { AuthUser } from '@/lib/auth'

/**
 * Client-portal API helpers — this module IS the data-isolation boundary.
 * Only CLIENT users and the FOUNDER (unrestricted super-user, audited) may
 * call portal APIs. Every other employee role is rejected here (the portal
 * layout additionally redirects them from /portal pages).
 */
export async function portalUser(): Promise<AuthUser> {
  const user = await requireUser()
  if (user.role !== ROLES.CLIENT && !isFounder(user)) {
    throw new ApiError(403, 'Client portal access only', 'FORBIDDEN')
  }
  return user
}

/** Demo statuses a client may ever see (never PREPARING / READY_FOR_FOUNDER). */
export const DEMO_CLIENT_VISIBLE_STATUSES = [
  'AUTHORIZED_FOR_PREVIEW',
  'SENT_TO_CLIENT',
  'CHANGES_REQUESTED',
  'APPROVED',
] as const

/** Demo statuses in which the client may approve / request changes. */
export const DEMO_ACTIONABLE_STATUSES = ['SENT_TO_CLIENT', 'AUTHORIZED_FOR_PREVIEW', 'CHANGES_REQUESTED'] as const

/**
 * Resolve the clientId a portal LIST/GET request may operate on.
 * - CLIENT: always their own scope; explicitly rejects ?clientId= (403) so a
 *   client can never even imply access to another business.
 * - FOUNDER: must pass ?clientId= (audited as PORTAL_VIEW_AS_FOUNDER); else 400.
 */
export async function scopedClientId(req: NextRequest, user: AuthUser): Promise<string> {
  const url = new URL(req.url)
  const param = url.searchParams.get('clientId')
  if (isFounder(user)) {
    if (!param) throw new ApiError(400, 'clientId required', 'CLIENT_ID_REQUIRED')
    await logAudit({
      actorId: user.id,
      actorRole: user.role,
      action: 'PORTAL_VIEW_AS_FOUNDER',
      entityType: 'Client',
      entityId: param,
      result: 'ALLOWED',
      detail: JSON.stringify({ path: url.pathname }),
      ip: getIp(req),
    })
    return param
  }
  if (param) throw new ApiError(403, 'Clients cannot specify clientId', 'FORBIDDEN')
  return requireClientScope(user)
}

/** Standard "fetch scoped or 404" ending — never 403, avoids existence leaks. */
export function notFound(): never {
  throw new ApiError(404, 'Not found', 'NOT_FOUND')
}

/** Parse a JSON-string column into an array (SQLite has no scalar lists). */
export function parseJsonArray(raw: string | null | undefined): unknown[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
