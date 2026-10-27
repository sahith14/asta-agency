import { db } from '@/lib/db'
import { ApiError } from '@/lib/rbac'
import { ROLES } from '@/lib/constants'
import type { AuthUser } from '@/lib/auth'

/**
 * Fetch a project with role scoping; 404 (never 403) when the caller may not
 * see it — avoids existence leaks.
 * - FOUNDER: unrestricted (super-user).
 * - CLIENT_MANAGER / SUPPORT_FINANCE: all projects.
 * - WEB_DEVELOPER: only projects assigned to them.
 * - CLIENT: only their own business's projects (defense in depth; internal
 *   routes normally reject CLIENT earlier).
 */
export async function scopedProjectOr404(user: AuthUser, id: string) {
  const project = await db.project.findUnique({
    where: { id },
    include: { client: { select: { id: true, name: true } } },
  })
  if (!project) throw new ApiError(404, 'Not found', 'NOT_FOUND')

  const allowed =
    user.role === ROLES.FOUNDER ||
    user.role === ROLES.CLIENT_MANAGER ||
    user.role === ROLES.SUPPORT_FINANCE ||
    (user.role === ROLES.WEB_DEVELOPER && project.assignedToId === user.id) ||
    (user.role === ROLES.CLIENT && !!user.clientId && project.clientId === user.clientId)
  if (!allowed) throw new ApiError(404, 'Not found', 'NOT_FOUND')
  return project
}

/** Roles allowed to manage milestones/deliverables (delivery planning). */
export function isDeliveryManager(user: AuthUser): boolean {
  return user.role === ROLES.FOUNDER || user.role === ROLES.CLIENT_MANAGER
}

/** demoUrl is exposed to founder/manager/finance and the assigned developer only. */
export function maySeeDemoUrl(user: AuthUser, projectAssignedToId: string | null): boolean {
  if (user.role === ROLES.FOUNDER || user.role === ROLES.CLIENT_MANAGER || user.role === ROLES.SUPPORT_FINANCE) return true
  if (user.role === ROLES.WEB_DEVELOPER) return projectAssignedToId === user.id
  return false
}
