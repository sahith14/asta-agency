import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { ROLES } from '@/lib/constants'
import { TeamClient } from './team-client'

export default async function TeamPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  // Team management is FOUNDER-only — server-side gate.
  if (user.role !== ROLES.FOUNDER) redirect('/app')

  return <TeamClient viewerId={user.id} />
}
