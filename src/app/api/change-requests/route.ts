import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withApi, ok, ApiError, requireUser, requireRole, isFounder, assertOwnershipOrNotFound } from '@/lib/rbac'
import { logAudit, auditFromRequest } from '@/lib/audit'
import { notifyUsers, roleUserIds } from '@/lib/notify'
import { ROLES } from '@/lib/constants'

// GET /api/change-requests — all change requests with details
// (FOUNDER/CLIENT_MANAGER/WEB_DEVELOPER). Includes project name, client name,
// raised-by name and any linked tasks.
export const GET = withApi(async () => {
  await requireRole([ROLES.CLIENT_MANAGER, ROLES.WEB_DEVELOPER])

  const changeRequests = await db.changeRequest.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      details: true,
      status: true,
      scopeImpact: true,
      founderNotes: true,
      decisionAt: true,
      demoId: true,
      createdAt: true,
      updatedAt: true,
      projectId: true,
      project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
      raisedBy: { select: { id: true, name: true, email: true } },
      tasks: { select: { id: true, title: true, status: true } },
    },
  })

  return ok({
    changeRequests: changeRequests.map((cr) => ({
      id: cr.id,
      title: cr.title,
      details: cr.details,
      status: cr.status,
      scopeImpact: cr.scopeImpact,
      founderNotes: cr.founderNotes,
      decisionAt: cr.decisionAt,
      demoId: cr.demoId,
      createdAt: cr.createdAt,
      projectId: cr.project.id,
      projectName: cr.project.name,
      clientId: cr.project.client.id,
      clientName: cr.project.client.name,
      raisedById: cr.raisedBy.id,
      raisedByName: cr.raisedBy.name,
      linkedTasks: cr.tasks,
    })),
  })
})

const createSchema = z.object({
  projectId: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  details: z.string().min(1).max(5000),
  demoId: z.string().max(64).optional().nullable(),
})

// POST /api/change-requests — create a change request.
// - CLIENT users (portal): forced to their own client's project (foreign
//   projectId → 404), raisedById = self.
// - FOUNDER/CLIENT_MANAGER: may create on behalf of a client by specifying
//   the project explicitly. WEB_DEVELOPER: denied (403).
// Status starts at SUBMITTED; founder users are notified (dedupeKey
// `cr-submitted:<id>`); the mutation is audited as CHANGE_REQUEST_SUBMITTED.
export const POST = withApi(async (req: NextRequest) => {
  const user = await requireUser()

  const isStaff = isFounder(user) || user.role === ROLES.CLIENT_MANAGER
  if (user.role !== ROLES.CLIENT && !isStaff) {
    throw new ApiError(403, 'You do not have permission to perform this action', 'FORBIDDEN')
  }

  const body = createSchema.parse(await req.json())

  const project = await db.project.findUnique({
    where: { id: body.projectId },
    select: { id: true, name: true, clientId: true, client: { select: { id: true, name: true } } },
  })
  assertOwnershipOrNotFound(!!project)
  if (!project) throw new ApiError(404, 'Not found', 'NOT_FOUND')

  if (user.role === ROLES.CLIENT) {
    // Clients can only raise requests against their own client business.
    assertOwnershipOrNotFound(!!user.clientId && project.clientId === user.clientId)
  }

  const cr = await db.changeRequest.create({
    data: {
      projectId: project.id,
      demoId: body.demoId ?? null,
      raisedById: user.id,
      title: body.title.trim(),
      details: body.details.trim(),
      status: 'SUBMITTED',
    },
  })

  await logAudit(
    auditFromRequest(req, {
      actorId: user.id,
      actorRole: user.role,
      action: 'CHANGE_REQUEST_SUBMITTED',
      entityType: 'ChangeRequest',
      entityId: cr.id,
      result: 'SUCCESS',
      detail: JSON.stringify({ projectId: project.id, title: cr.title, raisedByRole: user.role }),
    })
  )

  await notifyUsers(await roleUserIds([ROLES.FOUNDER]), {
    type: 'CHANGE_REQUEST',
    title: `New change request — ${project.client.name}`,
    body: `${user.name} submitted: “${cr.title}”.`,
    link: '/app/change-requests',
    dedupeKey: `cr-submitted:${cr.id}`,
  })

  return ok({ changeRequest: cr }, 201)
})
