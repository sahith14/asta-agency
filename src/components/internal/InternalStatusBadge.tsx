import { Badge } from '@/components/ui/badge'
import { humanizeStatus, statusTone } from '@/lib/format'

/**
 * Extra tone overrides for statuses the shared statusTone() helper maps to a
 * plain outline but that deserve a stronger visual in the internal module.
 * Falls back to statusTone() for everything else (shared lib stays untouched).
 */
const TONE_OVERRIDES: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  AUTHORIZED_FOR_PREVIEW: 'default',
  READY_FOR_FOUNDER: 'outline',
  CONVERTED_TO_TASK: 'default',
  UNDER_FOUNDER_REVIEW: 'outline',
  SCOPE_REVIEWED: 'outline',
  IN_PROGRESS: 'outline',
  IN_REVIEW: 'outline',
  IN_BUILD: 'outline',
  READY_FOR_REVIEW: 'outline',
  WAITING_ON_CLIENT: 'outline',
  CHANGES_REQUESTED: 'destructive',
  EXTRA_COST_QUOTED: 'outline',
  NONE: 'secondary',
  ISSUED: 'outline',
  LEAD: 'secondary',
  LAUNCH: 'default',
  BUILD: 'outline',
  REVIEW: 'outline',
  DISCOVERY: 'secondary',
  COMPLETE: 'default',
  PAUSED: 'outline',
}

export function InternalStatusBadge({ status, className }: { status: string; className?: string }) {
  const variant = TONE_OVERRIDES[status.toUpperCase()] ?? statusTone(status)
  return (
    <Badge variant={variant} className={className}>
      {humanizeStatus(status)}
    </Badge>
  )
}
