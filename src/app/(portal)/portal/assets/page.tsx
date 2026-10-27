import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { AssetsClient } from './assets-client'

export default async function PortalAssetsPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  return <AssetsClient role={user.role} />
}
