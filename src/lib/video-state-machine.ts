import { NextRequest } from 'next/server'
import { DeliverableStatus } from '@prisma/client'

/**
 * Server-enforced deliverable state machine.
 * Transitions list the allowed target statuses from each source status,
 * with the staff roles permitted to perform them.
 * (CLIENT role transitions happen via portal endpoints with their own gates.)
 */
export const TRANSITIONS: Record<DeliverableStatus, Array<{
  to: DeliverableStatus
  roles: string[]
  requires?: { footageBackupVerified?: boolean; deliveryMetadata?: boolean; reason?: boolean }
}>> = {
  PLANNED: [
    { to: 'SCHEDULED', roles: ['OWNER', 'CLIENT_MANAGER', 'CREATIVE_DIRECTOR'] },
    { to: 'CANCELLED', roles: ['OWNER', 'CLIENT_MANAGER'], requires: { reason: true } },
  ],
  SCHEDULED: [
    { to: 'SHOT', roles: ['OWNER', 'CLIENT_MANAGER', 'VIDEOGRAPHER'] },
    { to: 'CANCELLED', roles: ['OWNER', 'CLIENT_MANAGER'], requires: { reason: true } },
  ],
  SHOT: [
    { to: 'FOOTAGE_READY', roles: ['OWNER', 'CLIENT_MANAGER', 'VIDEOGRAPHER'], requires: { footageBackupVerified: true } },
    { to: 'CANCELLED', roles: ['OWNER', 'CLIENT_MANAGER'], requires: { reason: true } },
  ],
  FOOTAGE_READY: [
    { to: 'EDITING', roles: ['OWNER', 'CLIENT_MANAGER', 'VIDEO_EDITOR', 'CREATIVE_DIRECTOR'] },
    { to: 'CANCELLED', roles: ['OWNER', 'CLIENT_MANAGER'], requires: { reason: true } },
  ],
  EDITING: [
    { to: 'INTERNAL_REVIEW', roles: ['OWNER', 'CLIENT_MANAGER', 'VIDEO_EDITOR', 'CREATIVE_DIRECTOR'] },
    { to: 'CANCELLED', roles: ['OWNER', 'CLIENT_MANAGER'], requires: { reason: true } },
  ],
  INTERNAL_REVIEW: [
    // Approve/reject handled by internal review endpoint; direct move back to editing allowed for reviewer
    { to: 'EDITING', roles: ['OWNER', 'CLIENT_MANAGER', 'CREATIVE_DIRECTOR'] },
    { to: 'CANCELLED', roles: ['OWNER'], requires: { reason: true } },
  ],
  CLIENT_REVIEW: [
    { to: 'CANCELLED', roles: ['OWNER'], requires: { reason: true } },
  ],
  REVISION_REQUIRED: [
    { to: 'EDITING', roles: ['OWNER', 'CLIENT_MANAGER', 'VIDEO_EDITOR', 'CREATIVE_DIRECTOR'] },
    { to: 'CANCELLED', roles: ['OWNER', 'CLIENT_MANAGER'], requires: { reason: true } },
  ],
  APPROVED: [
    { to: 'DELIVERED', roles: ['OWNER', 'CLIENT_MANAGER'], requires: { deliveryMetadata: true } },
    { to: 'CANCELLED', roles: ['OWNER'], requires: { reason: true } },
  ],
  DELIVERED: [],
  CANCELLED: [],
}

export function canTransition(from: DeliverableStatus, to: DeliverableStatus, role: string): boolean {
  const allowed = TRANSITIONS[from] ?? []
  return allowed.some(t => t.to === to && t.roles.includes(role))
}

/** Editor/videographer must be assigned to the deliverable to act on it (delivery roles). */
export const DELIVERY_ROLES = ['OWNER', 'CLIENT_MANAGER', 'CREATIVE_DIRECTOR', 'VIDEOGRAPHER', 'VIDEO_EDITOR', 'WEB_DEVELOPER']
