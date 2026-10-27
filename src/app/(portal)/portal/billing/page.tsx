import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { BillingClient } from './billing-client'

export default async function PortalBillingPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  return <BillingClient role={user.role} />
}
