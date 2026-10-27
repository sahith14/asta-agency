'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { AdminEmptyState, AdminSpinner, AdminStatusBadge, adminFetch } from '@/components/internal/admin-bits'
import { formatDateTime } from '@/lib/format'

type AuditEntry = {
  id: string
  actorId: string | null
  actorRole: string | null
  action: string
  entityType: string | null
  entityId: string | null
  result: string
  detail: string | null
  ip: string | null
  createdAt: string
  actor: { id: string; name: string; role: string } | null
}

const RESULT_OPTIONS = ['ALLOWED', 'DENIED', 'SUCCESS', 'FAILURE']

const ACTION_OPTIONS = [
  'AUTH_LOGIN',
  'AUTH_PASSWORD_CHANGE',
  'INVOICE_CREATED',
  'INVOICE_STATUS_CHANGED',
  'PAYMENT_RECORDED',
  'PAYMENT_VERIFIED',
  'PAYMENT_REJECTED',
  'REFUND_ISSUED',
  'SUBSCRIPTION_CREATED',
  'SUBSCRIPTION_UPDATED',
  'BILLING_QUESTION_RESOLVED',
  'TICKET_CREATED',
  'TICKET_STATUS_CHANGED',
  'TICKET_PRIORITY_CHANGED',
  'TICKET_REPLY_ADDED',
  'TEAM_USER_CREATED',
  'TEAM_ROLE_CHANGED',
  'TEAM_PASSWORD_RESET',
  'TEAM_USER_DEACTIVATED',
  'MAINTENANCE_REPORT_CREATED',
  'MAINTENANCE_REPORT_COMPLETED',
]

const PAGE_SIZE = 50

export function AuditClient() {
  const { toast } = useToast()
  const [entries, setEntries] = useState<AuditEntry[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const [result, setResult] = useState('ALL')
  const [action, setAction] = useState('ALL')

  const load = useCallback(async () => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    if (result !== 'ALL') params.set('result', result)
    if (action !== 'ALL') params.set('action', action)
    try {
      const data = await adminFetch<{ entries: AuditEntry[]; total: number; pageCount: number }>(
        `/api/audit?${params.toString()}`
      )
      setEntries(data.entries)
      setTotal(data.total)
      setPageCount(data.pageCount)
    } catch (err) {
      toast({ title: 'Could not load audit log', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
      setEntries([])
    }
  }, [page, result, action, toast])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount
    void load()
  }, [load])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Append-only record of sensitive actions across the platform. Newest first, 50 per page ({total} entries).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={result} onValueChange={(v) => { setResult(v); setPage(1) }}>
          <SelectTrigger className="h-11 w-44" aria-label="Filter by result">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All results</SelectItem>
            {RESULT_OPTIONS.map((r) => (
              <SelectItem key={r} value={r}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={action} onValueChange={(v) => { setAction(v); setPage(1) }}>
          <SelectTrigger className="h-11 w-56" aria-label="Filter by action">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All actions</SelectItem>
            {ACTION_OPTIONS.map((a) => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {entries === null ? (
        <AdminSpinner label="Loading audit entries…" />
      ) : entries.length === 0 ? (
        <AdminEmptyState title="No audit entries match" description="Try clearing the filters." />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableCaption className="sr-only">Audit log entries</TableCaption>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(e.createdAt)}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {e.actor?.name ?? '—'}
                      {e.actorRole ? <span className="text-muted-foreground"> · {e.actorRole.replace('_', ' ')}</span> : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs">{e.action}</TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                      {e.entityType ? `${e.entityType}${e.entityId ? ` · ${e.entityId.slice(-8)}` : ''}` : '—'}
                    </TableCell>
                    <TableCell><AdminStatusBadge status={e.result} /></TableCell>
                    <TableCell className="max-w-80">
                      <p className="truncate font-mono text-[11px] text-muted-foreground" title={e.detail ?? ''}>
                        {e.detail ?? '—'}
                      </p>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{e.ip ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-3 md:hidden">
            {entries.map((e) => (
              <Card key={e.id}>
                <CardContent className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono text-xs font-semibold">{e.action}</p>
                    <AdminStatusBadge status={e.result} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {e.actor?.name ?? '—'}{e.actorRole ? ` · ${e.actorRole.replace('_', ' ')}` : ''} · {formatDateTime(e.createdAt)}
                  </p>
                  {e.entityType ? (
                    <p className="font-mono text-[11px] text-muted-foreground">{e.entityType}{e.entityId ? ` · ${e.entityId.slice(-8)}` : ''}</p>
                  ) : null}
                  {e.detail ? (
                    <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{e.detail}</p>
                  ) : null}
                  {e.ip ? <p className="mt-1 font-mono text-[11px] text-muted-foreground">IP {e.ip}</p> : null}
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">Page {page} of {pageCount}</p>
            <div className="flex gap-2">
              <Button variant="outline" className="h-11" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft className="h-4 w-4" /> Previous
              </Button>
              <Button variant="outline" className="h-11" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
