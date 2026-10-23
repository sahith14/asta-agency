import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireStaff, audit, notify, makeReference, json, jsonError } from '@/lib/auth'
import { can, getPagination, parseBody } from '@/lib/rbac'

export async function GET(req: NextRequest) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  const url = new URL(req.url)
  const { skip, take } = getPagination(url)
  const status = url.searchParams.get('status')
  const projectId = url.searchParams.get('projectId')
  const editorId = url.searchParams.get('editorId')
  const search = url.searchParams.get('q')?.trim()

  const isAssignedOnly = ['VIDEOGRAPHER', 'VIDEO_EDITOR', 'WEB_DEVELOPER'].includes(user.role)
  const where = {
    ...(status ? { status: status as 'PLANNED' } : {}),
    ...(projectId ? { projectId } : {}),
    ...(editorId ? { editorId } : {}),
    ...(search ? { OR: [{ title: { contains: search } }, { reference: { contains: search } }] } : {}),
    ...(isAssignedOnly ? { OR: [{ editorId: user.userId }, { videographerId: user.userId }] } : {}),
  }

  const [total, deliverables] = await Promise.all([
    db.videoDeliverable.count({ where }),
    db.videoDeliverable.findMany({
      where, skip, take,
      include: {
        project: { select: { id: true, name: true, reference: true, clientId: true, client: { select: { name: true } } } },
        videographer: { select: { id: true, name: true } },
        editor: { select: { id: true, name: true } },
        _count: { select: { versions: true } },
      },
      orderBy: [{ priority: 'desc' }, { deadline: 'asc' }, { createdAt: 'asc' }],
    }),
  ])
  return json({ total, deliverables })
}

const createSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1).max(160),
  description: z.string().max(4000).optional(),
  category: z.enum(['FOOD_SOCIAL_REEL', 'RESTAURANT_PROMO', 'BUSINESS_PROMO', 'PROPERTY_WALKTHROUGH', 'PRODUCT_AD', 'CORPORATE_BRAND_FILM', 'EVENT_COVERAGE', 'PERSONAL_BRAND', 'TESTIMONIAL', 'OTHER']).default('OTHER'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  targetPlatform: z.string().max(80).optional(),
  aspectRatio: z.string().max(20).optional(),
  targetDurationSec: z.number().int().min(1).max(3600).optional(),
  videographerId: z.string().optional(),
  editorId: z.string().optional(),
  deadline: z.string().datetime().optional(),
  revisionAllowance: z.number().int().min(0).max(20).default(1),
  replacesId: z.string().optional(),
  // Structured creative brief v1
  brief: z.object({
    objective: z.string().max(2000).optional(),
    audience: z.string().max(2000).optional(),
    keyMessage: z.string().max(2000).optional(),
    hook: z.string().max(1000).optional(),
    script: z.string().max(8000).optional(),
    scenes: z.string().max(4000).optional(),
    shotList: z.string().max(4000).optional(),
    voiceover: z.string().max(4000).optional(),
    musicDirection: z.string().max(1000).optional(),
    branding: z.string().max(1000).optional(),
    callToAction: z.string().max(1000).optional(),
    referenceLinks: z.string().max(1000).optional(),
  }).optional(),
})

export async function POST(req: NextRequest) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  if (!can(user, 'deliverables.manage')) return jsonError('You do not have permission to create deliverables', 403)
  const { data, error: vErr } = await parseBody(req, createSchema)
  if (vErr) return vErr

  const project = await db.project.findUnique({ where: { id: data.projectId }, include: { videoProject: true } })
  if (!project || !project.videoProject) return jsonError('Video project not found', 404)

  if (data.videographerId) {
    const emp = await db.employee.findUnique({ where: { id: data.videographerId } })
    if (!emp || !emp.isActive) return jsonError('Selected videographer not found', 404)
  }
  if (data.editorId) {
    const emp = await db.employee.findUnique({ where: { id: data.editorId } })
    if (!emp || !emp.isActive) return jsonError('Selected editor not found', 404)
  }

  // Replacement must reference an existing cancelled deliverable on the same project
  if (data.replacesId) {
    const replaced = await db.videoDeliverable.findUnique({ where: { id: data.replacesId } })
    if (!replaced || replaced.projectId !== data.projectId || replaced.status !== 'CANCELLED') {
      return jsonError('A replacement must reference a cancelled deliverable on the same project', 400)
    }
  }

  const deliverable = await db.$transaction(async (tx) => {
    const d = await tx.videoDeliverable.create({
      data: {
        reference: makeReference('VD'),
        projectId: data.projectId,
        videoProjectId: project.videoProject!.id,
        title: data.title,
        description: data.description,
        category: data.category,
        priority: data.priority,
        targetPlatform: data.targetPlatform,
        aspectRatio: data.aspectRatio,
        targetDurationSec: data.targetDurationSec,
        videographerId: data.videographerId,
        editorId: data.editorId,
        deadline: data.deadline ? new Date(data.deadline) : null,
        revisionAllowance: data.revisionAllowance,
        replacesId: data.replacesId,
        isReplacement: !!data.replacesId,
      },
    })
    if (data.brief) {
      await tx.creativeBriefVersion.create({
        data: {
          deliverableId: d.id,
          versionNumber: 1,
          content: JSON.stringify(data.brief),
          createdById: user.userId,
          approvalStatus: 'DRAFT',
        },
      })
    }
    return d
  })

  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'DELIVERABLE_CREATED', 'VideoDeliverable', deliverable.id, `Created deliverable ${deliverable.title} (${deliverable.reference})`)
  if (data.editorId && data.editorId !== user.userId) {
    await notify('EMPLOYEE', data.editorId, 'DELIVERABLE_ASSIGNED', `You were assigned as editor: ${deliverable.title}`, undefined, `/app/video/deliverables/${deliverable.id}`)
  }
  if (data.videographerId && data.videographerId !== user.userId) {
    await notify('EMPLOYEE', data.videographerId, 'DELIVERABLE_ASSIGNED', `You were assigned as videographer: ${deliverable.title}`, undefined, `/app/video/deliverables/${deliverable.id}`)
  }
  return json({ deliverable }, 201)
}
