import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireStaff, json } from '@/lib/auth'

// GET /api/reports/overview — combined agency reporting with service filter (real aggregations)
export async function GET(req: NextRequest) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  if (!['OWNER', 'CLIENT_MANAGER', 'SUPPORT_FINANCE', 'CREATIVE_DIRECTOR'].includes(user.role)) {
    return json({ error: 'You do not have permission to view reports' }, 403)
  }
  const serviceType = new URL(req.url).searchParams.get('serviceType')
  const where = {
    isArchived: false,
    ...(serviceType === 'WEBSITE' || serviceType === 'VIDEO_PRODUCTION' ? { serviceType: serviceType as 'WEBSITE' | 'VIDEO_PRODUCTION' } : {}),
  }
  const now = new Date()

  const [clients, projectsByStatus, overdueProjects, videoCounts, invoicedAgg, collectedAgg, websiteCount, videoCount, teamWorkload, upcoming, overdueShoots, overdueDeliverables] = await Promise.all([
    db.client.count({ where: { isActive: true } }),
    db.project.groupBy({ by: ['status'], _count: { _all: true }, where }),
    db.project.count({ where: { ...where, status: { in: ['DISCOVERY', 'IN_PROGRESS', 'REVIEW'] }, targetDate: { lt: now } } }),
    db.videoDeliverable.groupBy({ by: ['status'], _count: { _all: true } }),
    db.invoice.aggregate({ where: { status: { in: ['SENT', 'PAID', 'OVERDUE'] } }, _sum: { amount: true } }),
    db.invoice.aggregate({ where: { status: 'PAID' }, _sum: { amount: true } }),
    db.project.count({ where: { ...where, serviceType: 'WEBSITE' } }),
    db.project.count({ where: { ...where, serviceType: 'VIDEO_PRODUCTION' } }),
    db.employee.groupBy({ by: ['role'], _count: { _all: true }, where: { isActive: true } }),
    db.meeting.findMany({ where: { startAt: { gte: now } }, orderBy: { startAt: 'asc' }, take: 5, include: { client: { select: { name: true } } } }),
    db.shootSession.count({ where: { status: { in: ['PLANNED', 'SCHEDULED'] }, date: { lt: now } } }),
    db.videoDeliverable.count({ where: { status: { notIn: ['DELIVERED', 'CANCELLED'] }, deadline: { lt: now } } }),
  ])

  const stageCounts: Record<string, number> = {}
  for (const g of videoCounts) stageCounts[g.status] = g._count._all
  const contracted = Object.entries(stageCounts).filter(([k]) => k !== 'CANCELLED').reduce((s, [, v]) => s + v, 0)
  const delivered = stageCounts['DELIVERED'] ?? 0

  return json({
    serviceFilter: serviceType ?? 'ALL',
    clients,
    activeProjects: projectsByStatus.filter(s => ['DISCOVERY', 'IN_PROGRESS', 'REVIEW'].includes(s.status)).reduce((s, x) => s + x._count._all, 0),
    projectsByStatus: Object.fromEntries(projectsByStatus.map(s => [s.status, s._count._all])),
    overdueProjects,
    overdueDeliverables,
    overdueShoots,
    websiteProjects: websiteCount,
    videoProjects: videoCount,
    videoDeliverables: { contracted, delivered, stageCounts, completion: contracted > 0 ? Math.round((delivered / contracted) * 100) : null },
    finance: { invoiced: invoicedAgg._sum.amount ?? 0, collected: collectedAgg._sum.amount ?? 0 },
    teamWorkload: Object.fromEntries(teamWorkload.map(t => [t.role, t._count._all])),
    upcoming,
  })
}
