import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, ApiError } from '@/lib/rbac'
import { withApi, portalUser, notFound } from '../../_portal'
import { briefFieldSchema, briefDetailSelect, submitBrief } from '../../../briefs/_briefs'
import { logAudit, auditFromRequest } from '@/lib/audit'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Portal brief detail + client-side actions (Stage 2):
 *  - GET: own-client brief or 404 (no existence leak across clients)
 *  - PATCH: only while DRAFT — edit fields and/or submit (DRAFT → SUBMITTED).
 *           Once submitted, the agency owns the review; clients read reviewNotes.
 */
const patchSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  objectives: z.string().trim().min(1).max(3000).optional(),
  audience: z.string().trim().min(1).max(2000).optional(),
  scope: z.string().trim().min(1).max(3000).optional(),
  budget: z.string().trim().max(100).optional().nullable(),
  timeline: z.string().trim().max(200).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  projectId: z.string().max(64).optional().nullable(),
  submit: z.boolean().optional(),
})

export const GET = withApi<Ctx>(async (_req: NextRequest, ctx: Ctx) => {
  const user = await portalUser()
  const { id } = await ctx.params

  const where = user.role === 'CLIENT' ? { id, clientId: user.clientId ?? '__none__' } : { id }
  const brief = await db.brief.findFirst({ where, select: briefDetailSelect })
  if (!brief) notFound()
  return ok({ brief })
})

export const PATCH = withApi<Ctx>(async (req: NextRequest, ctx: Ctx) => {
  const user = await portalUser()
  const { id } = await ctx.params
  const body = patchSchema.parse(await req.json())

  const where = user.role === 'CLIENT' ? { id, clientId: user.clientId ?? '__none__' } : { id }
  const existing = await db.brief.findFirst({ where, select: { id: true, title: true, status: true, clientId: true, projectId: true } })
  if (!existing) notFound()

  if (existing.status !== 'DRAFT') {
    throw new ApiError(400, 'Briefs that have been submitted can no longer be edited', 'BRIEF_LOCKED')
  }

  const fieldKeys = Object.keys(briefFieldSchema) as (keyof typeof briefFieldSchema)[]
  const data: Record<string, unknown> = {}
  for (const key of fieldKeys) {
    if (body[key] !== undefined) data[key] = body[key]
  }

  if (data.projectId) {
    const project = await db.project.findUnique({
      where: { id: String(data.projectId) },
      select: { id: true, clientId: true },
    })
    if (!project || project.clientId !== existing.clientId) {
      throw new ApiError(400, 'Project does not belong to your business', 'INVALID_PROJECT')
    }
  }

  let updated = existing
  if (Object.keys(data).length > 0) {
    updated = await db.brief.update({
      where: { id: existing.id },
      data,
      select: briefDetailSelect,
    })
    await logAudit(
      auditFromRequest(req, {
        actorId: user.id,
        actorRole: user.role,
        action: 'BRIEF_UPDATED',
        entityType: 'Brief',
        entityId: existing.id,
        result: 'SUCCESS',
        detail: JSON.stringify({ fields: Object.keys(data) }),
      })
    )
  }

  if (body.submit) {
    await submitBrief(req, { id: user.id, role: user.role, name: user.name }, { id: existing.id, title: updated.title })
    updated = { ...updated, status: 'SUBMITTED' }
  }

  return ok({ brief: updated })
})
