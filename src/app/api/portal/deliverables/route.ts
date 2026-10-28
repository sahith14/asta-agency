import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireClientUser, json } from '@/lib/auth'

// GET /api/portal/deliverables — client's deliverables with permitted preview versions
export async function GET(req: NextRequest) {
  const { user, error } = await requireClientUser(req)
  if (error) return error
  const clientId = user.clientId!

  const deliverables = await db.videoDeliverable.findMany({
    where: { project: { clientId }, status: { in: ['CLIENT_REVIEW', 'APPROVED', 'DELIVERED', 'EDITING', 'INTERNAL_REVIEW', 'REVISION_REQUIRED', 'SCHEDULED', 'SHOT', 'FOOTAGE_READY', 'PLANNED'] } },
    include: {
      project: { select: { id: true, name: true, reference: true } },
      versions: {
        where: { reviewStatus: { in: ['PENDING_CLIENT', 'APPROVED'] } },
        orderBy: { versionNumber: 'desc' },
        include: { comments: { where: { authorType: 'CLIENT_USER' }, orderBy: { createdAt: 'asc' } } },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return json({
    deliverables: deliverables.map(d => ({
      id: d.id,
      reference: d.reference,
      title: d.title,
      status: d.status,
      platform: d.targetPlatform,
      aspectRatio: d.aspectRatio,
      targetDurationSec: d.targetDurationSec,
      clientNotes: d.clientNotes,
      deadline: d.deadline,
      deliveredAt: d.deliveredAt,
      deliveryReference: d.status === 'DELIVERED' ? d.deliveryReference : null,
      project: d.project,
      versions: d.versions.map(v => ({
        id: v.id,
        versionNumber: v.versionNumber,
        previewReference: v.previewReference,
        changeSummary: v.changeSummary,
        reviewStatus: v.reviewStatus,
        approvedAt: v.approvedAt,
        myComments: v.comments.map(c => ({ id: c.id, body: c.body, timecode: c.timecode, at: c.createdAt })),
      })),
    })),
  })
}
