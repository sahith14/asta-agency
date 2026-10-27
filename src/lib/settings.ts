import { db } from './db'

/**
 * Stage 2 org settings — a deliberately small, SAFE key whitelist.
 * Nothing here may affect billing, credentials, security policy or
 * privileged integrations (those simply have no key). Values are plain
 * display strings with hard length caps.
 */
export const SETTING_KEYS = [
  'AGENCY_NAME',
  'SUPPORT_EMAIL',
  'WEBSITE_URL',
  'CONTACT_PHONE',
  'TIMEZONE',
  'PORTAL_WELCOME',
] as const

export type SettingKey = (typeof SETTING_KEYS)[number]

export const SETTING_MAX_LENGTHS: Record<SettingKey, number> = {
  AGENCY_NAME: 80,
  SUPPORT_EMAIL: 120,
  WEBSITE_URL: 200,
  CONTACT_PHONE: 60,
  TIMEZONE: 60,
  PORTAL_WELCOME: 300,
}

export const SETTING_DEFAULTS: Record<SettingKey, string> = {
  AGENCY_NAME: 'ASTAS agency',
  SUPPORT_EMAIL: '',
  WEBSITE_URL: '',
  CONTACT_PHONE: '',
  TIMEZONE: 'Europe/London',
  PORTAL_WELCOME: '',
}

export const SETTING_LABELS: Record<SettingKey, string> = {
  AGENCY_NAME: 'Agency name',
  SUPPORT_EMAIL: 'Support email',
  WEBSITE_URL: 'Website URL',
  CONTACT_PHONE: 'Contact phone',
  TIMEZONE: 'Timezone',
  PORTAL_WELCOME: 'Client portal welcome note',
}

/** Load whitelisted settings, falling back to defaults. */
export async function getSettings(): Promise<Record<SettingKey, string>> {
  const map: Record<SettingKey, string> = { ...SETTING_DEFAULTS }
  try {
    const rows = await db.setting.findMany({ where: { key: { in: [...SETTING_KEYS] } } })
    for (const row of rows) {
      if ((SETTING_KEYS as readonly string[]).includes(row.key)) {
        map[row.key as SettingKey] = row.value
      }
    }
  } catch {
    // Table may not exist yet in fresh deployments — defaults are safe.
  }
  return map
}
