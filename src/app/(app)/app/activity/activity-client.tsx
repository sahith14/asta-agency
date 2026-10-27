'use client'

import { useCallback, useEffect, useState } from 'react'
import { Activity as ActivityIcon, ScrollText } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { AdminEmptyState, AdminSpinner, adminFetch } from '@/components/internal/admin-bits'
import { formatDateTime, relativeTime } from '@/lib/format'
import { ROLE_LABELS, type Role } from '@/lib/constants'

type ActivityEntry = {
  id: string
  action: string
  entityType: string | null
  entityId: string | null
  result: string
  createdAt: string
  actor: { id: string; name: string; role: string } | null
}

export function ActivityClient() {
  const { toast } = useToast()
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null)
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const [total, setTotal] = useState(0)
  const [filter, setFilter] = useState('')

  const load = useCallback(
    async (p: number, action: string) => {
      setEntries(null)
      try {
        const qs = new URLSearchParams({ page: String(p) })
        if (action.trim()) qs.set('action', action.trim())
        const data = await adminFetch<{ entries: ActivityEntry[]; page: number; pageCount: number; total: number }>(
          `/api/activity?${qs.toString()}`
        )
        setEntries(data.entries)
        setPage(data.page)
        setPageCount(data.pageCount)
        setTotal(data.total)
      } catch (err) {
        toast({ title: 'Could not load activity', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
        setEntries([])
      }
    },
    [toast]
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount; load() clears stale rows first (same pattern as notifications-client)
    void load(1, '')
  }, [load])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Activity</h1>
          <p className="text-sm text-muted-foreground">
            Recent team activity across the platform. Security-sensitive events are only visible in the Founder&apos;s
            audit log.
          </p>
        </div>
        <form
          className="flex w-full max-w-sm items-center gap-2 sm:w-auto"
          onSubmit={(e) => {
            e.preventDefault()
            void load(1, filter)
          }}
        >
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by action, e.g. TICKET"
            aria-label="Filter activity by action"
            className="h-11"
          />
          <Button type="submit" variant="outline" className="h-11">
            Filter
          </Button>
        </form>
      </div>

      {entries === null ? (
        <AdminSpinner label="Loading activity…" />
      ) : entries.length === 0 ? (
        <AdminEmptyState
          title="No activity yet"
          description="Successful actions by you and your team will appear here as they happen."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {entries.map((e) => (
                <li key={e.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      <span className="font-semibold">{e.actor?.name ?? 'System'}</span>
                      <span className="text-muted-foreground">
                        {' — '}
                        {e.action.replaceAll('_', ' ').toLowerCase()}
                        {e.entityType ? ` · ${e.entityType}` : ''}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {e.actor ? (
                        ROLE_LABELS[e.actor.role as Role] ? `${ROLE_LABELS[e.actor.role as Role]} · ` : ''
                      ) : null}
                      {formatDateTime(e.createdAt)} ({relativeTime(e.createdAt)})
                    </p>
                  </div>
                  <Badge variant="outline" className="w-fit shrink-0 text-[10px]">
                    <ActivityIcon className="mr-1 h-3 w-3" />
                    {e.result}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {entries !== null && entries.length > 0 ? (
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <ScrollText className="h-3 w-3" /> {total} events · sanitized feed (no IPs, no denied attempts)
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => void load(page - 1, filter)}>
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {page} of {pageCount}
            </span>
            <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => void load(page + 1, filter)}>
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
