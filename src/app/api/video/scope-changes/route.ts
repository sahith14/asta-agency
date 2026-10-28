import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireStaff, audit, notify, makeReference, json, jsonError } from '@/lib/auth'
import { can, parseBody } from '@/lib/rbac'

const createSchema = z.object({
  videoProjectId: z.string().min(1),
  type: z.enum(['ADDITIONAL_DELIVERABLES', 'PACKAGE_CHANGE', 'OTHER']),
  description: z.string().min(1).max(2000),
  addedVideoCount: z.number().int().min(0).max(100).default(0),
  priceImpact: z.number().min(0).max(1_000_000).default(0),
})

export async function POST(req: NextRequest) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  if (!can(user, 'projects.manage')) return jsonError('You do not have permission to propose scope changes', 403)
  const { data, error: vErr } = await parseBody(req, createSchema)
  if (vErr) return vErr

  const vp = await db.videoProject.findUnique({ where: { id: data.videoProjectId }, include: { project: { select: { name: true, reference: true } } } })
  if (!vp) return jsonError('Video project not found', 404)

  const change = await db.projectScopeChange.create({
    data: {
      videoProjectId: data.videoProjectId,
      type: data.type,
      description: data.description,
      addedVideoCount: data.addedVideoCount,
      priceImpact: data.priceImpact,
      status: 'PROPOSED',
      requestedById: user.userId,
    },
  })
  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'SCOPE_CHANGE_PROPOSED', 'ProjectScopeChange', change.id, `${vp.project.reference}: proposed +${data.addedVideoCount} videos (${data.description.slice(0, 80)})`)
  return json({ scopeChange: change }, 201)
}
