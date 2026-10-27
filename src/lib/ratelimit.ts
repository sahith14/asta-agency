// In-memory fixed-window rate limiter.
// Limitation (documented): per-process state, resets on restart, not shared
// across instances. Adequate for this single-instance deployment.

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

export function rateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfterSec: 0 }
  }
  b.count += 1
  if (b.count > limit) {
    return { allowed: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) }
  }
  return { allowed: true, retryAfterSec: 0 }
}

// periodic cleanup to avoid unbounded growth
const CLEANUP_INTERVAL = 10 * 60 * 1000
let lastCleanup = Date.now()
export function maybeCleanup() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return
  lastCleanup = now
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key)
  }
}
