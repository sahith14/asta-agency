import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireClientUser, notify, audit, json, jsonError } from '@/lib/auth'
import { parseBody } from '@/lib/rbac'
import { z } from 'zod'

// GET /api/portal/overview — client's own data only (scoped by session clientId)
export async function GET(req: NextRequest) {
  const { user, error } = await requireClientUser(req)
  if (error) return error
  const clientId = user.clientId!
  const now = new Date()

  const [client, projects, deliverablesInReview, upcomingShoots, openTickets, unreadNotifications, invoices] = await Promise.all([
    db.client.findUnique({ where: { id: clientId }, select: { name: true, businessCategory: true } }),
    db.project.findMany({ where: { clientId, isArchived: false }, include: { videoProject: { select: { agreedVideoCount: true, packageNameSnapshot: true } }, _count: { select: { deliverables: true, tasks: true } } }, orderBy: { updatedAt: 'desc' } }),
    db.videoDeliverable.count({ where: { project: { clientId }, status: 'CLIENT_REVIEW' } }),
    db.shootSession.findMany({ where: { project: { clientId }, status: { in: ['PLANNED', 'SCHEDULED'] }, date: { gte: new Date(now.getTime() - 86400000) } }, orderBy: { date: 'asc' }, take: 5, select: { id: true, title: true, date: true, startTime: true, address: true } }),
    db.ticket.count({ where: { clientId, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    db.notification.count({ where: { userType: 'CLIENT_USER', userId: user.userId, readAt: null } }),
    db.invoice.findMany({ where: { clientId }, orderBy: { createdAt: 'desc' }, take: 5 }),
  ])

  return json({ client, projects, deliverablesInReview, upcomingShoots, openTickets, unreadNotifications, invoices })
}

const feedbackSchema = z.object({
  versionId: z.string().min(1),
  decision: z.enum(['APPROVED', 'REVISION_REQUESTED']),
  comment: z.string().max(4000).optional(),
  timecode: z.string().max(20).optional(),
})

// POST /api/portal/overview — client feedback on a specific version (approve / request revision)
export async function POST(req: NextRequest) {
  const { user, error } = await requireClientUser(req)
  if (error) return error
  const { data, error: vErr } = await parseBody(req, feedbackSchema)
  if (vErr) return vErr

  const version = await db.videoVersion.findUnique({ where: { id: data.versionId }, include: { deliverable: { include: { project: { select: { clientId: true, name: true } } } } } })
  if (!version) return jsonError('Version not found', 404)
  // Isolation: version must belong to a project of the session's client
  if (version.deliverable.project.clientId !== user.clientId) return jsonError('Version not found', 404)
  if (version.reviewStatus !== 'PENDING_CLIENT') return jsonError('This version is not awaiting your review', 422)

  const now = new Date()
  const deliverable = version.deliverable

  const updatedVersion = await db.$transaction(async (tx) => {
    const v = await tx.videoVersion.update({
      where: { id: version.id },
      data: {
        reviewStatus: data.decision === 'APPROVED' ? 'APPROVED' : 'CLIENT_REJECTED',
        approvedAt: data.decision === 'APPROVED' ? now : null,
      },
    })
    if (data.decision === 'APPROVED') {
      await tx.videoDeliverable.update({ where: { id: deliverable.id }, data: { status: 'APPROVED' } })
    } else {
      await tx.videoDeliverable.update({
        where: { id: deliverable.id },
        data: {
          status: 'REVISION_REQUIRED',
          revisionCount: { increment: 1 },
        },
      })
    }
    return v
  })

  if (data.comment?.trim()) {
    await db.versionComment.create({
      data: { versionId: version.id, authorType: 'CLIENT_USER', authorId: user.userId, authorName: user.name, body: data.comment.trim(), timecode: data.timecode },
    })
  }

  await audit(
    { userType: 'CLIENT_USER', userId: user.userId, name: user.name },
    data.decision === 'APPROVED' ? 'CLIENT_VERSION_APPROVED' : 'CLIENT_REVISION_REQUESTED',
    'VideoVersion', version.id,
    `${deliverable.reference} v${version.versionNumber}: ${data.decision === 'APPROVED' ? 'approved by client' : 'revision requested by client'}`,
  )

  // Notify staff
  const link = `/app/video/deliverables/${deliverable.id}`
  const recipients = new Set<string>()
  if (deliverable.editorId) recipients.add(deliverable.editorId)
  if (deliverable.videographerId) recipients.add(deliverable.videographerId)
  const managers = await db.employee.findMany({ where: { role: { in: ['OWNER', 'CLIENT_MANAGER'] }, isActive: true }, select: { id: true } })
  for (const m of managers) recipients.add(m.id)
  for (const r of recipients) {
    await notify('EMPLOYEE', r, data.decision === 'APPROVED' ? 'CLIENT_APPROVED' : 'REVISION_REQUESTED',
      data.decision === 'APPROVED' ? `Client approved: ${deliverable.title} (v${version.versionNumber})` : `Revision requested: ${deliverable.title}`,
      data.comment?.slice(0, 200), link)
  }

  return json({ ok: true, version: updatedVersion })
}
