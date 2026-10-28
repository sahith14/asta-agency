import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireClientUser, json } from '@/lib/auth'

// GET /api/portal/projects — client's own projects with video progress (scoped by session clientId)
export async function GET(req: NextRequest) {
  const { user, error } = await requireClientUser(req)
  if (error) return error
  const clientId = user.clientId!
  const projects = await db.project.findMany({
    where: { clientId, isArchived: false },
    include: {
      videoProject: { select: { agreedVideoCount: true, packageNameSnapshot: true, clientVisibleNotes: true } },
      deliverables: {
        where: { status: { notIn: ['CANCELLED'] } },
        select: { id: true, title: true, status: true, deadline: true, targetPlatform: true, clientNotes: true },
        orderBy: { createdAt: 'asc' },
      },
      shoots: { where: { status: { in: ['PLANNED', 'SCHEDULED'] } }, select: { id: true, title: true, date: true, startTime: true, address: true }, orderBy: { date: 'asc' } },
      manager: { select: { name: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })
  // Strip internal fields; only client-visible data leaves the API
  return json({
    projects: projects.map(p => ({
      id: p.id, name: p.name, reference: p.reference, serviceType: p.serviceType, status: p.status,
      startDate: p.startDate, targetDate: p.targetDate, manager: p.manager?.name ?? null,
      video: p.videoProject ? { agreedVideoCount: p.videoProject.agreedVideoCount, packageName: p.videoProject.packageNameSnapshot, notes: p.videoProject.clientVisibleNotes } : null,
      deliverables: p.deliverables.map(d => ({ id: d.id, title: d.title, status: d.status, deadline: d.deadline, platform: d.targetPlatform, note: d.clientNotes })),
      upcomingShoots: p.shoots,
    })),
  })
}
