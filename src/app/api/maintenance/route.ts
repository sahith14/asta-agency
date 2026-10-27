import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole, withApi, ok, ApiError, getIp } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { ROLES, MAINTENANCE_CHECKS, MAINTENANCE_CHECK_STATUSES } from '@/lib/constants'

/**
 * Monthly maintenance SOP reports — evidence-based.
 * FOUNDER / CLIENT_MANAGER can work on any project; WEB_DEVELOPER only on
 * projects assigned to them. Every PASS/FAIL/SKIPPED requires written evidence.
 */

const checkSchema = z.object({
  name: z.enum(MAINTENANCE_CHECKS),
  status: z.enum(MAINTENANCE_CHECK_STATUSES),
  evidence: z.string().trim(),
  notes: z.string().trim().max(1000).optional(),
})

const listQuerySchema = z.object({
  projectId: z.string().optional(),
  status: z.string().optional(),
})

export const GET = withApi(async (req: NextRequest) => {
  const user = await requireRole([ROLES.CLIENT_MANAGER, ROLES.WEB_DEVELOPER])
  const url = new URL(req.url)
  const q = listQuerySchema.parse(Object.fromEntries(url.searchParams.entries()))

  const where: Record<string, unknown> = {}
  if (q.projectId) where.projectId = q.projectId
  if (q.status && ['DRAFT', 'COMPLETED'].includes(q.status)) where.status = q.status
  if (user.role === ROLES.WEB_DEVELOPER) {
    where.project = { assignedToId: user.id }
  }

  const reports = await db.maintenanceReport.findMany({
    where,
    include: {
      project: { select: { id: true, name: true, clientId: true, client: { select: { id: true, name: true } } } },
      completedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return ok({ reports })
})

const EVIDENCE_REQUIRED_MESSAGE =
  'Evidence is required for each check — reported results must reflect actual checks, never fabricated.'

function validateChecks(checks: z.infer<typeof checkSchema>[]): string {
  if (checks.length === 0) throw new ApiError(400, EVIDENCE_REQUIRED_MESSAGE, 'EVIDENCE_REQUIRED')
  const seen = new Set<string>()
  for (const check of checks) {
    if (seen.has(check.name)) throw new ApiError(400, `Duplicate check: ${check.name}`, 'DUPLICATE_CHECK')
    seen.add(check.name)
    // PASS/FAIL require evidence of the actual check; SKIPPED requires the reason.
    if (check.evidence.length < 5) throw new ApiError(400, EVIDENCE_REQUIRED_MESSAGE, 'EVIDENCE_REQUIRED')
  }
  return JSON.stringify(checks)
}

const createSchema = z.object({
  projectId: z.string().min(1),
  periodLabel: z.string().min(3).max(80),
  checks: z.array(checkSchema).max(MAINTENANCE_CHECKS.length),
  summary: z.string().trim().max(2000).optional(),
})

export const POST = withApi(async (req: NextRequest) => {
  const user = await requireRole([ROLES.CLIENT_MANAGER, ROLES.WEB_DEVELOPER])
  const body = createSchema.parse(await req.json())

  const project = await db.project.findUnique({ where: { id: body.projectId } })
  if (!project) throw new ApiError(404, 'Project not found', 'NOT_FOUND')
  if (user.role === ROLES.WEB_DEVELOPER && project.assignedToId !== user.id) {
    throw new ApiError(403, 'You can only file maintenance reports for projects assigned to you', 'FORBIDDEN')
  }

  const checksJson = validateChecks(body.checks)

  const report = await db.maintenanceReport.create({
    data: {
      projectId: project.id,
      periodLabel: body.periodLabel,
      checksJson,
      summary: body.summary ?? null,
      status: 'DRAFT',
      visibleToClient: true,
    },
    include: {
      project: { select: { id: true, name: true, clientId: true, client: { select: { id: true, name: true } } } },
    },
  })

  await logAudit({
    actorId: user.id,
    actorRole: user.role,
    action: 'MAINTENANCE_REPORT_CREATED',
    entityType: 'MaintenanceReport',
    entityId: report.id,
    result: 'SUCCESS',
    detail: JSON.stringify({ projectId: project.id, periodLabel: body.periodLabel, checks: body.checks.length }),
    ip: getIp(req),
  })

  return ok({ report })
})
