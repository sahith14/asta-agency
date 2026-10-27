'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardList, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { AdminEmptyState } from '@/components/internal/admin-bits'
import { formatDateTime, humanizeStatus, statusTone } from '@/lib/format'

export type BriefRow = {
  id: string
  title: string
  objectives: string
  audience: string
  scope: string
  budget: string | null
  timeline: string | null
  notes: string | null
  status: string
  reviewNotes: string | null
  submittedAt: string | null
  updatedAt: string
  clientId: string
  clientName: string
  projectId: string | null
  projectName: string | null
  createdByName: string
  reviewedByName: string | null
}

const STATUS_FILTERS = ['ALL', 'SUBMITTED', 'IN_REVIEW', 'ACCEPTED', 'REJECTED', 'DRAFT']

export function BriefsClient({ canReview, briefs }: { canReview: boolean; briefs: BriefRow[] }) {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [reviewing, setReviewing] = useState<BriefRow | null>(null)
  const [detail, setDetail] = useState<BriefRow | null>(null)

  const filtered = useMemo(
    () => briefs.filter((b) => statusFilter === 'ALL' || b.status === statusFilter),
    [briefs, statusFilter]
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">Client Briefs</h1>
          <p className="text-sm text-muted-foreground">
            Project briefs raised by clients in their portal{canReview ? ' — review and decide' : ''}.
          </p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="min-h-[44px] w-[200px]" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((s) => (
              <SelectItem key={s} value={s}>
                {s === 'ALL' ? 'All statuses' : humanizeStatus(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <AdminEmptyState
          title="No briefs"
          description="When clients submit a brief from their portal, it appears here for review."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((b) => (
            <Card key={b.id}>
              <CardContent className="space-y-2 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold leading-snug">{b.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {b.clientName}
                      {b.projectName ? ` · ${b.projectName}` : ''} · raised by {b.createdByName}
                      {b.submittedAt ? ` · submitted ${formatDateTime(b.submittedAt)}` : ' · not submitted'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={statusTone(b.status)}>{humanizeStatus(b.status)}</Badge>
                    {canReview && (b.status === 'SUBMITTED' || b.status === 'IN_REVIEW') ? (
                      <Button size="sm" className="min-h-[44px]" onClick={() => setReviewing(b)}>
                        Review
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="min-h-[44px]" onClick={() => setDetail(b)}>
                        View
                      </Button>
                    )}
                  </div>
                </div>
                {b.reviewNotes ? (
                  <p className="rounded-md bg-muted/60 p-2 text-sm">
                    <span className="font-medium">Review notes{b.reviewedByName ? ` (${b.reviewedByName})` : ''}: </span>
                    {b.reviewNotes}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {detail ? <DetailDialog brief={detail} onClose={() => setDetail(null)} /> : null}
      {reviewing ? (
        <ReviewDialog
          brief={reviewing}
          onClose={() => setReviewing(null)}
          onDone={() => {
            setReviewing(null)
            router.refresh()
          }}
        />
      ) : null}
    </div>
  )
}

function DetailDialog({ brief, onClose }: { brief: BriefRow; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{brief.title}</DialogTitle>
          <DialogDescription>
            {brief.clientName}
            {brief.projectName ? ` · ${brief.projectName}` : ''} · {humanizeStatus(brief.status)}
          </DialogDescription>
        </DialogHeader>
        <dl className="space-y-3 text-sm">
          <Section label="Objectives" value={brief.objectives} />
          <Section label="Target audience" value={brief.audience} />
          <Section label="Scope" value={brief.scope} />
          {brief.budget ? <Section label="Budget" value={brief.budget} /> : null}
          {brief.timeline ? <Section label="Timeline" value={brief.timeline} /> : null}
          {brief.notes ? <Section label="Notes" value={brief.notes} /> : null}
          {brief.reviewNotes ? <Section label={`Review notes${brief.reviewedByName ? ` (${brief.reviewedByName})` : ''}`} value={brief.reviewNotes} /> : null}
        </dl>
      </DialogContent>
    </Dialog>
  )
}

function Section({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap">{value}</dd>
    </div>
  )
}

function ReviewDialog({ brief, onClose, onDone }: { brief: BriefRow; onClose: () => void; onDone: () => void }) {
  const [status, setStatus] = useState(brief.status === 'SUBMITTED' ? 'IN_REVIEW' : 'ACCEPTED')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      const res = await fetch(`/api/briefs/${brief.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reviewNotes: notes.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'Could not review brief', description: data.error ?? 'Something went wrong', variant: 'destructive' })
        return
      }
      toast({ title: `Brief ${status === 'ACCEPTED' ? 'accepted' : status === 'REJECTED' ? 'rejected' : 'moved to review'}`, description: brief.title })
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Review brief — {brief.title}</DialogTitle>
          <DialogDescription>
            The client is notified when you accept or reject. “In review” keeps it on your desk.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Decision</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="IN_REVIEW">Keep in review</SelectItem>
                <SelectItem value="ACCEPTED">Accept brief</SelectItem>
                <SelectItem value="REJECTED">Reject brief</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rv-notes">Review notes (shared with the client)</Label>
            <Textarea id="rv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={2000} className="min-h-[44px]" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="min-h-[44px]">
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy} className="min-h-[44px]">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />} Save decision
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
