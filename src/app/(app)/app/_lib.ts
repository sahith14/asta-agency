import { redirect } from 'next/navigation'
import { getSessionUser, type AuthUser } from '@/lib/auth'
import { ROLES, type Role } from '@/lib/constants'

/**
 * Page-level auth guard for /app/** server components (defense in depth on
 * top of the (app) layout): redirects unauthenticated users to /login and
 * CLIENT accounts to /portal — clients never reach the internal dashboard.
 */
export async function requirePageUser(): Promise<AuthUser> {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  if (user.role === ROLES.CLIENT) redirect('/portal')
  return user
}

/** Redirect helper for pages a role must not see (e.g. developer → /app/clients). */
export async function requirePageRole(roles: Role[]): Promise<AuthUser> {
  const user = await requirePageUser()
  if (user.role !== ROLES.FOUNDER && !roles.includes(user.role)) redirect('/app')
  return user
}

export function canManageClients(user: AuthUser): boolean {
  return user.role === ROLES.FOUNDER || user.role === ROLES.CLIENT_MANAGER
}

export function isDeveloper(user: AuthUser): boolean {
  return user.role === ROLES.WEB_DEVELOPER
}
