import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { DemosClient } from './demos-client'

export default async function PortalDemosPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  return <DemosClient role={user.role} />
}
