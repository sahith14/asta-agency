import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole, withApi, ok, ApiError, getIp } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { notifyUsers, clientUserIds } from '@/lib/notify'
import { ROLES, MAINTENANCE_CHECKS, MAINTENANCE_CHECK_STATUSES } from '@/lib/constants'

type Ctx = { params: Promise<{ id: string }> }

const checkSchema = z.object({
  name: z.enum(MAINTENANCE_CHECKS),
  status: z.enum(MAINTENANCE_CHECK_STATUSES),
  evidence: z.string().trim(),
  notes: z.string().trim().max(1000).optional(),
})

const patchSchema = z.object({
  checks: z.array(checkSchema).max(MAINTENANCE_CHECKS.length).optional(),
  summary: z.string().trim().max(2000).optional().nullable(),
  status: z.literal('COMPLETED').optional(),
  visibleToClient: z.boolean().optional(),
})

const EVIDENCE_REQUIRED_MESSAGE =
  'Evidence is required for each check — reported results must reflect actual checks, never fabricated.'

/**
 * Update / complete a maintenance report. Completing stamps completedAt/by,
 * audits MAINTENANCE_REPORT_COMPLETED and (when visible to the client) notifies
 * the client's portal users exactly once (dedupeKey `maint-report:<id>`).
 */
export const PATCH = withApi<Ctx>(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireRole([ROLES.CLIENT_MANAGER, ROLES.WEB_DEVELOPER])
  const { id } = await ctx.params
  const body = patchSchema.parse(await req.json())

  const report = await db.maintenanceReport.findUnique({
    where: { id },
    include: { project: { select: { id: true, name: true, clientId: true, assignedToId: true } } },
  })
  if (!report) throw new ApiError(404, 'Report not found', 'NOT_FOUND')
  if (user.role === ROLES.WEB_DEVELOPER && report.project.assignedToId !== user.id) {
    throw new ApiError(403, 'You can only update reports for projects assigned to you', 'FORBIDDEN')
  }

  let checksJson: string | undefined
  if (body.checks) {
    if (body.checks.length === 0) throw new ApiError(400, EVIDENCE_REQUIRED_MESSAGE, 'EVIDENCE_REQUIRED')
    const seen = new Set<string>()
    for (const check of body.checks) {
      if (seen.has(check.name)) throw new ApiError(400, `Duplicate check: ${check.name}`, 'DUPLICATE_CHECK')
      seen.add(check.name)
      if (check.evidence.length < 5) throw new ApiError(400, EVIDENCE_REQUIRED_MESSAGE, 'EVIDENCE_REQUIRED')
    }
    checksJson = JSON.stringify(body.checks)
  }

  const becameCompleted = body.status === 'COMPLETED' && report.status !== 'COMPLETED'

  const updated = await db.maintenanceReport.update({
    where: { id: report.id },
    data: {
      ...(checksJson ? { checksJson } : {}),
      ...(body.summary !== undefined ? { summary: body.summary } : {}),
      ...(body.status ? { status: body.status } : {}),
      ...(body.visibleToClient !== undefined ? { visibleToClient: body.visibleToClient } : {}),
      ...(becameCompleted ? { completedAt: new Date(), completedById: user.id } : {}),
    },
    include: {
      project: { select: { id: true, name: true, clientId: true, client: { select: { id: true, name: true } } } },
      completedBy: { select: { id: true, name: true } },
    },
  })

  if (becameCompleted) {
    await logAudit({
      actorId: user.id,
      actorRole: user.role,
      action: 'MAINTENANCE_REPORT_COMPLETED',
      entityType: 'MaintenanceReport',
      entityId: report.id,
      result: 'SUCCESS',
      detail: JSON.stringify({
        projectId: report.projectId,
        periodLabel: report.periodLabel,
        visibleToClient: updated.visibleToClient,
      }),
      ip: getIp(req),
    })
  }

  if (updated.status === 'COMPLETED' && updated.visibleToClient) {
    // dedupeKey makes this exactly-once per report, even across repeated PATCHes.
    const clientIds = await clientUserIds(report.project.clientId)
    await notifyUsers(clientIds, {
      type: 'MAINTENANCE_REPORT',
      title: 'Your monthly website report is ready',
      body: `The ${report.periodLabel} maintenance report for ${report.project.name} has been completed.`,
      link: `/portal/projects/${report.projectId}`,
      dedupeKey: `maint-report:${report.id}`,
    })
  }

  return ok({ report: updated })
})
