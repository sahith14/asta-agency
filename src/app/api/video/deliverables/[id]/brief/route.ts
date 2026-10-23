import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireStaff, audit, json, jsonError } from '@/lib/auth'
import { can, parseBody } from '@/lib/rbac'

const briefSchema = z.object({
  objective: z.string().max(2000).optional(),
  audience: z.string().max(2000).optional(),
  keyMessage: z.string().max(2000).optional(),
  hook: z.string().max(1000).optional(),
  script: z.string().max(8000).optional(),
  scenes: z.string().max(4000).optional(),
  shotList: z.string().max(4000).optional(),
  voiceover: z.string().max(4000).optional(),
  dialogue: z.string().max(4000).optional(),
  musicDirection: z.string().max(1000).optional(),
  branding: z.string().max(1000).optional(),
  onScreenText: z.string().max(2000).optional(),
  captions: z.string().max(1000).optional(),
  callToAction: z.string().max(1000).optional(),
  referenceLinks: z.string().max(1000).optional(),
  requiredAssets: z.string().max(1000).optional(),
  aspectRatio: z.string().max(20).optional(),
  durationSec: z.number().int().min(1).max(3600).optional(),
  deliveryPlatform: z.string().max(80).optional(),
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // Create a new creative brief version (version history preserved)
  const { user, error } = await requireStaff(req)
  if (error) return error
  if (!can(user, 'briefs.edit')) return jsonError('You do not have permission to edit creative briefs', 403)
  const { id } = await ctx.params
  const { data, error: vErr } = await parseBody(req, briefSchema)
  if (vErr) return vErr

  const deliverable = await db.videoDeliverable.findUnique({ where: { id } })
  if (!deliverable) return jsonError('Deliverable not found', 404)
  if (deliverable.editorId !== user.userId && deliverable.videographerId !== user.userId &&
      !['OWNER', 'CLIENT_MANAGER', 'CREATIVE_DIRECTOR'].includes(user.role)) {
    return jsonError('You are not assigned to this deliverable', 403)
  }

  const latest = await db.creativeBriefVersion.findFirst({ where: { deliverableId: id }, orderBy: { versionNumber: 'desc' } })
  const nextVersion = (latest?.versionNumber ?? 0) + 1

  const brief = await db.creativeBriefVersion.create({
    data: {
      deliverableId: id,
      versionNumber: nextVersion,
      content: JSON.stringify(data),
      approvalStatus: 'DRAFT',
      createdById: user.userId,
    },
  })
  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'BRIEF_VERSION_CREATED', 'CreativeBriefVersion', brief.id, `${deliverable.reference}: brief v${nextVersion} drafted`)
  return json({ brief }, 201)
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // Approve a brief version (internal approval only; client approval via portal)
  const { user, error } = await requireStaff(req)
  if (error) return error
  if (!can(user, 'briefs.edit')) return jsonError('You do not have permission to approve briefs', 403)
  const { id } = await ctx.params
  const schema = z.object({
    briefVersionId: z.string().min(1),
    approvalStatus: z.enum(['DRAFT', 'INTERNAL_APPROVED', 'CLIENT_APPROVED']),
  })
  const { data, error: vErr } = await parseBody(req, schema)
  if (vErr) return vErr

  const brief = await db.creativeBriefVersion.findUnique({ where: { id: data.briefVersionId } })
  if (!brief || brief.deliverableId !== id) return jsonError('Brief version not found', 404)

  // CLIENT_APPROVED can only be set after INTERNAL_APPROVED (client action sets it via portal)
  if (data.approvalStatus === 'CLIENT_APPROVED' && brief.approvalStatus !== 'INTERNAL_APPROVED' && !['OWNER'].includes(user.role)) {
    return jsonError('Brief must be internally approved before client approval', 422)
  }
  const updated = await db.creativeBriefVersion.update({ where: { id: brief.id }, data: { approvalStatus: data.approvalStatus } })
  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'BRIEF_APPROVAL', 'CreativeBriefVersion', brief.id, `${id}: brief v${brief.versionNumber} → ${data.approvalStatus}`)
  return json({ brief: updated })
}
