import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireStaff, audit, json, jsonError } from '@/lib/auth'
import { can, parseBody } from '@/lib/rbac'

export async function GET(req: NextRequest) {
  const { error } = await requireStaff(req)
  if (error) return error
  const url = new URL(req.url)
  const includeArchived = url.searchParams.get('includeArchived') === 'true'
  const packages = await db.videoPackage.findMany({
    where: includeArchived ? {} : { isActive: true },
    orderBy: { createdAt: 'desc' },
  })
  return json({ packages })
}

const createSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(4000).optional(),
  businessCategory: z.string().max(80).default('Other'),
  videoCount: z.number().int().min(0).max(500).default(0),
  photoDeliverables: z.string().max(1000).optional(),
  shootSessions: z.number().int().min(0).max(100).default(1),
  shootDurationHours: z.number().min(0).max(24).optional(),
  revisionRounds: z.number().int().min(0).max(20).default(1),
  deliverableFormats: z.string().max(500).optional(),
  turnaroundDays: z.number().int().min(0).max(365).optional(),
  licensingTerms: z.string().max(2000).optional(),
  additionalWorkTerms: z.string().max(2000).optional(),
  price: z.number().min(0).max(10_000_000).optional(),
  // Optional template list used when applying the package to a project
  deliverableTemplate: z.array(z.object({
    title: z.string().max(160).optional(),
    category: z.string().max(60).optional(),
    platform: z.string().max(80).optional(),
    aspectRatio: z.string().max(20).optional(),
    durationSec: z.number().int().min(1).max(3600).optional(),
  })).max(200).optional(),
})

export async function POST(req: NextRequest) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  if (!can(user, 'packages.manage')) return jsonError('You do not have permission to create packages', 403)
  const { data, error: vErr } = await parseBody(req, createSchema)
  if (vErr) return vErr
  const { deliverableTemplate, ...rest } = data
  const pkg = await db.videoPackage.create({
    data: { ...rest, deliverableTemplate: deliverableTemplate ? JSON.stringify(deliverableTemplate) : null },
  })
  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'PACKAGE_CREATED', 'VideoPackage', pkg.id, `Created video package ${pkg.name}`)
  return json({ package: pkg }, 201)
}
