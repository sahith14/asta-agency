import Link from 'next/link'
import { db } from '@/lib/db'
import { requirePageUser } from '../_lib'
import { ROLES } from '@/lib/constants'
import { formatDate } from '@/lib/format'
import { InternalStatusBadge } from '@/components/internal/InternalStatusBadge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NewProjectDialog } from './new-project-dialog'

export default async function ProjectsPage() {
  const user = await requirePageUser()

  const canCreate = user.role === ROLES.FOUNDER || user.role === ROLES.CLIENT_MANAGER
  const isDev = user.role === ROLES.WEB_DEVELOPER

  const [projects, clients, developers] = await Promise.all([
    db.project.findMany({
      where: isDev ? { assignedToId: user.id } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        client: { select: { name: true } },
        assignedTo: { select: { name: true } },
        _count: { select: { tasks: true, demos: true } },
      },
    }),
    canCreate
      ? db.client.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, status: true } })
      : Promise.resolve([]),
    canCreate
      ? db.user.findMany({ where: { role: ROLES.WEB_DEVELOPER, isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, email: true } })
      : Promise.resolve([]),
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">Projects</h1>
          <p className="text-sm text-muted-foreground">
            {isDev ? 'Projects assigned to you.' : 'All client delivery projects.'}
          </p>
        </div>
        {canCreate ? <NewProjectDialog clients={clients} developers={developers} /> : null}
      </div>

      {projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">No projects yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/app/projects/${p.id}`} className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Card className="h-full transition-colors hover:border-primary/40">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold leading-snug">{p.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground">{p.client.name}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <InternalStatusBadge status={p.status} />
                    {p.packageType ? <span className="text-xs text-muted-foreground">{p.packageType}</span> : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {p.assignedTo ? `Dev: ${p.assignedTo.name}` : 'Unassigned'} · target launch {formatDate(p.targetLaunchDate)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p._count.tasks} task{p._count.tasks === 1 ? '' : 's'} · {p._count.demos} demo{p._count.demos === 1 ? '' : 's'}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
