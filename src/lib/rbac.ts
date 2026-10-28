import { NextRequest } from 'next/server'
import { ZodSchema } from 'zod'
import { jsonError } from '@/lib/auth'

// Server re-export of the client-safe capability matrix so existing server
// imports keep working. Client components must import from './rbac-shared'.
export {
  can,
  roleCan,
  isGlobalReader,
  type Capability,
  type AuthUserLike,
} from './rbac-shared'

// ── Validation helper ────────────────────────────────────────

/**
 * Parse a JSON request body against a zod schema. Returns a 400 json response
 * on invalid JSON or validation failure — handlers can early-return the error.
 */
export async function parseBody<T>(req: NextRequest, schema: ZodSchema<T>): Promise<{ data: T; error: null } | { data: null; error: ReturnType<typeof jsonError> }> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return { data: null, error: jsonError('Invalid JSON body', 400) }
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    const path = first?.path?.join('.') ?? 'body'
    return { data: null, error: jsonError(`Invalid input: ${path} — ${first?.message ?? 'validation failed'}`, 400) }
  }
  return { data: parsed.data, error: null }
}

// ── Pagination helper ────────────────────────────────────────

/** Pagination helper: page (1-based), pageSize (max 100). */
export function getPagination(url: URL): { skip: number; take: number; page: number; pageSize: number } {
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') ?? 25) || 25))
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize }
}
