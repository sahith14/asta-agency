'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api, fmtDate, fmtDateTime } from '@/lib/client'
import { StatusBadge, PriorityBadge } from '@/components/status-badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Scissors, AlertTriangle, Clock } from 'lucide-react'

interface QueueItem {
  id: string; reference: string; title: string; status: string; priority: string; deadline: string | null
  project: { id: string; name: string; client: { name: string } }
  videographer: string | null; currentVersion: number; reviewStatus: string | null
  revisionCount: number; revisionAllowance: number; blockers: string | null; waitingSince: string | null
}

const STATUSES = ['FOOTAGE_READY', 'EDITING', 'REVISION_REQUIRED', 'INTERNAL_REVIEW']

export default function EditingQueuePage() {
  const [items, setItems] = useState<QueueItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('all')

  useEffect(() => {
    api<{ queue: QueueItem[] }>('/api/video/editing-queue').then(d => setItems(d.queue)).catch(e => setError(e.message))
  }, [])

  const filtered = items?.filter(i => status === 'all' || i.status === status)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Scissors className="h-6 w-6 text-primary" /> Editing queue</h1>
        <p className="text-muted-foreground text-sm">Editor-focused work queue — assigned jobs, priorities and waiting time.</p>
      </div>

      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger className="w-52" aria-label="Filter queue"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All stages in queue</SelectItem>
          {STATUSES.map(s => <SelectItem key={s} value={s}>{s.replaceAll('_', ' ')}</SelectItem>)}
        </SelectContent>
      </Select>

      {error && <Alert variant="destructive"><AlertTitle>Failed to load</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {!error && !items && <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>}

      {filtered && (
        filtered.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground"><Scissors className="h-10 w-10 mx-auto mb-3 opacity-30" /><p className="font-medium">Queue is clear</p><p className="text-sm mt-1">No jobs waiting {status !== 'all' ? 'in this stage' : ''}.</p></CardContent></Card>
        ) : (
          <div className="space-y-2">
            {filtered.map(i => {
              const overdue = i.deadline && new Date(i.deadline) < new Date() && i.status !== 'DELIVERED'
              return (
                <Link key={i.id} href={`/app/video/deliverables/${i.id}`}>
                  <Card className={`hover:border-primary/40 transition-colors ${overdue ? 'border-rose-300' : ''}`}>
                    <CardContent className="py-4 flex flex-wrap items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{i.title} {i.currentVersion > 0 && <span className="text-muted-foreground font-normal">· v{i.currentVersion}</span>}</p>
                        <p className="text-xs text-muted-foreground">{i.reference} · {i.project.name} ({i.project.client.name}) · shot by {i.videographer ?? '—'}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock className="h-3 w-3" />
                          {i.waitingSince ? `Waiting since ${fmtDateTime(i.waitingSince)}` : i.deadline ? `Deadline ${fmtDate(i.deadline)}` : 'No deadline'}
                          {i.revisionCount > 0 ? ` · revision ${i.revisionCount}/${i.revisionAllowance}` : ''}
                        </p>
                        {i.blockers && <p className="text-xs text-rose-700 flex items-center gap-1 mt-0.5"><AlertTriangle className="h-3 w-3" />{i.blockers}</p>}
                      </div>
                      {i.reviewStatus && <StatusBadge status={i.reviewStatus} />}
                      <PriorityBadge priority={i.priority} />
                      <StatusBadge status={i.status} />
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}
