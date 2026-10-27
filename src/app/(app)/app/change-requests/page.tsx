import { db } from '@/lib/db'
import { requirePageRole } from '../_lib'
import { ROLES } from '@/lib/constants'
import { ChangeRequestsView } from './change-requests-view'

export default async function ChangeRequestsPage() {
  const user = await requirePageRole(['CLIENT_MANAGER', 'WEB_DEVELOPER'])

  const [changeRequests, developers] = await Promise.all([
    db.changeRequest.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        details: true,
        status: true,
        scopeImpact: true,
        founderNotes: true,
        decisionAt: true,
        demoId: true,
        createdAt: true,
        project: { select: { id: true, name: true, client: { select: { name: true } } } },
        raisedBy: { select: { id: true, name: true, role: true } },
        tasks: { select: { id: true, title: true, status: true, projectId: true } },
      },
    }),
    user.role === ROLES.FOUNDER
      ? db.user.findMany({ where: { role: ROLES.WEB_DEVELOPER, isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, email: true } })
      : Promise.resolve([]),
  ])

  const crIds = changeRequests.map((cr) => cr.id)
  const events = crIds.length
    ? await db.approvalEvent.findMany({
        where: { entityType: 'CHANGE_REQUEST', entityId: { in: crIds } },
        orderBy: { createdAt: 'desc' },
        include: { actor: { select: { name: true } } },
      })
    : []

  const eventsByCr = new Map<string, { id: string; action: string; note: string | null; resultingAction: string | null; actorName: string; createdAt: string }[]>()
  for (const ev of events) {
    const list = eventsByCr.get(ev.entityId) ?? []
    list.push({
      id: ev.id,
      action: ev.action,
      note: ev.note,
      resultingAction: ev.resultingAction,
      actorName: ev.actor?.name ?? '—',
      createdAt: ev.createdAt.toISOString(),
    })
    eventsByCr.set(ev.entityId, list)
  }

  return (
    <ChangeRequestsView
      role={user.role}
      changeRequests={changeRequests.map((cr) => ({
        id: cr.id,
        title: cr.title,
        details: cr.details,
        status: cr.status,
        scopeImpact: cr.scopeImpact,
        founderNotes: cr.founderNotes,
        decisionAt: cr.decisionAt?.toISOString() ?? null,
        demoId: cr.demoId,
        createdAt: cr.createdAt.toISOString(),
        projectId: cr.project.id,
        projectName: cr.project.name,
        clientName: cr.project.client.name,
        raisedById: cr.raisedBy.id,
        raisedByName: cr.raisedBy.name,
        raisedByRole: cr.raisedBy.role,
        linkedTask: cr.tasks[0] ? { id: cr.tasks[0].id, title: cr.tasks[0].title, status: cr.tasks[0].status, projectId: cr.tasks[0].projectId } : null,
      }))}
      developers={developers}
      eventsByCr={Object.fromEntries(eventsByCr)}
    />
  )
}
