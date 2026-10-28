'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { humanizeStatus, statusTone } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Small shared building blocks for the internal Finance / Support / Admin
 * module (task 6-c). All exports are prefixed with `Admin` per module
 * ownership convention. Nothing here enforces permissions — that always
 * happens server-side in the API routes.
 */

/** JSON fetch helper: throws Error(server message) on non-2xx responses. */
export async function adminFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `Request failed (${res.status})`
    throw new Error(message)
  }
  return data as T
}

/** Pounds string ("1,234.50") → integer pence. Returns null when invalid. */
export function poundsToCents(input: string): number | null {
  const cleaned = input.replace(/[,£\s]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const cents = Math.round(parseFloat(cleaned) * 100)
  return Number.isFinite(cents) && cents > 0 ? cents : null
}

export function AdminStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant={statusTone(status)} className={className}>
      {humanizeStatus(status)}
    </Badge>
  )
}

export function AdminSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-24 items-center justify-center gap-2 py-10 text-sm text-muted-foreground" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {label}
    </div>
  )
}

export function AdminEmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {description ? <p className="max-w-sm text-xs text-muted-foreground">{description}</p> : null}
    </div>
  )
}

export function AdminStatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'default' | 'warning'
}) {
  return (
    <Card>
      <CardContent className="px-4 py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn('mt-1 text-2xl font-bold tabular-nums', tone === 'warning' && 'text-amber-700 dark:text-amber-400')}>
          {value}
        </p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  )
}
