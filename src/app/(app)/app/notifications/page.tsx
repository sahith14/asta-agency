import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { ROLES } from '@/lib/constants'
import { NotificationsClient } from './notifications-client'

export default async function NotificationsPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  // Internal notifications surface — employees only (clients use their own portal bell).
  if (user.role === ROLES.CLIENT) redirect('/portal')

  return <NotificationsClient />
}
