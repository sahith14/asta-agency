import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireStaff, json } from '@/lib/auth'
import { isGlobalReader } from '@/lib/rbac'

// GET /api/video/dashboard — real counts calculated from deliverable records
export async function GET(req: NextRequest) {
  const { user, error } = await requireStaff(req)
  if (error) return error

  // Assigned-only scope mirrors project list
  let projectIdFilter: { in: string[] } | undefined = undefined
  if (!isGlobalReader(user.role)) {
    const projects = await db.project.findMany({
      where: {
        serviceType: 'VIDEO_PRODUCTION',
        OR: [
          { managerId: user.userId },
          { deliverables: { some: { OR: [{ editorId: user.userId }, { videographerId: user.userId }] } } },
          { shoots: { some: { assignments: { some: { employeeId: user.userId } } } } },
          { tasks: { some: { assigneeId: user.userId } } },
        ],
      },
      select: { id: true },
    })
    projectIdFilter = { in: projects.map(p => p.id) }
  }

  const where = { ...(projectIdFilter ? { projectId: projectIdFilter } : {}) }
  const now = new Date()

  const [statusGroups, contracted, overdue, upcomingShoots, activeProjects, awaitingInternal, awaitingClient, recentDeliverables] = await Promise.all([
    db.videoDeliverable.groupBy({ by: ['status'], _count: { _all: true }, where }),
    db.videoDeliverable.count({ where: { ...where, status: { not: 'CANCELLED' } } }),
    db.videoDeliverable.count({ where: { ...where, status: { notIn: ['DELIVERED', 'CANCELLED'] }, deadline: { lt: now } } }),
    db.shootSession.findMany({
      where: { status: { in: ['PLANNED', 'SCHEDULED'] }, date: { gte: new Date(now.getTime() - 86400000) }, ...(projectIdFilter ? { projectId: projectIdFilter } : {}) },
      include: { project: { select: { id: true, name: true, reference: true } } },
      orderBy: { date: 'asc' },
      take: 6,
    }),
    db.project.count({ where: { serviceType: 'VIDEO_PRODUCTION', status: { in: ['DISCOVERY', 'IN_PROGRESS', 'REVIEW'] }, ...(projectIdFilter ? { id: projectIdFilter } : {}) } }),
    db.videoDeliverable.count({ where: { ...where, status: 'INTERNAL_REVIEW' } }),
    db.videoDeliverable.count({ where: { ...where, status: 'CLIENT_REVIEW' } }),
    db.videoDeliverable.findMany({
      where: { ...where, status: { not: 'CANCELLED' } },
      include: { project: { select: { name: true, reference: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 8,
    }),
  ])

  const stageCounts: Record<string, number> = {}
  for (const g of statusGroups) stageCounts[g.status] = g._count._all

  const delivered = stageCounts['DELIVERED'] ?? 0
  const cancelled = stageCounts['CANCELLED'] ?? 0
  const completion = contracted > 0 ? Math.round((delivered / contracted) * 100) : null

  return json({
    totals: {
      contracted,
      delivered,
      cancelled,
      remaining: Math.max(0, contracted - delivered),
      overdue,
      completion, // null => meaningful zero state
      activeProjects,
      awaitingInternalReview: awaitingInternal,
      awaitingClientReview: awaitingClient,
    },
    stageCounts,
    upcomingShoots,
    recentDeliverables,
  })
}
