import { db } from '@/lib/db'
import { requirePageRole } from '../_lib'
import { ROLES } from '@/lib/constants'
import { SignupRequestsClient } from './signup-requests-client'

export default async function SignupRequestsPage() {
  // Founder-only surface (account provisioning stays founder-mediated).
  await requirePageRole([ROLES.FOUNDER])

  const requests = await db.signupRequest.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      name: true,
      email: true,
      company: true,
      message: true,
      status: true,
      reviewNotes: true,
      reviewedAt: true,
      createdAt: true,
      createdClientId: true,
      createdUserId: true,
      reviewedBy: { select: { name: true } },
    },
  })

  const clients = await db.client.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } })

  return (
    <SignupRequestsClient
      requests={requests.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        company: r.company,
        message: r.message,
        status: r.status,
        reviewNotes: r.reviewNotes,
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        createdClientId: r.createdClientId,
        createdUserId: r.createdUserId,
        reviewedByName: r.reviewedBy?.name ?? null,
      }))}
      clients={clients}
    />
  )
}
