import { db } from './db'
import { getIp } from './rbac'
import type { NextRequest } from 'next/server'

type AuditInput = {
  actorId?: string | null
  actorRole?: string | null
  action: string
  entityType?: string | null
  entityId?: string | null
  result: 'ALLOWED' | 'DENIED' | 'SUCCESS' | 'FAILURE'
  detail?: string | null
  ip?: string | null
}

/**
 * Append-only audit trail. Never throws into request flow — audit failures
 * are logged but must not break business operations.
 */
export async function logAudit(input: AuditInput): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        actorRole: input.actorRole ?? null,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        result: input.result,
        detail: input.detail ?? null,
        ip: input.ip ?? null,
      },
    })
  } catch (err) {
    console.error('[audit] Failed to write audit log:', err)
  }
}

export function auditFromRequest(
  req: NextRequest,
  base: Omit<AuditInput, 'ip'>
): AuditInput {
  return { ...base, ip: getIp(req) }
}
