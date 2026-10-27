'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { relativeTime } from '@/lib/format'

type Notification = {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  readAt: string | null
  createdAt: string
}

export function NotificationBell() {
  const router = useRouter()
  const [items, setItems] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  async function load() {
    try {
      const res = await fetch('/api/notifications?unreadOnly=1&limit=10', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setItems(data.notifications ?? [])
    } catch {
      /* bell is non-critical */
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- poll notifications on mount
    load()
    timer.current = setInterval(load, 60_000)
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [])

  async function markRead(n: Notification) {
    if (!n.readAt) {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: n.id }),
      }).catch(() => {})
    }
    setOpen(false)
    if (n.link) router.push(n.link)
  }

  async function markAllRead() {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    }).catch(() => {})
    setItems([])
  }

  return (
    <DropdownMenu open={open} onOpenChange={(o) => { setOpen(o); if (o) load() }}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Notifications${items.length ? ` (${items.length} unread)` : ''}`} className="relative">
          <Bell className="h-5 w-5" />
          {items.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
              {items.length > 9 ? '9+' : items.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          {items.length > 0 && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={markAllRead}>
              Mark all read
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
        ) : (
          <ScrollArea className="max-h-80">
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => markRead(n)}
                className="block w-full px-3 py-2.5 text-left hover:bg-accent transition-colors"
              >
                <p className="text-sm font-medium leading-snug">{n.title}</p>
                {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                <p className="mt-1 text-[11px] text-muted-foreground">{relativeTime(n.createdAt)}</p>
              </button>
            ))}
          </ScrollArea>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
