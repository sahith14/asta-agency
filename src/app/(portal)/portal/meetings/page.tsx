import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { MeetingsPortalClient } from './meetings-portal-client'

export default async function PortalMeetingsPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  return <MeetingsPortalClient role={user.role} />
}
