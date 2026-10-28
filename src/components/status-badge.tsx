'use client'

import { Badge } from '@/components/ui/badge'
import { STATUS_COLORS } from '@/lib/client'
import { cn } from '@/lib/utils'

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn('font-medium', STATUS_COLORS[status] ?? 'bg-stone-100 text-stone-700 border-stone-200', className)}>
      {status.replaceAll('_', ' ')}
    </Badge>
  )
}

export function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    URGENT: 'bg-rose-100 text-rose-800 border-rose-300',
    HIGH: 'bg-orange-50 text-orange-700 border-orange-200',
    MEDIUM: 'bg-stone-100 text-stone-700 border-stone-200',
    LOW: 'bg-zinc-100 text-zinc-500 border-zinc-200',
  }
  return (
    <Badge variant="outline" className={cn('font-medium', colors[priority] ?? colors.MEDIUM)}>
      {priority}
    </Badge>
  )
}
