import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireStaff, audit, notify, json, jsonError } from '@/lib/auth'
import { can, parseBody } from '@/lib/rbac'

async function loadForUser(id: string, user: { userId: string; role: string }) {
  const d = await db.videoDeliverable.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true, reference: true, clientId: true, client: { select: { id: true, name: true } } } },
      videographer: { select: { id: true, name: true } },
      editor: { select: { id: true, name: true } },
      replaces: { select: { id: true, reference: true, title: true } },
      replacedBy: { select: { id: true, reference: true, title: true } },
      versions: { orderBy: { versionNumber: 'desc' }, include: { comments: { orderBy: { createdAt: 'asc' } } } },
      briefVersions: { orderBy: { versionNumber: 'desc' } },
      shootLinks: { include: { session: { select: { id: true, reference: true, title: true, date: true, status: true } } } },
    },
  })
  if (!d) return { deliverable: null, forbidden: false }
  if (['OWNER', 'CLIENT_MANAGER', 'SUPPORT_FINANCE', 'CREATIVE_DIRECTOR'].includes(user.role)) return { deliverable: d, forbidden: false }
  if (d.editorId === user.userId || d.videographerId === user.userId) return { deliverable: d, forbidden: false }
  return { deliverable: null, forbidden: true }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  const { id } = await ctx.params
  const { deliverable, forbidden } = await loadForUser(id, user)
  if (forbidden) return jsonError('You do not have access to this deliverable', 403)
  if (!deliverable) return jsonError('Deliverable not found', 404)
  return json({ deliverable })
}

const updateSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  description: z.string().max(4000).optional(),
  category: z.enum(['FOOD_SOCIAL_REEL', 'RESTAURANT_PROMO', 'BUSINESS_PROMO', 'PROPERTY_WALKTHROUGH', 'PRODUCT_AD', 'CORPORATE_BRAND_FILM', 'EVENT_COVERAGE', 'PERSONAL_BRAND', 'TESTIMONIAL', 'OTHER']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  targetPlatform: z.string().max(80).optional(),
  aspectRatio: z.string().max(20).optional(),
  targetDurationSec: z.number().int().min(1).max(3600).optional(),
  videographerId: z.string().nullable().optional(),
  editorId: z.string().nullable().optional(),
  plannedShootDate: z.string().datetime().nullable().optional(),
  deadline: z.string().datetime().nullable().optional(),
  revisionAllowance: z.number().int().min(0).max(20).optional(),
  blockers: z.string().max(2000).optional(),
  internalNotes: z.string().max(4000).optional(),
  clientNotes: z.string().max(4000).optional(),
  footageBackupVerified: z.boolean().optional(),
})

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  const { id } = await ctx.params
  const { deliverable, forbidden } = await loadForUser(id, user)
  if (forbidden || !deliverable) return jsonError('Deliverable not found or access denied', forbidden ? 403 : 404)
  const { data, error: vErr } = await parseBody(req, updateSchema)
  if (vErr) return vErr

  // Permission rules for field edits
  const isManager = ['OWNER', 'CLIENT_MANAGER'].includes(user.role)
  const isCD = user.role === 'CREATIVE_DIRECTOR'
  const isAssignedEditor = deliverable.editorId === user.userId
  const isAssignedVideographer = deliverable.videographerId === user.userId
  if (!isManager && !isCD && !isAssignedEditor && !isAssignedVideographer) {
    return jsonError('You do not have permission to update this deliverable', 403)
  }
  // Assignment + admin fields only for managers
  const updateData: Record<string, unknown> = {}
  const managerFields = ['videographerId', 'editorId', 'revisionAllowance', 'deadline', 'priority', 'internalNotes', 'clientNotes']
  for (const [k, v] of Object.entries(data)) {
    if (managerFields.includes(k) && !isManager) continue
    if (k === 'footageBackupVerified' && !isManager && !isAssignedVideographer) continue
    updateData[k] = v
  }
  if (data.plannedShootDate !== undefined && !isManager && !isCD) delete updateData.plannedShootDate

  if (updateData.videographerId) {
    const emp = await db.employee.findUnique({ where: { id: updateData.videographerId as string } })
    if (!emp || !emp.isActive) return jsonError('Selected videographer not found', 404)
  }
  if (updateData.editorId) {
    const emp = await db.employee.findUnique({ where: { id: updateData.editorId as string } })
    if (!emp || !emp.isActive) return jsonError('Selected editor not found', 404)
  }

  const updated = await db.videoDeliverable.update({
    where: { id },
    data: {
      ...updateData,
      plannedShootDate: data.plannedShootDate === undefined ? undefined : data.plannedShootDate ? new Date(data.plannedShootDate) : null,
      deadline: data.deadline === undefined ? undefined : data.deadline ? new Date(data.deadline) : null,
    },
  })

  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'DELIVERABLE_UPDATED', 'VideoDeliverable', id, `Updated deliverable ${updated.title} (${updated.reference})`)
  if (updateData.editorId && updateData.editorId !== user.userId) {
    await notify('EMPLOYEE', updateData.editorId as string, 'DELIVERABLE_ASSIGNED', `You were assigned as editor: ${updated.title}`, undefined, `/app/video/deliverables/${updated.id}`)
  }
  if (updateData.videographerId && updateData.videographerId !== user.userId) {
    await notify('EMPLOYEE', updateData.videographerId as string, 'DELIVERABLE_ASSIGNED', `You were assigned as videographer: ${updated.title}`, undefined, `/app/video/deliverables/${updated.id}`)
  }
  return json({ deliverable: updated })
}
