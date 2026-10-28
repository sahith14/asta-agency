import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireStaff, audit, notify, json, jsonError } from '@/lib/auth'
import { parseBody } from '@/lib/rbac'

const reviewSchema = z.object({
  decision: z.enum(['INTERNAL_APPROVED', 'INTERNAL_REJECTED']),
  feedback: z.string().max(4000).optional(),
})

// POST /api/video/versions/[id] — internal review decision on a specific version
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  if (!['OWNER', 'CREATIVE_DIRECTOR', 'CLIENT_MANAGER'].includes(user.role)) {
    return jsonError('Only internal reviewers can decide on versions', 403)
  }
  const { id } = await ctx.params
  const { data, error: vErr } = await parseBody(req, reviewSchema)
  if (vErr) return vErr

  const version = await db.videoVersion.findUnique({ where: { id }, include: { deliverable: true } })
  if (!version) return jsonError('Version not found', 404)
  if (version.reviewStatus !== 'PENDING_INTERNAL') {
    return jsonError(`This version is not awaiting internal review (current: ${version.reviewStatus})`, 422)
  }
  if (version.uploadedById === user.userId && !['OWNER'].includes(user.role)) {
    return jsonError('Reviewers cannot approve their own upload', 403)
  }

  const updated = await db.$transaction(async (tx) => {
    const v = await tx.videoVersion.update({
      where: { id },
      data: {
        reviewStatus: data.decision === 'INTERNAL_APPROVED' ? 'PENDING_CLIENT' : 'INTERNAL_REJECTED',
        internalReviewerId: user.userId,
        internalFeedback: data.feedback,
      },
    })
    // Deliverable status follows version state — approval gate binds to a specific version
    if (data.decision === 'INTERNAL_APPROVED') {
      await tx.videoDeliverable.update({ where: { id: version.deliverableId }, data: { status: 'CLIENT_REVIEW' } })
    } else {
      await tx.videoDeliverable.update({ where: { id: version.deliverableId }, data: { status: 'EDITING' } })
    }
    return v
  })

  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'VERSION_INTERNAL_REVIEW', 'VideoVersion', id, `${version.deliverable.reference} v${version.versionNumber}: ${data.decision}`)

  const link = `/app/video/deliverables/${version.deliverableId}`
  if (version.uploadedById && version.uploadedById !== user.userId) {
    await notify('EMPLOYEE', version.uploadedById, data.decision === 'INTERNAL_APPROVED' ? 'INTERNAL_REVIEW_PASSED' : 'INTERNAL_REVIEW_FAILED',
      data.decision === 'INTERNAL_APPROVED' ? `v${version.versionNumber} passed internal review` : `v${version.versionNumber} needs changes`,
      data.feedback, link)
  }
  if (data.decision === 'INTERNAL_APPROVED') {
    // notify client portal users of the project's client
    const client = await db.project.findUnique({ where: { id: version.deliverable.projectId }, select: { clientId: true } })
    if (client) {
      const portalUsers = await db.clientUser.findMany({ where: { clientId: client.clientId, isActive: true }, select: { id: true } })
      for (const pu of portalUsers) {
        await notify('CLIENT_USER', pu.id, 'VERSION_READY_FOR_REVIEW', `New version ready for your review: ${version.deliverable.title}`, undefined, '/portal/deliverables')
      }
    }
  }

  return json({ version: updated })
}

const commentSchema = z.object({
  body: z.string().min(1).max(4000),
  timecode: z.string().max(20).optional(),
})

// PUT /api/video/versions/[id] — add a review comment (staff)
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  const { id } = await ctx.params
  const { data, error: vErr } = await parseBody(req, commentSchema)
  if (vErr) return vErr

  const version = await db.videoVersion.findUnique({ where: { id }, include: { deliverable: { select: { reference: true, editorId: true, videographerId: true } } } })
  if (!version) return jsonError('Version not found', 404)
  const d = version.deliverable
  if (!['OWNER', 'CLIENT_MANAGER', 'SUPPORT_FINANCE', 'CREATIVE_DIRECTOR'].includes(user.role) && d.editorId !== user.userId && d.videographerId !== user.userId) {
    return jsonError('You do not have access to this version', 403)
  }
  const comment = await db.versionComment.create({
    data: { versionId: id, authorType: 'EMPLOYEE', authorId: user.userId, authorName: user.name, body: data.body, timecode: data.timecode },
  })
  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'VERSION_COMMENT', 'VideoVersion', id, `Comment added to ${version.deliverable.reference} v${version.versionNumber}`)
  return json({ comment }, 201)
}
