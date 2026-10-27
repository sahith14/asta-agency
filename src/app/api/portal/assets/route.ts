import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, assertOwnershipOrNotFound, getIp, isFounder, ok, requireClientScope } from '@/lib/rbac'
import { rateLimit, maybeCleanup } from '@/lib/ratelimit'
import { saveUpload } from '@/lib/storage'
import { logAudit } from '@/lib/audit'
import { notifyUsers, roleUserIds } from '@/lib/notify'
import { ROLES } from '@/lib/constants'
import { withApi, notFound, portalUser, scopedClientId } from '../_portal'

/**
 * GET /api/portal/assets — the caller's client project assets where
 * visibility = CLIENT (internal assets are never returned).
 */
export const GET = withApi(async (req: NextRequest) => {
  const user = await portalUser()
  const clientId = await scopedClientId(req, user)

  const assets = await db.asset.findMany({
    where: { project: { clientId }, visibility: 'CLIENT' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      originalName: true,
      sizeBytes: true,
      mimeType: true,
      createdAt: true,
      uploadedByRole: true,
      project: { select: { id: true, name: true } },
      uploadedBy: { select: { name: true } },
    },
  })

  return ok({
    assets: assets.map((a) => ({
      id: a.id,
      originalName: a.originalName,
      sizeBytes: a.sizeBytes,
      mimeType: a.mimeType,
      createdAt: a.createdAt,
      projectId: a.project.id,
      projectName: a.project.name,
      uploadedByName: a.uploadedBy.name,
    })),
  })
})

const uploadSchema = z.object({
  projectId: z.string().min(1, 'Choose a project'),
  file: z.instanceof(File, { message: 'Choose a file to upload' }),
})

/**
 * POST /api/portal/assets (multipart/form-data: file, projectId)
 * Client upload into one of THEIR OWN projects. saveUpload() enforces the
 * 10MB cap, mime allowlist and no-SVG rule. Rate limited per user.
 */
export const POST = withApi(async (req: NextRequest) => {
  maybeCleanup()
  const user = await portalUser()

  const rl = rateLimit(`portal-upload:${user.id}`, 20, 60_000)
  if (!rl.allowed) {
    throw new ApiError(429, `Too many uploads — please wait ${rl.retryAfterSec}s and try again.`, 'RATE_LIMITED')
  }

  const form = await req.formData()
  const input = uploadSchema.parse({
    projectId: typeof form.get('projectId') === 'string' ? (form.get('projectId') as string) : '',
    file: form.get('file') instanceof File ? (form.get('file') as File) : undefined,
  })

  // Ownership: the target project must belong to the caller's client business.
  const where =
    user.role === ROLES.CLIENT
      ? { id: input.projectId, clientId: await requireClientScope(user) }
      : isFounder(user)
        ? { id: input.projectId }
        : { id: '__never__' }
  const project = await db.project.findFirst({
    where,
    select: { id: true, client: { select: { name: true } } },
  })
  assertOwnershipOrNotFound(Boolean(project))
  if (!project) notFound() // unreachable; satisfies TS narrowing with the same 404

  // saveUpload validates size/type and stores OUTSIDE public/ with a random name.
  const saved = await saveUpload(input.file, { projectId: project.id })

  const asset = await db.asset.create({
    data: {
      projectId: project.id,
      uploadedById: user.id,
      uploadedByRole: user.role,
      originalName: saved.originalName,
      storedName: saved.storedName,
      mimeType: saved.mimeType,
      sizeBytes: saved.sizeBytes,
      visibility: 'CLIENT',
    },
  })

  await logAudit({
    actorId: user.id,
    actorRole: user.role,
    action: 'ASSET_UPLOADED',
    entityType: 'Asset',
    entityId: asset.id,
    result: 'SUCCESS',
    detail: JSON.stringify({ originalName: saved.originalName, sizeBytes: saved.sizeBytes, projectId: project.id }),
    ip: getIp(req),
  })

  await notifyUsers(await roleUserIds([ROLES.CLIENT_MANAGER, ROLES.FOUNDER]), {
    type: 'ASSET_UPLOADED',
    title: 'Client uploaded a file',
    body: `${project.client.name} uploaded "${saved.originalName}"`,
    link: '/app/assets',
    dedupeKey: `asset-uploaded:${asset.id}`,
  })

  return ok(
    {
      asset: {
        id: asset.id,
        originalName: asset.originalName,
        sizeBytes: asset.sizeBytes,
        mimeType: asset.mimeType,
        createdAt: asset.createdAt,
      },
    },
    201,
  )
})
