import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireStaff, audit, json, jsonError } from '@/lib/auth'
import { can, isGlobalReader, parseBody } from '@/lib/rbac'

// GET /api/media — media asset registry (metadata only; binary storage intentionally not configured)
export async function GET(req: NextRequest) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  const url = new URL(req.url)
  const projectId = url.searchParams.get('projectId')
  const where = {
    ...(projectId ? { projectId } : {}),
    // delivery roles see only assets on projects they're assigned to
    ...(isGlobalReader(user.role) ? {} : {
      project: {
        OR: [
          { managerId: user.userId },
          { deliverables: { some: { OR: [{ editorId: user.userId }, { videographerId: user.userId }] } } },
          { tasks: { some: { assigneeId: user.userId } } },
        ],
      },
    }),
  }
  const assets = await db.mediaAsset.findMany({
    where,
    include: { project: { select: { id: true, name: true, reference: true } }, deliverable: { select: { id: true, title: true, reference: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return json({ assets, storageConfigured: false })
}

const createSchema = z.object({
  projectId: z.string().min(1),
  deliverableId: z.string().optional(),
  kind: z.enum(['ORIGINAL_FOOTAGE', 'PROXY', 'MUSIC', 'IMAGE', 'SCRIPT', 'PREVIEW_EXPORT', 'FINAL_EXPORT', 'CLIENT_REFERENCE']),
  title: z.string().min(1).max(160),
  fileName: z.string().max(255).optional(),
  mimeType: z.string().max(120).optional(),
  sizeBytes: z.number().int().min(0).optional(),
  externalUrl: z.string().url().max(1000).optional(),
  accessScope: z.enum(['INTERNAL', 'CLIENT']).default('INTERNAL'),
  notes: z.string().max(2000).optional(),
})

export async function POST(req: NextRequest) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  if (!['OWNER', 'CLIENT_MANAGER', 'VIDEOGRAPHER', 'VIDEO_EDITOR', 'CREATIVE_DIRECTOR'].includes(user.role)) {
    return jsonError('You do not have permission to register media assets', 403)
  }
  const { data, error: vErr } = await parseBody(req, createSchema)
  if (vErr) return vErr

  const project = await db.project.findUnique({ where: { id: data.projectId } })
  if (!project) return jsonError('Project not found', 404)
  if (data.deliverableId) {
    const d = await db.videoDeliverable.findUnique({ where: { id: data.deliverableId } })
    if (!d || d.projectId !== data.projectId) return jsonError('Deliverable does not belong to this project', 400)
  }

  // Honest storage state: we register metadata + external references only.
  // Binary upload requires a configured storage provider (not available in this environment).
  const asset = await db.mediaAsset.create({
    data: {
      projectId: data.projectId,
      deliverableId: data.deliverableId,
      kind: data.kind,
      title: data.title,
      fileName: data.fileName,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      externalUrl: data.externalUrl,
      accessScope: data.accessScope,
      status: data.externalUrl ? 'VERIFIED' : 'REGISTERED',
      uploadedById: user.userId,
      notes: data.notes,
    },
  })
  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'MEDIA_REGISTERED', 'MediaAsset', asset.id, `Registered ${data.kind} asset "${data.title}" (metadata only — storage not configured)`)
  return json({ asset }, 201)
}
