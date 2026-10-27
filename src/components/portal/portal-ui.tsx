'use client'

import { AlertCircle, Inbox } from 'lucide-react'
import { humanizeStatus, statusTone } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'

/**
 * Client-friendly status wording — internal status enums are never shown raw
 * in the portal (e.g. never READY_FOR_FOUNDER).
 */
const FRIENDLY_STATUS: Record<string, string> = {
  // Demos
  AUTHORIZED_FOR_PREVIEW: 'Ready for your review',
  SENT_TO_CLIENT: 'Awaiting your review',
  CHANGES_REQUESTED: 'Changes requested',
  APPROVED: 'Approved',
  // Projects & delivery
  DISCOVERY: 'Discovery',
  BUILD: 'In build',
  REVIEW: 'Review',
  LAUNCH: 'Launch',
  COMPLETE: 'Complete',
  PAUSED: 'Paused',
  CANCELLED: 'Cancelled',
  PENDING: 'Upcoming',
  IN_PROGRESS: 'In progress',
  DELIVERED: 'Delivered',
  PLANNED: 'Planned',
  IN_BUILD: 'In build',
  READY_FOR_REVIEW: 'Ready for review',
  AUTHORIZED: 'Authorized',
  // Billing
  ISSUED: 'Awaiting payment',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  PAST_DUE: 'Past due',
  VERIFIED: 'Verified',
  REJECTED: 'Rejected',
  BANK_TRANSFER: 'Bank transfer',
  CARD_ONLINE: 'Card payment',
  MANUAL_CREDIT: 'Manual credit',
  REFUND: 'Refund',
  // Support
  OPEN: 'Open',
  WAITING_ON_CLIENT: 'Waiting on you',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  URGENT: 'Urgent',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
  SUBMITTED: 'Submitted',
  UNDER_FOUNDER_REVIEW: 'Under review',
  SCOPE_REVIEWED: 'Reviewed',
  CONVERTED_TO_TASK: 'Converted to work',
  IN_REVIEW: 'In review',
  ACCEPTED: 'Accepted',
  QUESTION: 'Question',
  CANCELLATION_REQUEST: 'Cancellation request',
  // Maintenance checks
  PASS: 'Pass',
  FAIL: 'Fail',
  SKIPPED: 'Skipped',
  SUPPORT: 'Support',
  WEBSITE_CHANGE: 'Website change',
}

export function friendlyStatus(status?: string | null): string {
  if (!status) return '—'
  return FRIENDLY_STATUS[status] ?? humanizeStatus(status)
}

export function StatusBadge({ status, className }: { status?: string | null; className?: string }) {
  return (
    <Badge variant={statusTone(status ?? '')} className={cn(className)}>
      {friendlyStatus(status)}
    </Badge>
  )
}

export function Spinner({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground', className)}
    >
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      <span>{label}</span>
    </div>
  )
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" aria-hidden />
      <AlertTitle>Something went wrong</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

export function EmptyState({
  title,
  hint,
  icon: Icon = Inbox,
  children,
}: {
  title: string
  hint?: string
  icon?: React.ComponentType<{ className?: string }>
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/30 px-6 py-12 text-center">
      <Icon className="h-8 w-8 text-muted-foreground" aria-hidden />
      <p className="font-medium">{title}</p>
      {hint ? <p className="max-w-md text-sm text-muted-foreground">{hint}</p> : null}
      {children}
    </div>
  )
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes
  let unit = 'B'
  for (const u of units) {
    if (value < 1024) break
    value /= 1024
    unit = u
  }
  return `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10} ${unit}`
}

/** Role label without internal jargon for feedback authors. */
export function authorRoleLabel(role: string): string {
  const map: Record<string, string> = {
    CLIENT: 'You',
    FOUNDER: 'Founder',
    CLIENT_MANAGER: 'Account manager',
    WEB_DEVELOPER: 'Web team',
    SUPPORT_FINANCE: 'Support team',
  }
  return map[role] ?? humanizeStatus(role)
}
