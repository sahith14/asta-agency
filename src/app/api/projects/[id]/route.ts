import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireStaff, audit, notify, json, jsonError } from '@/lib/auth'
import { can, isGlobalReader, parseBody } from '@/lib/rbac'

async function loadProjectForUser(id: string, user: { userId: string; role: string }) {
  const project = await db.project.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true, businessCategory: true, contactName: true, contactEmail: true } },
      manager: { select: { id: true, name: true } },
      videoProject: { include: { package: { select: { id: true, name: true, videoCount: true, revisionRounds: true } }, scopeChanges: { orderBy: { createdAt: 'desc' } } } },
      deliverables: { orderBy: { createdAt: 'asc' }, include: { videographer: { select: { id: true, name: true } }, editor: { select: { id: true, name: true } } } },
      shoots: { orderBy: { date: 'asc' } },
      tasks: { include: { assignee: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } },
      expenses: { orderBy: { incurredAt: 'desc' } },
      invoices: { orderBy: { createdAt: 'desc' } },
      mediaAssets: { orderBy: { createdAt: 'desc' } },
    },
  })
  if (!project) return { project: null, forbidden: false }
  if (isGlobalReader(user.role)) return { project, forbidden: false }
  // Assigned-only scope
  const shootAssigned = await db.shootAssignment.findFirst({ where: { employeeId: user.userId, session: { projectId: id } } })
  const assigned =
    project.managerId === user.userId ||
    project.deliverables.some(d => d.editorId === user.userId || d.videographerId === user.userId) ||
    project.tasks.some(t => t.assigneeId === user.userId) ||
    !!shootAssigned
  if (assigned) return { project, forbidden: false }
  return { project: null, forbidden: true }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  const { id } = await ctx.params
  const { project, forbidden } = await loadProjectForUser(id, user)
  if (forbidden) return jsonError('You do not have access to this project', 403)
  if (!project) return jsonError('Project not found', 404)
  return json({ project })
}

const updateSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  status: z.enum(['DISCOVERY', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'ON_HOLD', 'CANCELLED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  managerId: z.string().nullable().optional(),
  brief: z.string().max(8000).optional(),
  notes: z.string().max(4000).optional(),
  startDate: z.string().datetime().nullable().optional(),
  targetDate: z.string().datetime().nullable().optional(),
  agreedPrice: z.number().min(0).max(10_000_000).nullable().optional(),
  budget: z.number().min(0).max(10_000_000).nullable().optional(),
  isArchived: z.boolean().optional(),
  video: z.object({
    businessCategory: z.string().max(80).optional(),
    campaignObjective: z.string().max(2000).optional(),
    targetAudience: z.string().max(2000).optional(),
    distributionPlatforms: z.string().max(500).optional(),
    targetFormats: z.string().max(500).optional(),
    shootLocations: z.string().max(1000).optional(),
    creativeDirection: z.string().max(4000).optional(),
    contractNotes: z.string().max(4000).optional(),
    clientVisibleNotes: z.string().max(4000).optional(),
    revisionAllowance: z.number().int().min(0).max(20).optional(),
  }).optional(),
})

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  if (!can(user, 'projects.manage')) return jsonError('You do not have permission to update projects', 403)
  const { id } = await ctx.params
  const { data, error: vErr } = await parseBody(req, updateSchema)
  if (vErr) return vErr

  const existing = await db.project.findUnique({ where: { id }, include: { videoProject: true } })
  if (!existing) return jsonError('Project not found', 404)

  if (data.managerId) {
    const manager = await db.employee.findUnique({ where: { id: data.managerId } })
    if (!manager || !manager.isActive) return jsonError('Selected project manager not found', 404)
  }

  const { video, ...projectData } = data
  const project = await db.project.update({ where: { id }, data: {
    ...projectData,
    startDate: projectData.startDate === undefined ? undefined : projectData.startDate ? new Date(projectData.startDate) : null,
    targetDate: projectData.targetDate === undefined ? undefined : projectData.targetDate ? new Date(projectData.targetDate) : null,
  } })

  if (video && existing.videoProject) {
    await db.videoProject.update({ where: { id: existing.videoProject.id }, data: video })
  }

  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'PROJECT_UPDATED', 'Project', id, `Updated project ${project.name}`)
  if (data.managerId && data.managerId !== user.userId) {
    await notify('EMPLOYEE', data.managerId, 'PROJECT_ASSIGNED', `You are now the project manager for ${project.name}`, undefined, `/app/projects/${project.id}`)
  }
  return json({ project })
}
