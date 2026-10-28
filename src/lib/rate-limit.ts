/**
 * Minimal in-memory sliding-window rate limiter (per process).
 * Suitable for the single-node demo deployment; no external cache required.
 * Keys are expected to be non-reversible (e.g. sha256 of IP) so no raw
 * visitor identifiers are retained.
 */
const buckets = new Map<string, number[]>()
let lastSweep = Date.now()

function sweep(now: number) {
  // Cheap housekeeping: drop expired entries at most once a minute
  if (now - lastSweep < 60_000) return
  lastSweep = now
  for (const [key, hits] of buckets) {
    if (hits.length === 0 || now - hits[hits.length - 1] > 24 * 3600_000) buckets.delete(key)
  }
}

export interface RateLimitResult {
  ok: boolean
  remaining: number
  retryAfterSec: number
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  sweep(now)
  const hits = (buckets.get(key) ?? []).filter(t => now - t < windowMs)
  if (hits.length >= limit) {
    const retryAfterSec = Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000))
    buckets.set(key, hits)
    return { ok: false, remaining: 0, retryAfterSec }
  }
  hits.push(now)
  buckets.set(key, hits)
  return { ok: true, remaining: limit - hits.length, retryAfterSec: 0 }
}

/** Multi-window guard: applies every limit; the strictest result wins. */
export function rateLimitAll(key: string, rules: Array<{ limit: number; windowMs: number }>): RateLimitResult {
  let worst: RateLimitResult = { ok: true, remaining: Infinity, retryAfterSec: 0 }
  rules.forEach((rule, i) => {
    const res = rateLimit(`${key}:${i}`, rule.limit, rule.windowMs)
    if (!res.ok) worst = res
    else if (worst.ok && res.remaining < worst.remaining) worst = res
  })
  return worst
}
