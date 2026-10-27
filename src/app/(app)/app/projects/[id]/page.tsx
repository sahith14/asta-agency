import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requirePageUser } from '../../_lib'
import { ROLES } from '@/lib/constants'
import { ProjectDetail } from './project-detail'

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser()
  const { id } = await params

  const project = await db.project.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
      milestones: { orderBy: { sortOrder: 'asc' } },
      deliverables: { orderBy: { createdAt: 'asc' }, include: { milestone: { select: { id: true, title: true } } } },
      tasks: { orderBy: { createdAt: 'desc' }, include: { assignedTo: { select: { id: true, name: true } } } },
      demos: { orderBy: { createdAt: 'desc' } },
      assets: { orderBy: { createdAt: 'desc' }, include: { uploadedBy: { select: { id: true, name: true } } } },
      changeRequests: { orderBy: { createdAt: 'desc' }, include: { raisedBy: { select: { id: true, name: true } } } },
      maintenanceReports: { orderBy: { createdAt: 'desc' } },
    },
  })
  if (!project) notFound()

  // WEB_DEVELOPER can only open projects assigned to them (404, no leak).
  if (user.role === ROLES.WEB_DEVELOPER && project.assignedToId !== user.id) notFound()

  const canManage = user.role === ROLES.FOUNDER || user.role === ROLES.CLIENT_MANAGER
  const isAssignedDev = user.role === ROLES.WEB_DEVELOPER && project.assignedToId === user.id
  const showDemoUrl = canManage || isAssignedDev

  const developers = canManage
    ? await db.user.findMany({ where: { role: ROLES.WEB_DEVELOPER, isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, email: true } })
    : []

  return (
    <div className="space-y-6">
      <div>
        <Link href="/app/projects" className="text-sm text-muted-foreground hover:underline">
          ← Projects
        </Link>
      </div>
      <ProjectDetail
        user={{ id: user.id, role: user.role }}
        canManage={canManage}
        isAssignedDev={isAssignedDev}
        developers={developers}
        project={{
          id: project.id,
          name: project.name,
          description: project.description,
          packageType: project.packageType,
          status: project.status,
          client: project.client,
          assignedToId: project.assignedToId,
          assignedToName: project.assignedTo?.name ?? null,
          startDate: project.startDate?.toISOString() ?? null,
          targetLaunchDate: project.targetLaunchDate?.toISOString() ?? null,
          deployRequestedAt: project.deployRequestedAt?.toISOString() ?? null,
          deployApprovedAt: project.deployApprovedAt?.toISOString() ?? null,
          createdAt: project.createdAt.toISOString(),
        }}
        milestones={project.milestones.map((m) => ({
          id: m.id,
          title: m.title,
          description: m.description,
          status: m.status,
          sortOrder: m.sortOrder,
          dueDate: m.dueDate?.toISOString() ?? null,
          completedAt: m.completedAt?.toISOString() ?? null,
          clientVisible: m.clientVisible,
        }))}
        deliverables={project.deliverables.map((d) => ({
          id: d.id,
          title: d.title,
          notes: d.notes,
          status: d.status,
          clientVisible: d.clientVisible,
          milestoneId: d.milestoneId,
          milestoneTitle: d.milestone?.title ?? null,
        }))}
        tasks={project.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate?.toISOString() ?? null,
          isMaintenance: t.isMaintenance,
          assignedToId: t.assignedToId,
          assignedToName: t.assignedTo?.name ?? null,
        }))}
        demos={project.demos.map((d) => ({
          id: d.id,
          title: d.title,
          demoUrl: showDemoUrl ? d.demoUrl : null,
          status: d.status,
          authorizedAt: d.authorizedAt?.toISOString() ?? null,
          clientApprovedAt: d.clientApprovedAt?.toISOString() ?? null,
          createdAt: d.createdAt.toISOString(),
        }))}
        assets={project.assets.map((a) => ({
          id: a.id,
          originalName: a.originalName,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          visibility: a.visibility,
          createdAt: a.createdAt.toISOString(),
          uploadedByName: a.uploadedBy?.name ?? '—',
        }))}
        changeRequests={project.changeRequests.map((cr) => ({
          id: cr.id,
          title: cr.title,
          status: cr.status,
          scopeImpact: cr.scopeImpact,
          createdAt: cr.createdAt.toISOString(),
          raisedByName: cr.raisedBy?.name ?? '—',
        }))}
        maintenanceReports={project.maintenanceReports.map((r) => ({
          id: r.id,
          periodLabel: r.periodLabel,
          status: r.status,
          summary: r.summary,
          visibleToClient: r.visibleToClient,
          completedAt: r.completedAt?.toISOString() ?? null,
        }))}
      />
    </div>
  )
}
