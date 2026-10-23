'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api, fmtDate } from '@/lib/client'
import { StatusBadge, PriorityBadge } from '@/components/status-badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Search, Film, AlertTriangle } from 'lucide-react'

interface Row {
  id: string; reference: string; title: string; status: string; priority: string; deadline: string | null
  project: { id: string; name: string; reference: string; client: { name: string } }
  videographer: { id: string; name: string } | null
  editor: { id: string; name: string } | null
  _count: { versions: number }
}

const STATUSES = ['PLANNED', 'SCHEDULED', 'SHOT', 'FOOTAGE_READY', 'EDITING', 'INTERNAL_REVIEW', 'CLIENT_REVIEW', 'REVISION_REQUIRED', 'APPROVED', 'DELIVERED', 'CANCELLED']

export default function DeliverablesPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [me, setMe] = useState<string>('')

  useEffect(() => {
    api<{ user: { userId?: string } }>('/api/auth/me').then(() => {}).catch(() => {})
    const params = new URLSearchParams({ pageSize: '100' })
    api<{ deliverables: Row[] }>(`/api/video/deliverables?${params}`).then(d => setRows(d.deliverables)).catch(e => setError(e.message))
  }, [])

  const filtered = rows?.filter(r =>
    (!search || r.title.toLowerCase().includes(search.toLowerCase()) || r.reference.toLowerCase().includes(search.toLowerCase()) || r.project.name.toLowerCase().includes(search.toLowerCase())) &&
    (status === 'all' || r.status === status)
  )

  const overdue = (r: Row) => r.deadline && new Date(r.deadline) < new Date() && !['DELIVERED', 'CANCELLED'].includes(r.status)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Film className="h-6 w-6 text-primary" /> Deliverables tracker</h1>
        <p className="text-muted-foreground text-sm">Every contracted video, tracked individually through production.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-52 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search deliverables…" className="pl-8" aria-label="Search deliverables" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-52" aria-label="Filter by status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map(s => <SelectItem key={s} value={s}>{s.replaceAll('_', ' ')}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {error && <Alert variant="destructive"><AlertTitle>Failed to load</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {!error && !rows && <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>}

      {filtered && (
        filtered.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <Film className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No deliverables match</p>
            <p className="text-sm mt-1">Adjust filters or create deliverables inside a video project.</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-2">
            {filtered.map(r => (
              <Link key={r.id} href={`/app/video/deliverables/${r.id}`}>
                <Card className={`hover:border-primary/40 transition-colors ${overdue(r) ? 'border-rose-300' : ''}`}>
                  <CardContent className="py-4 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold truncate">{r.title}</p>
                        {overdue(r) && <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" aria-label="Overdue" />}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {r.reference} · {r.project.name} ({r.project.client.name}) · {r.videographer?.name ?? '—'} → {r.editor?.name ?? '—'}
                      </p>
                    </div>
                    <div className="hidden sm:block text-xs text-muted-foreground text-right shrink-0">
                      {r.deadline && <span className={overdue(r) ? 'text-rose-600 font-medium' : ''}>Due {fmtDate(r.deadline)}</span>}
                    </div>
                    <PriorityBadge priority={r.priority} />
                    <StatusBadge status={r.status} />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )
      )}
    </div>
  )
}
