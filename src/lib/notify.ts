import { db } from './db'

export type NotificationInput = {
  type: string
  title: string
  body?: string | null
  link?: string | null
  /** Idempotency key — the same logical event never notifies a user twice. */
  dedupeKey?: string | null
}

/**
 * Idempotent in-app notifications (the delivery channel that always works).
 * dedupeKey is namespaced per user; duplicate inserts are silently skipped.
 * Email/SMS are NOT connected in this deployment (documented limitation) —
 * the in-app bell is the notification surface of record.
 */
export async function notifyUsers(userIds: string[], input: NotificationInput): Promise<void> {
  const unique = Array.from(new Set(userIds.filter(Boolean)))
  if (unique.length === 0) return
  // SQLite has no createMany skipDuplicates — insert one-by-one and treat
  // unique-constraint violations (P2002) as "already notified".
  await Promise.all(
    unique.map(async (userId) => {
      try {
        await db.notification.create({
          data: {
            userId,
            type: input.type,
            title: input.title,
            body: input.body ?? null,
            link: input.link ?? null,
            dedupeKey: input.dedupeKey ? `${input.dedupeKey}:${userId}` : null,
          },
        })
      } catch (err: unknown) {
        const e = err as { code?: string }
        if (e?.code !== 'P2002') {
          console.error('[notify] Failed to create notification:', err)
        }
      }
    })
  )
}

/** All active users of a client business (for client-facing notifications). */
export async function clientUserIds(clientId: string): Promise<string[]> {
  const users = await db.user.findMany({ where: { clientId, isActive: true, role: 'CLIENT' }, select: { id: true } })
  return users.map((u) => u.id)
}

/** All users holding any of the given roles (e.g. all FOUNDERs). */
export async function roleUserIds(roles: string[]): Promise<string[]> {
  const users = await db.user.findMany({ where: { role: { in: roles }, isActive: true }, select: { id: true } })
  return users.map((u) => u.id)
}
