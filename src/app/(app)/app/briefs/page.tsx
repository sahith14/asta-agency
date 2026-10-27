import { db } from '@/lib/db'
import { requirePageUser } from '../_lib'
import { ROLES } from '@/lib/constants'
import { BriefsClient } from './briefs-client'

export default async function BriefsPage() {
  const user = await requirePageUser()

  const briefs = await db.brief.findMany({
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      objectives: true,
      audience: true,
      scope: true,
      budget: true,
      timeline: true,
      notes: true,
      status: true,
      reviewNotes: true,
      submittedAt: true,
      updatedAt: true,
      clientId: true,
      projectId: true,
      client: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      reviewedBy: { select: { id: true, name: true } },
    },
  })

  return (
    <BriefsClient
      canReview={user.role === ROLES.FOUNDER || user.role === ROLES.CLIENT_MANAGER}
      briefs={briefs.map((b) => ({
        id: b.id,
        title: b.title,
        objectives: b.objectives,
        audience: b.audience,
        scope: b.scope,
        budget: b.budget,
        timeline: b.timeline,
        notes: b.notes,
        status: b.status,
        reviewNotes: b.reviewNotes,
        submittedAt: b.submittedAt?.toISOString() ?? null,
        updatedAt: b.updatedAt.toISOString(),
        clientId: b.clientId,
        clientName: b.client.name,
        projectId: b.projectId,
        projectName: b.project?.name ?? null,
        createdByName: b.createdBy.name,
        reviewedByName: b.reviewedBy?.name ?? null,
      }))}
    />
  )
}
