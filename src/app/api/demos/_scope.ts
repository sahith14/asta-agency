import { db } from '@/lib/db'
import { ApiError } from '@/lib/rbac'
import { ROLES } from '@/lib/constants'
import type { AuthUser } from '@/lib/auth'

/**
 * Fetch a demo with role scoping; 404 (never 403) when the caller may not see
 * it. Scoping follows the parent project: founder/manager any, developer only
 * demos of projects assigned to them.
 */
export async function scopedDemoOr404(user: AuthUser, id: string) {
  const demo = await db.demo.findUnique({
    where: { id },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          clientId: true,
          assignedToId: true,
          client: { select: { id: true, name: true } },
        },
      },
    },
  })
  if (!demo) throw new ApiError(404, 'Not found', 'NOT_FOUND')

  const allowed =
    user.role === ROLES.FOUNDER ||
    user.role === ROLES.CLIENT_MANAGER ||
    (user.role === ROLES.WEB_DEVELOPER && demo.project.assignedToId === user.id)
  if (!allowed) throw new ApiError(404, 'Not found', 'NOT_FOUND')
  return demo
}
