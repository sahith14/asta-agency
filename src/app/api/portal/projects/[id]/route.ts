import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { assertOwnershipOrNotFound, ok } from '@/lib/rbac'
import { withApi, notFound, parseJsonArray, portalUser, scopedClientId } from '../../_portal'

/**
 * GET /api/portal/projects/[id]
 * Single project scoped to the caller's client (404 otherwise — no existence
 * leaks). Returns clientVisible milestones/deliverables and completed,
 * client-visible maintenance reports only. Never tasks or internal records.
 */
export const GET = withApi<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params
  const user = await portalUser()
  const clientId = await scopedClientId(req, user)

  const project = await db.project.findFirst({
    where: { id, clientId },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      packageType: true,
      startDate: true,
      targetLaunchDate: true,
      deployApprovedAt: true,
      milestones: {
        where: { clientVisible: true },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, title: true, status: true, dueDate: true, completedAt: true },
      },
      deliverables: {
        where: { clientVisible: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true, title: true, status: true },
      },
      maintenanceReports: {
        where: { status: 'COMPLETED', visibleToClient: true },
        orderBy: { completedAt: 'desc' },
        select: { id: true, periodLabel: true, summary: true, checksJson: true, completedAt: true },
      },
    },
  })

  assertOwnershipOrNotFound(Boolean(project))
  if (!project) notFound() // unreachable; satisfies TS narrowing with the same 404

  return ok({
    project: {
      ...project,
      maintenanceReports: project.maintenanceReports.map((r) => ({
        id: r.id,
        periodLabel: r.periodLabel,
        summary: r.summary,
        completedAt: r.completedAt,
        checks: parseJsonArray(r.checksJson),
      })),
    },
  })
})
