import { db } from '@/lib/db'
import { requirePageUser, canManageClients } from '../_lib'
import { MeetingsClient } from './meetings-client'

export default async function MeetingsPage() {
  const user = await requirePageUser()

  const [meetings, clients, projects] = await Promise.all([
    db.meeting.findMany({
      orderBy: { startsAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        startsAt: true,
        durationMinutes: true,
        location: true,
        meetingLink: true,
        status: true,
        outcome: true,
        clientId: true,
        projectId: true,
        client: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        createdBy: { select: { name: true } },
      },
    }),
    db.client.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.project.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, clientId: true } }),
  ])

  return (
    <MeetingsClient
      canManage={canManageClients(user)}
      meetings={meetings.map((m) => ({
        id: m.id,
        title: m.title,
        description: m.description,
        startsAt: m.startsAt.toISOString(),
        durationMinutes: m.durationMinutes,
        location: m.location,
        meetingLink: m.meetingLink,
        status: m.status,
        outcome: m.outcome,
        clientId: m.clientId,
        clientName: m.client?.name ?? null,
        projectId: m.projectId,
        projectName: m.project?.name ?? null,
        createdByName: m.createdBy.name,
      }))}
      clients={clients}
      projects={projects}
    />
  )
}
