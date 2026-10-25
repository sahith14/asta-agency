import { NextRequest } from 'next/server'
import { ZodSchema } from 'zod'
import { AuthUser, jsonError } from '@/lib/auth'

/**
 * RBAC capability matrix — the single source of truth for what each staff role may do.
 * All enforcement happens server-side in API handlers via `can()`.
 * CLIENT role never uses staff endpoints (portal endpoints scope by session clientId).
 */
export type Capability =
  | 'clients.manage'        // create/update clients
  | 'clients.read'
  | 'team.manage'           // create/update staff, reset passwords
  | 'projects.manage'       // create/update/archive projects (both divisions)
  | 'projects.read'
  | 'packages.manage'
  | 'packages.read'
  | 'deliverables.manage'   // create/assign/cancel deliverables, schedule
  | 'deliverables.markShot'
  | 'deliverables.markFootage'
  | 'deliverables.edit'     // work editing state, register versions
  | 'deliverables.internalReview'
  | 'deliverables.deliver'
  | 'briefs.edit'
  | 'shoots.manage'
  | 'shoots.markComplete'
  | 'equipment.manage'
  | 'tasks.manage'
  | 'tasks.work'
  | 'meetings.manage'
  | 'contacts.manage'
  | 'finance.manage'        // invoices create/transition, expenses create
  | 'finance.read'
  | 'reports.read'
  | 'audit.read'
  | 'settings.manage'
  | 'signup.approve'
  | 'search.global'

const OWNER: Capability[] = [
  'clients.manage', 'clients.read', 'team.manage', 'projects.manage', 'projects.read',
  'packages.manage', 'packages.read', 'deliverables.manage', 'deliverables.markShot',
  'deliverables.markFootage', 'deliverables.edit', 'deliverables.internalReview',
  'deliverables.deliver', 'briefs.edit', 'shoots.manage', 'shoots.markComplete',
  'equipment.manage', 'tasks.manage', 'tasks.work', 'meetings.manage', 'contacts.manage',
  'finance.manage', 'finance.read', 'reports.read', 'audit.read', 'settings.manage',
  'signup.approve', 'search.global',
]

const CLIENT_MANAGER: Capability[] = [
  'clients.manage', 'clients.read', 'projects.manage', 'projects.read',
  'packages.manage', 'packages.read', 'deliverables.manage', 'deliverables.deliver',
  'briefs.edit', 'shoots.manage', 'shoots.markComplete', 'equipment.manage',
  'tasks.manage', 'tasks.work', 'meetings.manage', 'contacts.manage',
  'finance.read', 'reports.read', 'search.global',
]

const WEB_DEVELOPER: Capability[] = [
  'projects.read', 'packages.read', 'tasks.work', 'meetings.manage', 'search.global',
  'deliverables.markShot', 'deliverables.markFootage', 'deliverables.edit',
]

const SUPPORT_FINANCE: Capability[] = [
  'clients.read', 'projects.read', 'packages.read', 'tasks.manage', 'tasks.work',
  'finance.manage', 'finance.read', 'reports.read', 'search.global', 'contacts.manage',
]

const VIDEOGRAPHER: Capability[] = [
  'projects.read', 'packages.read', 'deliverables.markShot', 'deliverables.markFootage',
  'shoots.markComplete', 'tasks.work', 'search.global',
]

const VIDEO_EDITOR: Capability[] = [
  'projects.read', 'packages.read', 'deliverables.edit', 'deliverables.markFootage',
  'briefs.edit', 'tasks.work', 'search.global',
]

const CREATIVE_DIRECTOR: Capability[] = [
  'projects.read', 'packages.read', 'deliverables.manage', 'deliverables.internalReview',
  'briefs.edit', 'tasks.work', 'meetings.manage', 'search.global',
]

const CAPABILITIES: Record<string, Capability[]> = {
  OWNER,
  CLIENT_MANAGER,
  WEB_DEVELOPER,
  SUPPORT_FINANCE,
  VIDEOGRAPHER,
  VIDEO_EDITOR,
  CREATIVE_DIRECTOR,
}

export function can(user: AuthUser, capability: Capability): boolean {
  if (user.userType !== 'EMPLOYEE') return false
  return CAPABILITIES[user.role]?.includes(capability) ?? false
}

/** Capability check for a raw staff role string (client-side UI gating). */
export function roleCan(role: string, capability: Capability): boolean {
  return CAPABILITIES[role]?.includes(capability) ?? false
}

/**
 * Staff visibility scope for reads:
 * - OWNER / CLIENT_MANAGER / SUPPORT_FINANCE / CREATIVE_DIRECTOR: all records
 * - WEB_DEVELOPER / VIDEOGRAPHER / VIDEO_EDITOR: only records where they are
 *   assigned (manager, videographer, editor, task assignee)
 */
export function isGlobalReader(role: string): boolean {
  return ['OWNER', 'CLIENT_MANAGER', 'SUPPORT_FINANCE', 'CREATIVE_DIRECTOR'].includes(role)
}

// ── Validation helper ────────────────────────────────────────

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

/** Pagination helper: page (1-based), pageSize (max 100). */
export function getPagination(url: URL): { skip: number; take: number; page: number; pageSize: number } {
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') ?? 25) || 25))
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize }
}
