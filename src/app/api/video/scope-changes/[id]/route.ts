import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireStaff, audit, makeReference, json, jsonError } from '@/lib/auth'
import { can, parseBody } from '@/lib/rbac'

const decideSchema = z.object({ decision: z.enum(['APPROVED', 'REJECTED']) })

// PATCH /api/video/scope-changes/[id] — Founder/manager decision.
// Approval atomically creates the additional contracted deliverables (transaction + duplicate-safe).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  if (!can(user, 'projects.manage')) return jsonError('You do not have permission to decide scope changes', 403)
  const { id } = await ctx.params
  const { data, error: vErr } = await parseBody(req, decideSchema)
  if (vErr) return vErr

  const change = await db.projectScopeChange.findUnique({ where: { id }, include: { videoProject: { include: { project: { select: { id: true, name: true, reference: true, budget: true, agreedPrice: true } } } } } })
  if (!change) return jsonError('Scope change not found', 404)
  if (change.status !== 'PROPOSED') return jsonError(`Scope change already ${change.status.toLowerCase()}`, 422)

  if (data.decision === 'REJECTED') {
    await db.projectScopeChange.update({ where: { id }, data: { status: 'REJECTED', decidedById: user.userId, decidedAt: new Date() } })
    await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'SCOPE_CHANGE_REJECTED', 'ProjectScopeChange', id, `${change.videoProject.project.reference}: scope change rejected`)
    return json({ ok: true })
  }

  const createdIds = await db.$transaction(async (tx) => {
    // Idempotency guard: re-check status inside the transaction
    const current = await tx.projectScopeChange.findUnique({ where: { id } })
    if (!current || current.status !== 'PROPOSED') return null
    await tx.projectScopeChange.update({ where: { id }, data: { status: 'APPROVED', decidedById: user.userId, decidedAt: new Date() } })
    // Grow the contract snapshot and budget
    await tx.videoProject.update({ where: { id: change.videoProjectId }, data: { agreedVideoCount: { increment: change.addedVideoCount } } })
    if (change.priceImpact > 0) {
      await tx.project.update({ where: { id: change.videoProject.projectId }, data: {
        agreedPrice: { increment: change.priceImpact },
        budget: { increment: change.priceImpact },
      } })
    }
    // Create additional deliverables
    const ids: string[] = []
    for (let i = 0; i < change.addedVideoCount; i++) {
      const d = await tx.videoDeliverable.create({
        data: {
          reference: makeReference('VD'),
          projectId: change.videoProject.projectId,
          videoProjectId: change.videoProjectId,
          title: `Additional video ${change.addedVideoCount > 1 ? i + 1 + ' ' : ''}(approved scope change)`,
          category: 'OTHER',
          revisionAllowance: change.videoProject.revisionAllowance,
        },
      })
      ids.push(d.id)
    }
    return ids
  })

  if (createdIds === null) return jsonError('Scope change already processed', 422)

  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'SCOPE_CHANGE_APPROVED', 'ProjectScopeChange', id, `${change.videoProject.project.reference}: approved +${change.addedVideoCount} videos, +${change.priceImpact} price impact, ${createdIds.length} deliverables created`)
  return json({ ok: true, createdDeliverables: createdIds.length })
}
