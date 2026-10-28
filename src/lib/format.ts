export function formatGBP(cents: number, currency = 'GBP'): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(cents / 100)
}

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

export function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
}

export function relativeTime(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return formatDate(date)
}

export function humanizeStatus(s: string | null | undefined): string {
  if (!s) return '—'
  return s
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function statusTone(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  const s = status.toUpperCase()
  if (['APPROVED', 'PAID', 'COMPLETED', 'DONE', 'ACTIVE', 'VERIFIED', 'RESOLVED', 'PASS', 'AUTHORIZED', 'SENT_TO_CLIENT', 'DELIVERED', 'ACCEPTED'].includes(s)) return 'default'
  if (['REJECTED', 'OVERDUE', 'URGENT', 'FAIL', 'CANCELLED', 'CHURNED', 'BLOCKED', 'PAST_DUE'].includes(s)) return 'destructive'
  if (['PENDING', 'PREPARING', 'DRAFT', 'BACKLOG', 'PLANNED', 'OPEN', 'SUBMITTED'].includes(s)) return 'secondary'
  return 'outline'
}
