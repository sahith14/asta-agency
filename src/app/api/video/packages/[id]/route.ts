import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireStaff, audit, json, jsonError } from '@/lib/auth'
import { can, parseBody } from '@/lib/rbac'

const updateSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  description: z.string().max(4000).optional(),
  businessCategory: z.string().max(80).optional(),
  videoCount: z.number().int().min(0).max(500).optional(),
  photoDeliverables: z.string().max(1000).optional(),
  shootSessions: z.number().int().min(0).max(100).optional(),
  shootDurationHours: z.number().min(0).max(24).optional(),
  revisionRounds: z.number().int().min(0).max(20).optional(),
  deliverableFormats: z.string().max(500).optional(),
  turnaroundDays: z.number().int().min(0).max(365).optional(),
  licensingTerms: z.string().max(2000).optional(),
  additionalWorkTerms: z.string().max(2000).optional(),
  price: z.number().min(0).max(10_000_000).optional(),
  isActive: z.boolean().optional(),
  deliverableTemplate: z.array(z.object({
    title: z.string().max(160).optional(),
    category: z.string().max(60).optional(),
    platform: z.string().max(80).optional(),
    aspectRatio: z.string().max(20).optional(),
    durationSec: z.number().int().min(1).max(3600).optional(),
  })).max(200).optional(),
})

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  if (!can(user, 'packages.manage')) return jsonError('You do not have permission to update packages', 403)
  const { id } = await ctx.params
  const { data, error: vErr } = await parseBody(req, updateSchema)
  if (vErr) return vErr

  const pkg = await db.videoPackage.findUnique({ where: { id } })
  if (!pkg) return jsonError('Package not found', 404)

  const { deliverableTemplate, ...rest } = data
  const updated = await db.videoPackage.update({
    where: { id },
    data: { ...rest, ...(deliverableTemplate !== undefined ? { deliverableTemplate: JSON.stringify(deliverableTemplate) } : {}) },
  })
  // Existing client contracts keep their snapshot (packageNameSnapshot / agreedVideoCount on VideoProject) — edits never rewrite agreements.
  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'PACKAGE_UPDATED', 'VideoPackage', id, `Updated video package ${updated.name} (existing contract snapshots unaffected)`)
  return json({ package: updated })
}
