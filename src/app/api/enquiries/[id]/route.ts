import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole, audit, json, jsonError } from '@/lib/auth'
import { parseBody } from '@/lib/rbac'

const patchSchema = z.object({
  status: z.enum(['NEW', 'IN_PROGRESS', 'CONVERTED', 'CLOSED']).optional(),
  notes: z.string().max(4000).optional(),
})

/** Staff update of a public-site enquiry (status / internal notes). Requires enquiries.manage. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireRole(req, ['OWNER', 'CLIENT_MANAGER', 'SUPPORT_FINANCE'])
  if (error) return error
  const { id } = await params

  const enquiry = await db.siteEnquiry.findUnique({ where: { id } })
  if (!enquiry) return jsonError('Enquiry not found', 404)

  const { data, error: vErr } = await parseBody(req, patchSchema)
  if (vErr) return vErr
  if (!data.status && data.notes === undefined) return jsonError('Nothing to update — provide status or notes', 400)

  const updated = await db.siteEnquiry.update({
    where: { id },
    data: {
      ...(data.status ? { status: data.status, handledById: user.userId } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
    },
  })

  await audit(
    { userType: 'EMPLOYEE', userId: user.userId, name: user.name },
    'ENQUIRY_UPDATED',
    'SiteEnquiry',
    id,
    `Updated enquiry ${enquiry.reference} (${data.status ? `status → ${data.status}` : 'notes'})`
  )
  return json({ enquiry: { id: updated.id, status: updated.status, notes: updated.notes } })
}
