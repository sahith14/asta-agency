import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ApiError, assertOwnershipOrNotFound, getIp, isFounder, requireUser, withApi } from '@/lib/rbac'
import { readAsset } from '@/lib/storage'
import { logAudit } from '@/lib/audit'
import { ROLES } from '@/lib/constants'
import { notFound } from '../../../portal/_portal'

/**
 * GET /api/assets/[id]/download — THE single authorized asset-serving path
 * (used by both the client portal and the internal app; assets are never
 * served statically).
 *
 * Access rules:
 *  (a) FOUNDER (unrestricted super-user),
 *  (b) CLIENT whose clientId matches the project AND asset.visibility = CLIENT,
 *  (c) WEB_DEVELOPER assigned to the project,
 *  (d) CLIENT_MANAGER / SUPPORT_FINANCE.
 * Anything else → 404 (never 403 — avoids existence leaks). 401 when signed out.
 */
export const GET = withApi<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params
  const user = await requireUser() // 401 if unauthenticated

  const asset = await db.asset.findUnique({
    where: { id },
    include: { project: { select: { id: true, clientId: true, assignedToId: true } } },
  })
  assertOwnershipOrNotFound(Boolean(asset))
  if (!asset) notFound() // unreachable; satisfies TS narrowing with the same 404

  const allowed =
    isFounder(user) ||
    (user.role === ROLES.CLIENT &&
      !!user.clientId &&
      user.clientId === asset.project.clientId &&
      asset.visibility === 'CLIENT') ||
    (user.role === ROLES.WEB_DEVELOPER && asset.project.assignedToId === user.id) ||
    user.role === ROLES.CLIENT_MANAGER ||
    user.role === ROLES.SUPPORT_FINANCE

  if (!allowed) {
    await logAudit({
      actorId: user.id,
      actorRole: user.role,
      action: 'ASSET_DOWNLOADED',
      entityType: 'Asset',
      entityId: asset.id,
      result: 'DENIED',
      detail: JSON.stringify({ reason: 'role_or_scope_not_permitted' }),
      ip: getIp(req),
    })
    notFound() // deny without leaking existence
  }

  const bytes = readAsset(asset.storedName) // throws 404 if the file is missing on disk

  await logAudit({
    actorId: user.id,
    actorRole: user.role,
    action: 'ASSET_DOWNLOADED',
    entityType: 'Asset',
    entityId: asset.id,
    result: 'SUCCESS',
    ip: getIp(req),
  })

  const safeName = asset.originalName.replace(/["\\\r\n]/g, '_')
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': asset.mimeType,
      'Content-Length': String(bytes.byteLength),
      'Content-Disposition': `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(asset.originalName)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})
