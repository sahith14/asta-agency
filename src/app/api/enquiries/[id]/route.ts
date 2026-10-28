import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole, audit, json, jsonError } from '@/lib/auth'
import { parseBody } from '@/lib/rbac'

const patchSchema = z.object({
  status: z.enum(['NEW', 'IN_PROGRESS', 'FOLLOW_UP', 'QUALIFIED', 'CONVERTED', 'CLOSED']).optional(),
  notes: z.string().max(4000).optional(),
  // Explicit owner assignment ('' clears the assignment)
  assignedTo: z.string().max(40).optional(),
  // Record a contact attempt now (sets lastContactedAt)
  recordContact: z.boolean().optional(),
  // Next follow-up date (ISO date string; null clears it)
  nextFollowUpAt: z.string().nullable().optional(),
})

/** Staff update of a public-site enquiry (status / notes / owner / follow-up). Requires enquiries.manage. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireRole(req, ['OWNER', 'CLIENT_MANAGER', 'SUPPORT_FINANCE'])
  if (error) return error
  const { id } = await params

  const enquiry = await db.siteEnquiry.findUnique({ where: { id } })
  if (!enquiry) return jsonError('Enquiry not found', 404)

  const { data, error: vErr } = await parseBody(req, patchSchema)
  if (vErr) return vErr
  if (
    !data.status &&
    data.notes === undefined &&
    data.assignedTo === undefined &&
    !data.recordContact &&
    data.nextFollowUpAt === undefined
  ) {
    return jsonError('Nothing to update — provide status, notes, assignment or follow-up fields', 400)
  }

  // Validate assignment target is an active employee
  let assignee: string | null | undefined
  if (data.assignedTo !== undefined) {
    const trimmed = data.assignedTo.trim()
    if (trimmed === '') {
      assignee = null
    } else {
      const employee = await db.employee.findFirst({ where: { id: trimmed, isActive: true }, select: { id: true } })
      if (!employee) return jsonError('Assigned employee not found or inactive', 400)
      assignee = employee.id
    }
  }

  let nextFollowUp: Date | null | undefined
  if (data.nextFollowUpAt !== undefined) {
    if (data.nextFollowUpAt === null || data.nextFollowUpAt === '') {
      nextFollowUp = null
    } else {
      const d = new Date(data.nextFollowUpAt)
      if (Number.isNaN(d.getTime())) return jsonError('Invalid follow-up date', 400)
      nextFollowUp = d
    }
  }

  const updated = await db.siteEnquiry.update({
    where: { id },
    data: {
      // Status change claims ownership only when the enquiry is unassigned —
      // an existing explicit assignment must never be silently overwritten.
      ...(data.status
        ? {
            status: data.status,
            handledById: assignee !== undefined
              ? assignee
              : enquiry.handledById ?? user.userId,
          }
        : {}),
      ...(assignee !== undefined && !data.status ? { handledById: assignee } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      ...(data.recordContact ? { lastContactedAt: new Date() } : {}),
      ...(nextFollowUp !== undefined ? { nextFollowUpAt: nextFollowUp } : {}),
    },
  })

  await audit(
    { userType: 'EMPLOYEE', userId: user.userId, name: user.name },
    'ENQUIRY_UPDATED',
    'SiteEnquiry',
    id,
    `Updated enquiry ${enquiry.reference} (${data.status ? `status → ${data.status}` : data.assignedTo !== undefined ? 'owner' : data.recordContact ? 'contact attempt' : data.nextFollowUpAt !== undefined ? 'follow-up date' : 'notes'})`
  )
  return json({
    enquiry: {
      id: updated.id,
      status: updated.status,
      notes: updated.notes,
      handledById: updated.handledById,
      lastContactedAt: updated.lastContactedAt,
      nextFollowUpAt: updated.nextFollowUpAt,
    },
  })
}
