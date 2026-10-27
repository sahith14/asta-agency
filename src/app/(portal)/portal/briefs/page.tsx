import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { BriefsPortalClient } from './briefs-portal-client'

export default async function PortalBriefsPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  return <BriefsPortalClient role={user.role} />
}
