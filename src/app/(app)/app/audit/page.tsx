import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { ROLES } from '@/lib/constants'
import { AuditClient } from './audit-client'

export default async function AuditPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  // Audit log is FOUNDER-only — server-side gate.
  if (user.role !== ROLES.FOUNDER) redirect('/app')

  return <AuditClient />
}
