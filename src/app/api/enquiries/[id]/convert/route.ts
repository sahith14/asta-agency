import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, audit, json, jsonError } from '@/lib/auth'

/**
 * Convert a public-site enquiry into a CRM Contact record (reuses the existing
 * Contact model — no duplicate customer system). Requires enquiries.manage.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireRole(req, ['OWNER', 'CLIENT_MANAGER', 'SUPPORT_FINANCE'])
  if (error) return error
  const { id } = await params

  const enquiry = await db.siteEnquiry.findUnique({ where: { id } })
  if (!enquiry) return jsonError('Enquiry not found', 404)
  if (enquiry.convertedContactId) return jsonError('This enquiry has already been converted to a contact', 409)

  const notesExcerpt = enquiry.message.length > 800 ? `${enquiry.message.slice(0, 800)}…` : enquiry.message
  const contact = await db.contact.create({
    data: {
      name: enquiry.companyName ? `${enquiry.name} (${enquiry.companyName})` : enquiry.name,
      email: enquiry.email,
      phone: enquiry.phone,
      company: enquiry.companyName,
      notes: `Converted from website enquiry ${enquiry.reference} — interested in: ${enquiry.service}.\n\n${notesExcerpt}`,
      createdById: user.userId,
    },
  })

  await db.siteEnquiry.update({
    where: { id },
    data: { status: 'CONVERTED', convertedContactId: contact.id, handledById: user.userId },
  })

  await audit(
    { userType: 'EMPLOYEE', userId: user.userId, name: user.name },
    'ENQUIRY_CONVERTED',
    'SiteEnquiry',
    id,
    `Converted enquiry ${enquiry.reference} to contact ${contact.id}`
  )
  return json({ contact }, 201)
}
