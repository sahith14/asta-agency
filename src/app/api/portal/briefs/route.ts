import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok } from '@/lib/rbac'
import { withApi, portalUser, scopedClientId } from '../_portal'
import { briefFieldSchema, createBrief, submitBrief } from '../../briefs/_briefs'

/**
 * Client portal briefs (Stage 2):
 *  - GET:  the caller's own client briefs (scope forced; founder must pass ?clientId=)
 *  - POST: create a brief for the caller's own client (DRAFT, or SUBMITTED when ?submit)
 */
export const GET = withApi(async (req: NextRequest) => {
  const user = await portalUser()
  const clientId = await scopedClientId(req, user)

  const briefs = await db.brief.findMany({
    where: { clientId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      status: true,
      budget: true,
      timeline: true,
      reviewNotes: true,
      submittedAt: true,
      createdAt: true,
      updatedAt: true,
      projectId: true,
      project: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  })
  return ok({ briefs })
})

const portalCreateSchema = z.object({ ...briefFieldSchema, submit: z.boolean().optional() })

export const POST = withApi(async (req: NextRequest) => {
  const user = await portalUser()
  const clientId = await scopedClientId(req, user)
  const body = portalCreateSchema.parse(await req.json())

  const brief = await createBrief(req, { id: user.id, role: user.role }, clientId, body)

  if (body.submit) {
    await submitBrief(req, { id: user.id, role: user.role, name: user.name }, { id: brief.id, title: brief.title })
  }

  return ok({ brief: { ...brief, status: body.submit ? 'SUBMITTED' : brief.status } }, 201)
})
