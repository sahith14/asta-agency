import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError } from '@/lib/rbac'
import { logAudit, auditFromRequest } from '@/lib/audit'
import { notifyUsers } from '@/lib/notify'
import { ROLES } from '@/lib/constants'

/** Shared brief validation + creation + submission helpers (Stage 2 client briefs). */

export const briefFieldSchema = {
  title: z.string().trim().min(1, 'Title is required').max(160),
  objectives: z.string().trim().min(1, 'Objectives are required').max(3000),
  audience: z.string().trim().min(1, 'Target audience is required').max(2000),
  scope: z.string().trim().min(1, 'Scope is required').max(3000),
  budget: z.string().trim().max(100).optional().nullable(),
  timeline: z.string().trim().max(200).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  projectId: z.string().max(64).optional().nullable(),
}

export const briefCreateSchema = z.object({ ...briefFieldSchema, clientId: z.string().min(1).max(64) })

export const briefDetailSelect = {
  id: true,
  title: true,
  objectives: true,
  audience: true,
  scope: true,
  budget: true,
  timeline: true,
  notes: true,
  status: true,
  reviewNotes: true,
  reviewedAt: true,
  submittedAt: true,
  createdAt: true,
  updatedAt: true,
  clientId: true,
  projectId: true,
  client: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  reviewedBy: { select: { id: true, name: true } },
} as const

/** Validate project/client consistency and create the brief (status DRAFT). */
export async function createBrief(
  req: NextRequest,
  actor: { id: string; role: string },
  clientId: string,
  body: Omit<z.infer<typeof briefCreateSchema>, 'clientId'>
) {
  if (body.projectId) {
    const project = await db.project.findUnique({ where: { id: body.projectId }, select: { id: true, clientId: true } })
    if (!project || project.clientId !== clientId) {
      throw new ApiError(400, 'Project does not belong to the selected client', 'INVALID_PROJECT')
    }
  }

  const brief = await db.brief.create({
    data: {
      clientId,
      projectId: body.projectId || null,
      createdById: actor.id,
      title: body.title,
      objectives: body.objectives,
      audience: body.audience,
      scope: body.scope,
      budget: body.budget || null,
      timeline: body.timeline || null,
      notes: body.notes || null,
    },
    select: {
      id: true,
      title: true,
      status: true,
      clientId: true,
      client: { select: { id: true, name: true } },
    },
  })

  await logAudit(
    auditFromRequest(req, {
      actorId: actor.id,
      actorRole: actor.role,
      action: 'BRIEF_CREATED',
      entityType: 'Brief',
      entityId: brief.id,
      result: 'SUCCESS',
      detail: JSON.stringify({ clientId }),
    })
  )

  return brief
}

/** Submit a DRAFT brief: stamps status/submittedAt, audits and notifies reviewers. */
export async function submitBrief(
  req: NextRequest,
  actor: { id: string; role: string; name: string },
  brief: { id: string; title: string }
) {
  await db.brief.update({
    where: { id: brief.id },
    data: { status: 'SUBMITTED', submittedAt: new Date() },
  })

  await logAudit(
    auditFromRequest(req, {
      actorId: actor.id,
      actorRole: actor.role,
      action: 'BRIEF_SUBMITTED',
      entityType: 'Brief',
      entityId: brief.id,
      result: 'SUCCESS',
    })
  )

  const reviewers = await db.user.findMany({
    where: { role: { in: [ROLES.FOUNDER, ROLES.CLIENT_MANAGER] }, isActive: true },
    select: { id: true },
  })
  await notifyUsers(
    reviewers.map((u) => u.id),
    {
      type: 'BRIEF_SUBMITTED',
      title: `New brief submitted: ${brief.title}`,
      body: `${actor.name} submitted a brief for review.`,
      link: '/app/briefs',
      dedupeKey: `brief-submitted:${brief.id}`,
    }
  )
}
