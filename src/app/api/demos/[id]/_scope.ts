import { db } from '@/lib/db'
import { ApiError, requireRole, assertOwnershipOrNotFound } from '@/lib/rbac'
import type { AuthUser } from '@/lib/auth'
import { ROLES } from '@/lib/constants'

/**
 * Load a demo with its project and enforce internal demo scoping:
 * FOUNDER/CLIENT_MANAGER see any demo; WEB_DEVELOPER only demos of projects
 * assigned to them; every other combination → 404 (no existence leak).
 */
export async function scopedDemoOr404(user: AuthUser, demoId: string) {
  const demo = await db.demo.findUnique({
    where: { id: demoId },
    include: {
      project: {
        select: { id: true, name: true, clientId: true, assignedToId: true, client: { select: { id: true, name: true } } },
      },
    },
  })
  assertOwnershipOrNotFound(!!demo)
  if (!demo) throw new ApiError(404, 'Not found', 'NOT_FOUND')

  if (user.role === ROLES.WEB_DEVELOPER && demo.project.assignedToId !== user.id) {
    assertOwnershipOrNotFound(false)
  }
  return demo
}

export type ScopedDemo = NonNullable<Awaited<ReturnType<typeof scopedDemoOr404>>>
