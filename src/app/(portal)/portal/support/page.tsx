import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { SupportClient } from './support-client'

export default async function PortalSupportPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  return <SupportClient role={user.role} />
}
