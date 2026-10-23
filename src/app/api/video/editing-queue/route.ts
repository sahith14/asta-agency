import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireStaff, json } from '@/lib/auth'

// GET /api/video/editing-queue — editor-focused work queue
export async function GET(req: NextRequest) {
  const { user, error } = await requireStaff(req)
  if (error) return error

  const isEditorView = user.role === 'VIDEO_EDITOR'
  const url = new URL(req.url)
  const status = url.searchParams.get('status')

  const editorFilter = isEditorView ? { editorId: user.userId } : url.searchParams.get('editorId') ? { editorId: url.searchParams.get('editorId')! } : {}
  const statusFilter = status
    ? { status: status as 'EDITING' | 'REVISION_REQUIRED' | 'FOOTAGE_READY' | 'INTERNAL_REVIEW' }
    : { status: { in: ['FOOTAGE_READY', 'EDITING', 'REVISION_REQUIRED', 'INTERNAL_REVIEW'] as ('FOOTAGE_READY' | 'EDITING' | 'REVISION_REQUIRED' | 'INTERNAL_REVIEW')[] } }
  const where = { ...editorFilter, ...statusFilter }

  const deliverables = await db.videoDeliverable.findMany({
    where,
    include: {
      project: { select: { id: true, name: true, reference: true, client: { select: { name: true } } } },
      videographer: { select: { name: true } },
      versions: { orderBy: { versionNumber: 'desc' }, take: 1 },
    },
    orderBy: [{ deadline: 'asc' }, { priority: 'desc' }],
  })

  const queue = deliverables.map(d => ({
    id: d.id,
    reference: d.reference,
    title: d.title,
    status: d.status,
    priority: d.priority,
    project: d.project,
    deadline: d.deadline,
    videographer: d.videographer?.name ?? null,
    currentVersion: d.versions[0]?.versionNumber ?? 0,
    reviewStatus: d.versions[0]?.reviewStatus ?? null,
    revisionCount: d.revisionCount,
    revisionAllowance: d.revisionAllowance,
    blockers: d.blockers,
    waitingSince: d.status === 'FOOTAGE_READY' || d.status === 'REVISION_REQUIRED' ? d.updatedAt : null,
  }))

  return json({ queue })
}
