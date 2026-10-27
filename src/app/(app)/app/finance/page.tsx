import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ROLES } from '@/lib/constants'
import { FinanceClient } from './finance-client'

export default async function FinancePage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  // Finance is FOUNDER + SUPPORT_FINANCE only — server-side gate, others bounce.
  if (user.role !== ROLES.FOUNDER && user.role !== ROLES.SUPPORT_FINANCE) redirect('/app')

  const clients = await db.client.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })

  return <FinanceClient role={user.role} clients={clients} />
}
