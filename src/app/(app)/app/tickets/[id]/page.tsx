import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { TicketDetailClient } from './ticket-detail-client'

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  const { id } = await params

  return <TicketDetailClient ticketId={id} viewerId={user.id} role={user.role} />
}
