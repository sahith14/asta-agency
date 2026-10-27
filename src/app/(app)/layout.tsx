import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { ROLES } from '@/lib/constants'
import { getSettings } from '@/lib/settings'
import { AppShell } from '@/components/app-shell'

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  if (user.role === ROLES.CLIENT) redirect('/portal') // client accounts never see the internal dashboard
  if (user.mustChangePassword) redirect('/change-password')
  const settings = await getSettings()
  return (
    <AppShell user={user} agencyName={settings.AGENCY_NAME}>
      {children}
    </AppShell>
  )
}
