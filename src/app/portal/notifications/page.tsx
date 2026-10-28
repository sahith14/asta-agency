'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { api, fmtDateTime } from '@/lib/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Bell, CheckCheck } from 'lucide-react'

interface Notif { id: string; type: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string }

export default function PortalNotificationsPage() {
  const [items, setItems] = useState<Notif[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => api<{ notifications: Notif[] }>('/api/notifications').then(d => setItems(d.notifications)).catch(e => setError(e.message)), [])
  useEffect(() => { load() }, [load])

  async function markAll() {
    await api('/api/notifications/read-all', { method: 'POST' }).catch(() => {})
    load()
  }
  async function markOne(id: string) {
    await api(`/api/notifications/${id}/read`, { method: 'POST' }).catch(() => {})
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Bell className="h-6 w-6 text-primary" /> Notifications</h1>
          <p className="text-muted-foreground text-sm">Updates about your projects, shoots and reviews (in-app only — email delivery is not configured in this environment).</p>
        </div>
        <Button variant="outline" onClick={markAll}><CheckCheck className="h-4 w-4 mr-1.5" />Mark all as read</Button>
      </div>

      {error && <Alert variant="destructive"><AlertTitle>Failed to load</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {!error && !items && <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>}

      {items && (
        items.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <Bell className="h-10 w-10 mx-auto mb-3 opacity-30" /><p className="font-medium">No notifications</p>
            <p className="text-sm mt-1">You&apos;re all caught up.</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-1">
            {items.map(n => {
              const inner = (
                <Card className={`${n.readAt ? 'opacity-60' : 'border-primary/30'}`}>
                  <CardContent className="py-3.5 flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{n.title}</p>
                      {n.body && <p className="text-sm text-muted-foreground mt-0.5">{n.body}</p>}
                      <p className="text-xs text-muted-foreground mt-1">{fmtDateTime(n.createdAt)} · {n.type.replaceAll('_', ' ')}</p>
                    </div>
                    {!n.readAt && <Button size="sm" variant="ghost" onClick={(e) => { e.preventDefault(); markOne(n.id) }}>Mark read</Button>}
                  </CardContent>
                </Card>
              )
              // Client notifications only ever link to portal pages or /login
              return n.link
                ? <Link key={n.id} href={n.link} onClick={() => markOne(n.id)} className="block">{inner}</Link>
                : <div key={n.id}>{inner}</div>
            })}
          </div>
        )
      )}
    </div>
  )
}
