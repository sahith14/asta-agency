import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { OverviewClient } from './overview-client'

export default async function PortalOverviewPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  return <OverviewClient userName={user.name} role={user.role} />
}
