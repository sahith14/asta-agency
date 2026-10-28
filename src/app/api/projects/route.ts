import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireStaff, audit, notify, makeReference, json, jsonError } from '@/lib/auth'
import { can, getPagination, isGlobalReader, parseBody } from '@/lib/rbac'

export async function GET(req: NextRequest) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  const url = new URL(req.url)
  const { skip, take } = getPagination(url)
  const serviceType = url.searchParams.get('serviceType')
  const status = url.searchParams.get('status')
  const clientId = url.searchParams.get('clientId')
  const search = url.searchParams.get('q')?.trim()

  const where = {
    isArchived: false,
    ...(serviceType === 'WEBSITE' || serviceType === 'VIDEO_PRODUCTION' ? { serviceType: serviceType as 'WEBSITE' | 'VIDEO_PRODUCTION' } : {}),
    ...(status ? { status: status as 'DISCOVERY' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED' } : {}),
    ...(clientId ? { clientId } : {}),
    ...(search ? { OR: [{ name: { contains: search } }, { reference: { contains: search } }] } : {}),
    // Assigned-only scoping for delivery roles
    ...(isGlobalReader(user.role) ? {} : {
      OR: [
        { managerId: user.userId },
        { deliverables: { some: { OR: [{ editorId: user.userId }, { videographerId: user.userId }] } } },
        { shoots: { some: { assignments: { some: { employeeId: user.userId } } } } },
        { tasks: { some: { assigneeId: user.userId } } },
      ],
    }),
  }

  const [total, projects] = await Promise.all([
    db.project.count({ where }),
    db.project.findMany({
      where, skip, take,
      include: {
        client: { select: { id: true, name: true } },
        manager: { select: { id: true, name: true } },
        videoProject: { select: { agreedVideoCount: true, packageNameSnapshot: true } },
        _count: { select: { tasks: true, deliverables: true, shoots: true } },
      },
      orderBy: { updatedAt: 'desc' },
    }),
  ])
  return json({ total, projects })
}

const createSchema = z.object({
  name: z.string().min(1).max(160),
  serviceType: z.enum(['WEBSITE', 'VIDEO_PRODUCTION']),
  clientId: z.string().min(1),
  managerId: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  brief: z.string().max(8000).optional(),
  notes: z.string().max(4000).optional(),
  startDate: z.string().datetime().optional(),
  targetDate: z.string().datetime().optional(),
  agreedPrice: z.number().min(0).max(10_000_000).optional(),
  budget: z.number().min(0).max(10_000_000).optional(),
  // Video-specific (required when serviceType=VIDEO_PRODUCTION)
  video: z.object({
    businessCategory: z.enum(['Restaurant', 'Cafe / Coffee Shop', 'Food and Beverage', 'Real Estate / Property', 'Retail', 'Hospitality', 'Corporate', 'Events', 'Personal Brand', 'Automotive', 'Healthcare / Professional Services', 'Other']).default('Other'),
    campaignObjective: z.string().max(2000).optional(),
    targetAudience: z.string().max(2000).optional(),
    distributionPlatforms: z.string().max(500).optional(),
    targetFormats: z.string().max(500).optional(),
    shootLocations: z.string().max(1000).optional(),
    creativeDirection: z.string().max(4000).optional(),
    contractNotes: z.string().max(4000).optional(),
    clientVisibleNotes: z.string().max(4000).optional(),
    packageId: z.string().optional(),
    // Contract snapshot values confirmed by the creator (never auto-imagined)
    agreedVideoCount: z.number().int().min(1).max(500).optional(),
    revisionAllowance: z.number().int().min(0).max(20).default(1),
    createDeliverables: z.boolean().default(true),
  }).optional(),
})

export async function POST(req: NextRequest) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  if (!can(user, 'projects.manage')) return jsonError('You do not have permission to create projects', 403)
  const { data, error: vErr } = await parseBody(req, createSchema)
  if (vErr) return vErr

  const client = await db.client.findUnique({ where: { id: data.clientId } })
  if (!client) return jsonError('Client not found', 404)

  if (data.managerId) {
    const manager = await db.employee.findUnique({ where: { id: data.managerId } })
    if (!manager || !manager.isActive) return jsonError('Selected project manager not found', 404)
  }

  // Video contract snapshot
  let packageSnapshot: { id: string; name: string; videoCount: number; revisionRounds: number; template: string | null } | null = null
  if (data.serviceType === 'VIDEO_PRODUCTION') {
    if (data.video?.packageId) {
      const pkg = await db.videoPackage.findUnique({ where: { id: data.video.packageId } })
      if (!pkg || !pkg.isActive) return jsonError('Selected package not found or inactive', 404)
      packageSnapshot = { id: pkg.id, name: pkg.name, videoCount: pkg.videoCount, revisionRounds: pkg.revisionRounds, template: pkg.deliverableTemplate }
    }
    const agreedCount = data.video?.agreedVideoCount ?? packageSnapshot?.videoCount ?? 0
    if (agreedCount < 1) return jsonError('Agreed video quantity is required (from package or manual confirmation)', 400)
  }

  const reference = makeReference(data.serviceType === 'VIDEO_PRODUCTION' ? 'VP' : 'WEB')

  const project = await db.$transaction(async (tx) => {
    const p = await tx.project.create({
      data: {
        reference, name: data.name, serviceType: data.serviceType, clientId: data.clientId,
        managerId: data.managerId, priority: data.priority, brief: data.brief, notes: data.notes,
        startDate: data.startDate ? new Date(data.startDate) : null,
        targetDate: data.targetDate ? new Date(data.targetDate) : null,
        agreedPrice: data.agreedPrice, budget: data.budget,
        status: 'DISCOVERY',
      },
    })
    if (data.serviceType === 'VIDEO_PRODUCTION' && data.video) {
      const vp = await tx.videoProject.create({
        data: {
          projectId: p.id,
          businessCategory: data.video.businessCategory,
          campaignObjective: data.video.campaignObjective,
          targetAudience: data.video.targetAudience,
          distributionPlatforms: data.video.distributionPlatforms,
          targetFormats: data.video.targetFormats,
          shootLocations: data.video.shootLocations,
          creativeDirection: data.video.creativeDirection,
          contractNotes: data.video.contractNotes,
          clientVisibleNotes: data.video.clientVisibleNotes,
          packageId: packageSnapshot?.id ?? null,
          packageNameSnapshot: packageSnapshot?.name ?? null,
          agreedVideoCount: data.video.agreedVideoCount ?? packageSnapshot?.videoCount ?? 1,
          revisionAllowance: data.video.revisionAllowance,
        },
      })
      // Create contracted deliverables (confirmed quantity only)
      if (data.video.createDeliverables !== false) {
        const count = data.video.agreedVideoCount ?? packageSnapshot?.videoCount ?? 1
        const template: Array<{ title?: string; category?: string; platform?: string; aspectRatio?: string; durationSec?: number }> =
          packageSnapshot?.template ? JSON.parse(packageSnapshot.template) : []
        for (let i = 0; i < count; i++) {
          const t = template[i] ?? {}
          await tx.videoDeliverable.create({
            data: {
              reference: makeReference('VD'),
              projectId: p.id,
              videoProjectId: vp.id,
              title: t.title ?? `Video ${i + 1}`,
              category: (t.category as 'FOOD_SOCIAL_REEL') ?? 'OTHER',
              targetPlatform: t.platform,
              aspectRatio: t.aspectRatio,
              targetDurationSec: t.durationSec,
              revisionAllowance: data.video.revisionAllowance,
            },
          })
        }
      }
    }
    return p
  })

  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'PROJECT_CREATED', 'Project', project.id, `Created ${data.serviceType} project ${project.name} (${project.reference}) for ${client.name}`)
  if (data.managerId && data.managerId !== user.userId) {
    await notify('EMPLOYEE', data.managerId, 'PROJECT_ASSIGNED', `You are the project manager for ${project.name}`, undefined, `/app/projects/${project.id}`)
  }
  return json({ project }, 201)
}
