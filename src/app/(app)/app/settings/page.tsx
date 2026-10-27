import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { ROLES, ROLE_LABELS, type Role } from '@/lib/constants'
import { getSettings } from '@/lib/settings'
import { SettingsClient } from './settings-client'

export default async function SettingsPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  // Internal settings surface — employees only (clients manage their account in the portal).
  if (user.role === ROLES.CLIENT) redirect('/portal')

  const settings = await getSettings()

  return (
    <SettingsClient
      account={{ name: user.name, email: user.email, role: user.role, roleLabel: ROLE_LABELS[user.role as Role] ?? user.role }}
      canManageAgency={user.role === ROLES.FOUNDER || user.role === ROLES.CLIENT_MANAGER}
      initialSettings={{
        AGENCY_NAME: settings.AGENCY_NAME,
        SUPPORT_EMAIL: settings.SUPPORT_EMAIL,
        WEBSITE_URL: settings.WEBSITE_URL,
        CONTACT_PHONE: settings.CONTACT_PHONE,
        TIMEZONE: settings.TIMEZONE,
        PORTAL_WELCOME: settings.PORTAL_WELCOME,
      }}
    />
  )
}
