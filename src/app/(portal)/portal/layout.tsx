import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { ROLES } from '@/lib/constants'
import { getSettings } from '@/lib/settings'
import { PortalShell } from '@/components/portal-shell'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  if (user.role === ROLES.CLIENT && user.mustChangePassword) redirect('/change-password')
  // CLIENT role is the intended audience. FOUNDER retains unrestricted access
  // (audited, banner shown). Other employees are redirected to the internal app.
  if (user.role !== ROLES.CLIENT && user.role !== ROLES.FOUNDER) redirect('/app')
  const settings = await getSettings()
  return (
    <PortalShell user={user} agencyName={settings.AGENCY_NAME} portalWelcome={settings.PORTAL_WELCOME}>
      {children}
    </PortalShell>
  )
}
