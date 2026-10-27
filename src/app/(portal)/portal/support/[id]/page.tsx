import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { TicketDetailClient } from './ticket-detail-client'

export default async function PortalTicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getSessionUser()
  if (!user) redirect('/login')
  return <TicketDetailClient ticketId={id} role={user.role} userId={user.id} />
}
