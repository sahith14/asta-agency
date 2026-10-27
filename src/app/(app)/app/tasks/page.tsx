import { db } from '@/lib/db'
import { requirePageUser } from '../_lib'
import { ROLES, TASK_STATUSES } from '@/lib/constants'
import { TasksView } from './tasks-view'

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ status?: string; project?: string }> }) {
  const user = await requirePageUser()
  const { status, project } = await searchParams

  const isDev = user.role === ROLES.WEB_DEVELOPER
  const canCreate = user.role === ROLES.FOUNDER || user.role === ROLES.CLIENT_MANAGER

  const scopeWhere = isDev ? { OR: [{ assignedToId: user.id }, { project: { assignedToId: user.id } }] } : undefined

  const [tasks, projects, developers] = await Promise.all([
    db.task.findMany({
      where: scopeWhere,
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        dueDate: true,
        isMaintenance: true,
        changeRequestId: true,
        assignedToId: true,
        _count: { select: { comments: true } },
        project: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
        createdBy: { select: { name: true } },
      },
    }),
    db.project.findMany({
      where: isDev ? { assignedToId: user.id } : undefined,
      orderBy: { name: 'asc' },
      select: { id: true, name: true, client: { select: { name: true } } },
    }),
    canCreate
      ? db.user.findMany({ where: { role: ROLES.WEB_DEVELOPER, isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, email: true } })
      : Promise.resolve([]),
  ])

  const validStatus = status && TASK_STATUSES.includes(status as (typeof TASK_STATUSES)[number]) ? status : 'ALL'

  return (
    <TasksView
      role={user.role}
      userId={user.id}
      initialStatus={validStatus}
      initialProjectId={project ?? 'ALL'}
      tasks={tasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate?.toISOString() ?? null,
        isMaintenance: t.isMaintenance,
        changeRequestId: t.changeRequestId,
        assignedToId: t.assignedToId,
        assignedToName: t.assignedTo?.name ?? null,
        createdByName: t.createdBy.name,
        projectId: t.project.id,
        projectName: t.project.name,
        commentsCount: t._count.comments,
      }))}
      projects={projects.map((p) => ({ id: p.id, name: p.name, clientName: p.client.name }))}
      developers={developers}
    />
  )
}
