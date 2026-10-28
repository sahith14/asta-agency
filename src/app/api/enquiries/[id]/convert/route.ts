import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, audit, json, jsonError } from '@/lib/auth'

/**
 * Convert a public-site enquiry into a CRM Contact record (reuses the existing
 * Contact model — no duplicate customer system). Requires enquiries.manage.
 *
 * Duplicate-safe:
 *  - Converting the same enquiry twice is rejected (409).
 *  - If a matching contact already exists (same email — case-insensitive — or
 *    same normalised phone), the enquiry is LINKED to it instead of creating a
 *    duplicate record. The response reports `matched: true` in that case.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireRole(req, ['OWNER', 'CLIENT_MANAGER', 'SUPPORT_FINANCE'])
  if (error) return error
  const { id } = await params

  const enquiry = await db.siteEnquiry.findUnique({ where: { id } })
  if (!enquiry) return jsonError('Enquiry not found', 404)
  if (enquiry.convertedContactId) return jsonError('This enquiry has already been converted to a contact', 409)

  const phoneDigits = (s: string) => s.replace(/\D/g, '')
  const enquiryPhone = enquiry.phone ? phoneDigits(enquiry.phone) : ''
  const enquiryEmail = enquiry.email?.trim().toLowerCase() ?? ''

  // Find an existing contact matching this enquirer (email match takes priority,
  // then normalised phone). Compare in JS so SQLite case-insensitivity quirks
  // and formatting differences cannot create silent duplicates.
  const candidates = await db.contact.findMany({
    where: {
      OR: [
        ...(enquiryEmail ? [{ email: { not: null } }] : []),
        ...(enquiryPhone.length >= 7 ? [{ phone: { not: null } }] : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
  })
  const existing = candidates.find(c => {
    if (enquiryEmail && c.email && c.email.trim().toLowerCase() === enquiryEmail) return true
    if (enquiryPhone.length >= 7 && c.phone && phoneDigits(c.phone).endsWith(enquiryPhone.slice(-9))) return true
    return false
  })

  const notesExcerpt = enquiry.message.length > 800 ? `${enquiry.message.slice(0, 800)}…` : enquiry.message
  const enquiryNote = `Website enquiry ${enquiry.reference} (${new Date(enquiry.createdAt).toISOString().slice(0, 10)}) — interested in: ${enquiry.service}.\n${notesExcerpt}`

  let contact
  let matched = false
  if (existing) {
    matched = true
    // Link the enquiry to the existing contact and append the enquiry summary
    const result = await db.$transaction([
      db.contact.update({
        where: { id: existing.id },
        data: { notes: `${existing.notes ? `${existing.notes}\n\n—\n` : ''}${enquiryNote}` },
      }),
      db.siteEnquiry.update({
        where: { id },
        data: {
          status: 'CONVERTED',
          convertedContactId: existing.id,
          handledById: enquiry.handledById ?? user.userId,
        },
      }),
    ])
    contact = result[0]
  } else {
    contact = await db.$transaction(async tx => {
      const created = await tx.contact.create({
        data: {
          name: enquiry.companyName ? `${enquiry.name} (${enquiry.companyName})` : enquiry.name,
          email: enquiry.email,
          phone: enquiry.phone,
          company: enquiry.companyName,
          notes: `Converted from website enquiry ${enquiry.reference} — interested in: ${enquiry.service}.\n\n${notesExcerpt}`,
          createdById: user.userId,
        },
      })
      await tx.siteEnquiry.update({
        where: { id },
        // Preserve an existing explicit owner assignment; claim only if unassigned.
        data: {
          status: 'CONVERTED',
          convertedContactId: created.id,
          handledById: enquiry.handledById ?? user.userId,
        },
      })
      return created
    })
  }

  await audit(
    { userType: 'EMPLOYEE', userId: user.userId, name: user.name },
    'ENQUIRY_CONVERTED',
    'SiteEnquiry',
    id,
    matched
      ? `Converted enquiry ${enquiry.reference} — linked to EXISTING contact ${contact.id}`
      : `Converted enquiry ${enquiry.reference} to contact ${contact.id}`
  )
  return json({ contact, matched }, matched ? 200 : 201)
}
