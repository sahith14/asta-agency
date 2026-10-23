'use client'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/** Authenticated fetch helper — returns parsed JSON or throws ApiError */
export async function api<T = unknown>(path: string, options?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: options?.method ?? 'GET',
    headers: options?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
    credentials: 'same-origin',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `Request failed (${res.status})`, res.status)
  return data as T
}

export function fmtDate(d?: string | Date | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function fmtDateTime(d?: string | Date | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function fmtMoney(v?: number | null): string {
  if (v === null || v === undefined) return '—'
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(v)
}

export const STATUS_COLORS: Record<string, string> = {
  PLANNED: 'bg-stone-100 text-stone-700 border-stone-200',
  SCHEDULED: 'bg-sky-50 text-sky-700 border-sky-200',
  SHOT: 'bg-teal-50 text-teal-700 border-teal-200',
  FOOTAGE_READY: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  EDITING: 'bg-amber-50 text-amber-700 border-amber-200',
  INTERNAL_REVIEW: 'bg-orange-50 text-orange-700 border-orange-200',
  CLIENT_REVIEW: 'bg-purple-50 text-purple-700 border-purple-200',
  REVISION_REQUIRED: 'bg-rose-50 text-rose-700 border-rose-200',
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  DELIVERED: 'bg-green-100 text-green-800 border-green-300',
  CANCELLED: 'bg-zinc-100 text-zinc-500 border-zinc-200',
  DISCOVERY: 'bg-stone-100 text-stone-700 border-stone-200',
  IN_PROGRESS: 'bg-amber-50 text-amber-700 border-amber-200',
  REVIEW: 'bg-purple-50 text-purple-700 border-purple-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ON_HOLD: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  TODO: 'bg-stone-100 text-stone-700 border-stone-200',
  BLOCKED: 'bg-rose-50 text-rose-700 border-rose-200',
  DONE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  DRAFT: 'bg-stone-100 text-stone-700 border-stone-200',
  SENT: 'bg-sky-50 text-sky-700 border-sky-200',
  PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  OVERDUE: 'bg-rose-50 text-rose-700 border-rose-200',
  VOID: 'bg-zinc-100 text-zinc-500 border-zinc-200',
  PENDING_INTERNAL: 'bg-orange-50 text-orange-700 border-orange-200',
  PENDING_CLIENT: 'bg-purple-50 text-purple-700 border-purple-200',
  INTERNAL_REJECTED: 'bg-rose-50 text-rose-700 border-rose-200',
  CLIENT_REJECTED: 'bg-rose-50 text-rose-700 border-rose-200',
  SUPERSEDED: 'bg-zinc-100 text-zinc-500 border-zinc-200',
  OPEN: 'bg-amber-50 text-amber-700 border-amber-200',
  RESOLVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CLOSED: 'bg-zinc-100 text-zinc-500 border-zinc-200',
  URGENT: 'bg-rose-100 text-rose-800 border-rose-300',
  HIGH: 'bg-orange-50 text-orange-700 border-orange-200',
  MEDIUM: 'bg-stone-100 text-stone-700 border-stone-200',
  LOW: 'bg-zinc-100 text-zinc-500 border-zinc-200',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  APPROVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-700 border-rose-200',
}

export const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Founder / Owner',
  CLIENT_MANAGER: 'Client Manager',
  WEB_DEVELOPER: 'Web Developer',
  SUPPORT_FINANCE: 'Support & Finance',
  VIDEOGRAPHER: 'Videographer',
  VIDEO_EDITOR: 'Video Editor',
  CREATIVE_DIRECTOR: 'Creative Director',
  CLIENT: 'Client',
}
