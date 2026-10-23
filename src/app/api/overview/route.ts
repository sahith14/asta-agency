import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireStaff, json } from '@/lib/auth'
import { isGlobalReader } from '@/lib/rbac'

// GET /api/overview — staff dashboard aggregation, scoped by role
export async function GET(req: NextRequest) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  const globalReader = isGlobalReader(user.role)

  const projectWhere = {
    isArchived: false,
    status: { in: ['DISCOVERY', 'IN_PROGRESS', 'REVIEW'] as ('DISCOVERY' | 'IN_PROGRESS' | 'REVIEW')[] },
    ...(globalReader ? {} : {
      OR: [
        { managerId: user.userId },
        { deliverables: { some: { OR: [{ editorId: user.userId }, { videographerId: user.userId }] } } },
        { shoots: { some: { assignments: { some: { employeeId: user.userId } } } } },
        { tasks: { some: { assigneeId: user.userId } } },
      ],
    }),
  }

  const now = new Date()

  const [projects, myTasks, upcomingShoots, upcomingMeetings, activeClients, openTasks, outstanding, myTaskCount] = await Promise.all([
    db.project.findMany({
      where: projectWhere,
      include: {
        client: { select: { name: true } },
        _count: { select: { tasks: true, deliverables: true, shoots: true } },
      },
      orderBy: { targetDate: 'asc' },
      take: 8,
    }),
    db.task.findMany({
      where: { assigneeId: user.userId, status: { in: ['TODO', 'IN_PROGRESS', 'BLOCKED'] } },
      include: { project: { select: { name: true } } },
      orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
      take: 8,
    }),
    db.shootSession.findMany({
      where: {
        status: { in: ['PLANNED', 'SCHEDULED'] },
        date: { gte: new Date(now.getTime() - 86400000) },
        ...(globalReader ? {} : { assignments: { some: { employeeId: user.userId } } }),
      },
      include: { project: { select: { name: true } } },
      orderBy: { date: 'asc' },
      take: 5,
    }),
    db.meeting.findMany({
      where: { startAt: { gte: now } },
      include: { client: { select: { name: true } } },
      orderBy: { startAt: 'asc' },
      take: 5,
    }),
    db.client.count({ where: { isActive: true } }),
    ['OWNER', 'CLIENT_MANAGER', 'SUPPORT_FINANCE', 'CREATIVE_DIRECTOR'].includes(user.role)
      ? db.task.count({ where: { status: { in: ['TODO', 'IN_PROGRESS', 'BLOCKED'] } } })
      : db.task.count({ where: { assigneeId: user.userId, status: { in: ['TODO', 'IN_PROGRESS', 'BLOCKED'] } } }),
    ['OWNER', 'SUPPORT_FINANCE'].includes(user.role)
      ? db.invoice.aggregate({ where: { status: { in: ['SENT', 'OVERDUE'] } }, _sum: { amount: true } })
      : Promise.resolve({ _sum: { amount: null as number | null } }),
    db.task.count({ where: { assigneeId: user.userId, status: { in: ['TODO', 'IN_PROGRESS', 'BLOCKED'] } } }),
  ])

  return json({
    projects,
    tasks: myTasks,
    upcomingShoots,
    upcomingMeetings,
    counts: {
      activeProjects: projects.length,
      activeClients: globalReader ? activeClients : projects.length,
      openTasks,
      invoicesOutstanding: outstanding._sum.amount ?? 0,
      myTasks: myTaskCount,
    },
  })
}
