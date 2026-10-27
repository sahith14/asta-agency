import { db } from '@/lib/db'
import { requirePageUser } from '../_lib'
import { ROLES } from '@/lib/constants'
import { DemosView } from './demos-view'

export default async function DemosPage() {
  const user = await requirePageUser()

  const isDev = user.role === ROLES.WEB_DEVELOPER
  const canSeeDemos = user.role === ROLES.FOUNDER || user.role === ROLES.CLIENT_MANAGER || isDev

  const [demos, projects] = await Promise.all([
    db.demo.findMany({
      where: isDev ? { project: { assignedToId: user.id } } : undefined,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        demoUrl: true,
        status: true,
        authorizedAt: true,
        clientApprovedAt: true,
        createdAt: true,
        project: { select: { id: true, name: true, client: { select: { name: true } } } },
      },
    }),
    canSeeDemos
      ? db.project.findMany({
          where: isDev ? { assignedToId: user.id } : undefined,
          orderBy: { name: 'asc' },
          select: { id: true, name: true, client: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ])

  return (
    <DemosView
      role={user.role}
      demos={demos.map((d) => ({
        id: d.id,
        title: d.title,
        demoUrl: d.demoUrl,
        status: d.status,
        authorizedAt: d.authorizedAt?.toISOString() ?? null,
        clientApprovedAt: d.clientApprovedAt?.toISOString() ?? null,
        createdAt: d.createdAt.toISOString(),
        projectId: d.project.id,
        projectName: d.project.name,
        clientName: d.project.client.name,
      }))}
      projects={projects.map((p) => ({ id: p.id, name: p.name, clientName: p.client.name }))}
    />
  )
}
