import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withApi, ok, ApiError, requireRole, assertOwnershipOrNotFound } from '@/lib/rbac'
import { logAudit, auditFromRequest } from '@/lib/audit'
import { ROLES } from '@/lib/constants'

// GET /api/demos — demo queue. FOUNDER/CLIENT_MANAGER see all demos;
// WEB_DEVELOPER only demos of projects assigned to them. Includes project and
// client names. urlToken is never returned (portal-only concern).
export const GET = withApi(async () => {
  const user = await requireRole([ROLES.CLIENT_MANAGER, ROLES.WEB_DEVELOPER])

  const demos = await db.demo.findMany({
    where: user.role === ROLES.WEB_DEVELOPER ? { project: { assignedToId: user.id } } : undefined,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      demoUrl: true,
      status: true,
      preparedById: true,
      authorizedById: true,
      authorizedAt: true,
      clientApprovedAt: true,
      createdAt: true,
      updatedAt: true,
      project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
    },
  })

  return ok({
    demos: demos.map((d) => ({
      id: d.id,
      title: d.title,
      demoUrl: d.demoUrl,
      status: d.status,
      authorizedAt: d.authorizedAt,
      clientApprovedAt: d.clientApprovedAt,
      createdAt: d.createdAt,
      projectId: d.project.id,
      projectName: d.project.name,
      clientName: d.project.client.name,
    })),
  })
})

const createSchema = z.object({
  projectId: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  demoUrl: z.string().min(1).max(500),
})

// POST /api/demos — create a demo (FOUNDER/CLIENT_MANAGER or the assigned
// WEB_DEVELOPER). demoUrl is an EXTERNAL hosted preview URL entered by staff.
// New demos start in PREPARING.
export const POST = withApi(async (req: NextRequest) => {
  const user = await requireRole([ROLES.CLIENT_MANAGER, ROLES.WEB_DEVELOPER])
  const body = createSchema.parse(await req.json())

  const project = await db.project.findUnique({
    where: { id: body.projectId },
    select: { id: true, name: true, clientId: true, assignedToId: true },
  })
  assertOwnershipOrNotFound(!!project)
  if (!project) throw new ApiError(404, 'Not found', 'NOT_FOUND')

  if (user.role === ROLES.WEB_DEVELOPER && project.assignedToId !== user.id) {
    assertOwnershipOrNotFound(false)
  }

  const demo = await db.demo.create({
    data: {
      projectId: project.id,
      title: body.title.trim(),
      demoUrl: body.demoUrl.trim(),
      status: 'PREPARING',
      preparedById: user.id,
    },
  })

  await logAudit(
    auditFromRequest(req, {
      actorId: user.id,
      actorRole: user.role,
      action: 'DEMO_CREATED',
      entityType: 'Demo',
      entityId: demo.id,
      result: 'SUCCESS',
      detail: JSON.stringify({ projectId: project.id, title: demo.title, status: demo.status }),
    })
  )

  return ok({ demo }, 201)
})
