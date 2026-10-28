import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireStaff, audit, notify, json, jsonError } from '@/lib/auth'
import { parseBody } from '@/lib/rbac'
import { canTransition, TRANSITIONS } from '@/lib/video-state-machine'

const schema = z.object({
  to: z.enum(['PLANNED', 'SCHEDULED', 'SHOT', 'FOOTAGE_READY', 'EDITING', 'INTERNAL_REVIEW', 'CLIENT_REVIEW', 'REVISION_REQUIRED', 'APPROVED', 'DELIVERED', 'CANCELLED']),
  reason: z.string().max(2000).optional(),
  plannedShootDate: z.string().datetime().optional(),
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  const { id } = await ctx.params
  const { data, error: vErr } = await parseBody(req, schema)
  if (vErr) return vErr

  const deliverable = await db.videoDeliverable.findUnique({ where: { id }, include: { project: { select: { name: true, reference: true } } } })
  if (!deliverable) return jsonError('Deliverable not found', 404)

  // Assignment gate for delivery roles
  const isAssigned = deliverable.editorId === user.userId || deliverable.videographerId === user.userId
  const isGlobal = ['OWNER', 'CLIENT_MANAGER', 'CREATIVE_DIRECTOR'].includes(user.role)
  if (!isGlobal && !isAssigned) return jsonError('You are not assigned to this deliverable', 403)

  const from = deliverable.status
  if (!canTransition(from, data.to, user.role)) {
    return jsonError(`Invalid transition: ${from} → ${data.to} is not permitted for your role. Allowed from ${from}: ${(TRANSITIONS[from] ?? []).map(t => t.to).join(', ') || 'none'}`, 422)
  }

  const rule = (TRANSITIONS[from] ?? []).find(t => t.to === data.to)!
  if (rule.requires?.reason && !data.reason?.trim()) {
    return jsonError('A reason is required for this transition', 400)
  }
  if (rule.requires?.footageBackupVerified && !deliverable.footageBackupVerified) {
    return jsonError('Footage backup must be verified before footage can be marked ready', 422)
  }
  if (rule.requires?.deliveryMetadata && (!data.reason?.trim())) {
    // Delivery metadata: recorded as deliveryReference; require it via reason field named deliveryReference below
    return jsonError('A delivery reference is required when marking as delivered', 400)
  }

  const now = new Date()
  const updateData: Record<string, unknown> = { status: data.to }
  if (data.to === 'SHOT') { updateData.actualShootDate = now; updateData.shootCompletedAt = now }
  if (data.to === 'FOOTAGE_READY') updateData.footageReceivedAt = now
  if (data.to === 'DELIVERED') {
    updateData.deliveredAt = now
    updateData.deliveredById = user.userId
    updateData.deliveryReference = data.reason?.trim() ?? null
  }
  if (data.to === 'CANCELLED') updateData.cancelReason = data.reason?.trim() ?? null
  if (data.plannedShootDate) updateData.plannedShootDate = new Date(data.plannedShootDate)

  const updated = await db.videoDeliverable.update({ where: { id }, data: updateData })

  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'DELIVERABLE_TRANSITION', 'VideoDeliverable', id, `${deliverable.reference}: ${from} → ${data.to}${data.reason ? ` (${data.reason.slice(0, 80)})` : ''}`)

  // Notifications
  const link = `/app/video/deliverables/${id}`
  if (data.to === 'SCHEDULED' && deliverable.videographerId && deliverable.videographerId !== user.userId) {
    await notify('EMPLOYEE', deliverable.videographerId, 'DELIVERABLE_SCHEDULED', `Shoot scheduled for ${deliverable.title}`, data.plannedShootDate ? `Planned shoot date recorded.` : undefined, link)
  }
  if (data.to === 'INTERNAL_REVIEW') {
    const reviewers = await db.employee.findMany({ where: { role: { in: ['OWNER', 'CREATIVE_DIRECTOR'] }, isActive: true }, select: { id: true } })
    for (const r of reviewers) {
      if (r.id !== user.userId) await notify('EMPLOYEE', r.id, 'INTERNAL_REVIEW_REQUESTED', `Internal review requested: ${deliverable.title}`, undefined, link)
    }
  }
  if (data.to === 'EDITING' && deliverable.editorId && deliverable.editorId !== user.userId) {
    await notify('EMPLOYEE', deliverable.editorId, 'EDITING_ACTION', `${deliverable.title} moved to ${data.to.replace(/_/g, ' ').toLowerCase()}`, data.reason, link)
  }
  if (data.to === 'APPROVED' || data.to === 'DELIVERED') {
    if (deliverable.editorId && deliverable.editorId !== user.userId) {
      await notify('EMPLOYEE', deliverable.editorId, 'DELIVERABLE_STATE', `${deliverable.title} is ${data.to === 'APPROVED' ? 'client-approved' : 'delivered'}`, undefined, link)
    }
  }
  if (data.to === 'CANCELLED') {
    if (deliverable.editorId && deliverable.editorId !== user.userId) await notify('EMPLOYEE', deliverable.editorId, 'DELIVERABLE_CANCELLED', `${deliverable.title} was cancelled`, data.reason, link)
    if (deliverable.videographerId && deliverable.videographerId !== user.userId) await notify('EMPLOYEE', deliverable.videographerId, 'DELIVERABLE_CANCELLED', `${deliverable.title} was cancelled`, data.reason, link)
  }

  return json({ deliverable: updated })
}
