import { db } from '@/lib/db'
import { ApiError, canReadProject, assertOwnershipOrNotFound } from '@/lib/rbac'
import type { AuthUser } from '@/lib/auth'
import { ROLES } from '@/lib/constants'

/**
 * Load a project and enforce internal scoping. WEB_DEVELOPER can only access
 * projects assigned to them; any other disallowed combination becomes a 404
 * (no existence leak). FOUNDER always passes (unrestricted super-user).
 */
export async function scopedProjectOr404(user: AuthUser, projectId: string) {
  const project = await db.project.findUnique({ where: { id: projectId } })
  assertOwnershipOrNotFound(!!project)
  if (!project) throw new ApiError(404, 'Not found', 'NOT_FOUND') // TS narrowing (assert above throws first)

  const allowed = await canReadProject(user, {
    id: project.id,
    clientId: project.clientId,
    assignedToId: project.assignedToId,
  })
  assertOwnershipOrNotFound(allowed)
  if (!allowed) throw new ApiError(404, 'Not found', 'NOT_FOUND') // unreachable
  return project
}

/** FOUNDER/CLIENT_MANAGER — full management rights over delivery records. */
export function isDeliveryManager(user: AuthUser): boolean {
  return user.role === ROLES.FOUNDER || user.role === ROLES.CLIENT_MANAGER
}

/**
 * demoUrl (external hosted preview) is staff-operational data: visible to
 * FOUNDER/CLIENT_MANAGER and to the assigned WEB_DEVELOPER only. urlToken is
 * NEVER returned by internal APIs — it is for portal URLs.
 */
export function maySeeDemoUrl(user: AuthUser, projectAssignedToId: string | null): boolean {
  if (isDeliveryManager(user)) return true
  if (user.role === ROLES.WEB_DEVELOPER) return projectAssignedToId === user.id
  return false
}
