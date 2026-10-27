'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BellOff, CheckCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { AdminEmptyState, AdminSpinner, adminFetch } from '@/components/internal/admin-bits'
import { relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'

type NotificationItem = {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  readAt: string | null
  createdAt: string
}

export function NotificationsClient() {
  const { toast } = useToast()
  const router = useRouter()
  const [items, setItems] = useState<NotificationItem[] | null>(null)
  const [marking, setMarking] = useState(false)

  const load = useCallback(async () => {
    setItems(null)
    try {
      const data = await adminFetch<{ notifications: NotificationItem[] }>('/api/notifications?limit=100')
      setItems(data.notifications)
    } catch (err) {
      toast({ title: 'Could not load notifications', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
      setItems([])
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  async function markAllRead() {
    setMarking(true)
    try {
      await adminFetch('/api/notifications', { method: 'PATCH', body: JSON.stringify({ all: true }) })
      await load()
    } catch (err) {
      toast({ title: 'Could not mark notifications read', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setMarking(false)
    }
  }

  async function open(n: NotificationItem) {
    if (!n.readAt) {
      try {
        await adminFetch('/api/notifications', { method: 'PATCH', body: JSON.stringify({ id: n.id }) })
      } catch {
        // non-fatal — navigation matters more than the read flag
      }
    }
    if (n.link) router.push(n.link)
  }

  const unreadCount = items?.filter((n) => !n.readAt).length ?? 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            Your in-app notifications. Unread items are highlighted{unreadCount > 0 ? ` — ${unreadCount} unread` : ''}.
          </p>
        </div>
        <Button onClick={() => void markAllRead()} disabled={marking || unreadCount === 0} className="h-11">
          <CheckCheck className="h-4 w-4" /> Mark all read
        </Button>
      </div>

      {items === null ? (
        <AdminSpinner label="Loading notifications…" />
      ) : items.length === 0 ? (
        <AdminEmptyState
          title="No notifications"
          description="You're all caught up. Ticket, billing and system updates will appear here."
        />
      ) : (
        <div className="grid max-h-96 gap-2 overflow-y-auto pr-1">
          {items.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => void open(n)}
              className={cn(
                'w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent/50',
                !n.readAt && 'border-primary/30 bg-primary/5'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium leading-tight">
                  {!n.readAt ? <span className="mr-2 inline-block h-2 w-2 rounded-full bg-primary align-middle" aria-label="Unread" /> : null}
                  {n.title}
                </p>
                <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(n.createdAt)}</span>
              </div>
              {n.body ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{n.body}</p> : null}
              <div className="mt-1 flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">{n.type.replace(/_/g, ' ')}</Badge>
                {n.link ? <span className="text-[11px] text-muted-foreground">{n.link}</span> : null}
                {!n.readAt ? <Badge className="text-[10px]">Unread</Badge> : null}
              </div>
            </button>
          ))}
        </div>
      )}

      {items !== null && items.length > 0 ? (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <BellOff className="h-3 w-3" /> Only your own notifications are shown — 100 most recent.
        </p>
      ) : null}
    </div>
  )
}
