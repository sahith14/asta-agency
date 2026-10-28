import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole, audit, json } from '@/lib/auth'
import { parseBody } from '@/lib/rbac'

// GET /api/settings — app settings (OWNER only reads all; agency name is public via landing)
export async function GET(req: NextRequest) {
  const { error } = await requireRole(req, ['OWNER'])
  if (error) return error
  const settings = await db.appSetting.findMany()
  const map: Record<string, string> = {}
  for (const s of settings) map[s.key] = s.value
  return json({ settings: map })
}

const putSchema = z.object({
  agencyName: z.string().min(1).max(120).optional(),
  supportEmail: z.string().email().max(200).optional(),
  internalQcChecklist: z.string().max(4000).optional(),
  clientOnboardingNotes: z.string().max(4000).optional(),
})

export async function PUT(req: NextRequest) {
  const { user, error } = await requireRole(req, ['OWNER'])
  if (error) return error
  const { data, error: vErr } = await parseBody(req, putSchema)
  if (vErr) return vErr
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue
    await db.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } })
  }
  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'SETTINGS_UPDATED', 'AppSetting', null, `Updated settings: ${Object.keys(data).join(', ')}`)
  const settings = await db.appSetting.findMany()
  const map: Record<string, string> = {}
  for (const s of settings) map[s.key] = s.value
  return json({ settings: map })
}
