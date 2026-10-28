import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireStaff, audit, notify, json, jsonError } from '@/lib/auth'
import { parseBody } from '@/lib/rbac'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  const { id } = await ctx.params
  const deliverable = await db.videoDeliverable.findUnique({ where: { id }, select: { id: true, editorId: true, videographerId: true, projectId: true } })
  if (!deliverable) return jsonError('Deliverable not found', 404)
  if (!['OWNER', 'CLIENT_MANAGER', 'SUPPORT_FINANCE', 'CREATIVE_DIRECTOR'].includes(user.role) &&
      deliverable.editorId !== user.userId && deliverable.videographerId !== user.userId) {
    return jsonError('You do not have access to this deliverable', 403)
  }
  const versions = await db.videoVersion.findMany({
    where: { deliverableId: id },
    orderBy: { versionNumber: 'desc' },
    include: { comments: { orderBy: { createdAt: 'asc' } } },
  })
  return json({ versions })
}

const createSchema = z.object({
  previewReference: z.string().max(500).optional(),
  changeSummary: z.string().max(2000).optional(),
  submitForInternalReview: z.boolean().default(true),
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // Editor registers a new edit version and submits for internal review
  const { user, error } = await requireStaff(req)
  if (error) return error
  const { id } = await ctx.params
  const { data, error: vErr } = await parseBody(req, createSchema)
  if (vErr) return vErr

  const deliverable = await db.videoDeliverable.findUnique({ where: { id } })
  if (!deliverable) return jsonError('Deliverable not found', 404)

  // Editors register their own versions; managers may too
  const canEdit = ['OWNER', 'CLIENT_MANAGER'].includes(user.role) || deliverable.editorId === user.userId
  if (!canEdit) return jsonError('Only the assigned editor or a manager can register edit versions', 403)
  if (!['EDITING', 'REVISION_REQUIRED'].includes(deliverable.status)) {
    return jsonError(`Versions can only be registered while editing. Current status: ${deliverable.status}`, 422)
  }

  const nextNumber = deliverable.currentVersionNumber + 1
  const result = await db.$transaction(async (tx) => {
    const version = await tx.videoVersion.create({
      data: {
        deliverableId: id,
        versionNumber: nextNumber,
        previewReference: data.previewReference,
        changeSummary: data.changeSummary,
        uploadedById: user.userId,
        uploadedByName: user.name,
        reviewStatus: 'PENDING_INTERNAL',
      },
    })
    await tx.videoDeliverable.update({
      where: { id },
      data: { currentVersionNumber: nextNumber },
    })
    return version
  })

  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'VERSION_CREATED', 'VideoVersion', result.id, `${deliverable.reference}: edit v${nextNumber} registered`)

  if (data.submitForInternalReview) {
    const reviewers = await db.employee.findMany({ where: { role: { in: ['OWNER', 'CREATIVE_DIRECTOR'] }, isActive: true }, select: { id: true } })
    for (const r of reviewers) {
      if (r.id !== user.userId) await notify('EMPLOYEE', r.id, 'INTERNAL_REVIEW_REQUESTED', `Internal review requested: ${deliverable.title} (v${nextNumber})`, undefined, `/app/video/deliverables/${id}`)
    }
  }

  return json({ version: result }, 201)
}
