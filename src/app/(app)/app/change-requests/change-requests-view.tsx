'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from '@/hooks/use-toast'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { Loader2, ClipboardList, Check, X, Wrench, Eye } from 'lucide-react'
import { InternalStatusBadge } from '@/components/internal/InternalStatusBadge'
import { SCOPE_IMPACTS } from '@/lib/constants'
import { humanizeStatus, formatDateTime } from '@/lib/format'

type CrRow = {
  id: string
  title: string
  details: string
  status: string
  scopeImpact: string | null
  founderNotes: string | null
  decisionAt: string | null
  demoId: string | null
  createdAt: string
  projectId: string
  projectName: string
  clientName: string
  raisedById: string
  raisedByName: string
  raisedByRole: string
  linkedTask: { id: string; title: string; status: string; projectId: string } | null
}

type ApprovalEventRow = {
  id: string
  action: string
  note: string | null
  resultingAction: string | null
  actorName: string
  createdAt: string
}

export function ChangeRequestsView({
  role,
  changeRequests,
  developers,
  eventsByCr,
}: {
  role: string
  changeRequests: CrRow[]
  developers: { id: string; name: string; email: string }[]
  eventsByCr: Record<string, ApprovalEventRow[]>
}) {
  const isFounder = role === 'FOUNDER'
  const [reviewCr, setReviewCr] = useState<CrRow | null>(null)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">Change requests</h1>
        <p className="text-sm text-muted-foreground">
          Client-raised change requests go through founder review before any developer work is created.
        </p>
      </div>

      {changeRequests.length === 0 ? (
        <p className="text-sm text-muted-foreground">No change requests yet.</p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Request</th>
                  <th className="px-4 py-3 font-medium">Project</th>
                  <th className="px-4 py-3 font-medium">Raised by</th>
                  <th className="px-4 py-3 font-medium">Scope impact</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {changeRequests.map((cr) => (
                  <tr key={cr.id} className="border-b last:border-0 hover:bg-accent/40">
                    <td className="max-w-xs px-4 py-3">
                      <p className="font-medium">{cr.title}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(cr.createdAt)}</p>
                      {cr.status === 'CONVERTED_TO_TASK' && cr.linkedTask ? (
                        <Link href={`/app/tasks?project=${cr.linkedTask.projectId}`} className="mt-1 inline-block text-xs text-primary underline">
                          Task: {cr.linkedTask.title}
                        </Link>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/app/projects/${cr.projectId}`} className="hover:underline">
                        {cr.projectName}
                      </Link>
                      <p className="text-xs text-muted-foreground">{cr.clientName}</p>
                    </td>
                    <td className="px-4 py-3">
                      {cr.raisedByName}
                      <p className="text-xs text-muted-foreground">{humanizeStatus(cr.raisedByRole)}</p>
                    </td>
                    <td className="px-4 py-3">{cr.scopeImpact ? <InternalStatusBadge status={cr.scopeImpact} /> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-3">
                      <InternalStatusBadge status={cr.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="min-h-[44px]" onClick={() => setReviewCr(cr)}>
                          <Eye className="h-4 w-4" /> {isFounder ? 'Review' : 'View'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="space-y-3 md:hidden">
            {changeRequests.map((cr) => (
              <Card key={cr.id}>
                <CardContent className="space-y-2 pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold leading-snug">{cr.title}</p>
                    <InternalStatusBadge status={cr.status} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {cr.projectName} · {cr.clientName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Raised by {cr.raisedByName} · {formatDateTime(cr.createdAt)}
                    {cr.scopeImpact ? ` · scope: ${humanizeStatus(cr.scopeImpact)}` : ''}
                  </p>
                  {cr.status === 'CONVERTED_TO_TASK' && cr.linkedTask ? (
                    <Link href={`/app/tasks?project=${cr.linkedTask.projectId}`} className="inline-block text-xs text-primary underline">
                      Task: {cr.linkedTask.title}
                    </Link>
                  ) : null}
                  <Button variant="outline" size="sm" className="min-h-[44px] w-full" onClick={() => setReviewCr(cr)}>
                    <Eye className="h-4 w-4" /> {isFounder ? 'Review' : 'View'}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {reviewCr ? (
        <ReviewDialog
          cr={reviewCr}
          isFounder={isFounder}
          developers={developers}
          events={eventsByCr[reviewCr.id] ?? []}
          onClose={() => setReviewCr(null)}
        />
      ) : null}
    </div>
  )
}

function ReviewDialog({
  cr,
  isFounder,
  developers,
  events,
  onClose,
}: {
  cr: CrRow
  isFounder: boolean
  developers: { id: string; name: string; email: string }[]
  events: ApprovalEventRow[]
  onClose: () => void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [scopeImpact, setScopeImpact] = useState<string>('NONE')
  const [notes, setNotes] = useState(cr.founderNotes ?? '')
  const [assignee, setAssignee] = useState('NONE')

  async function review(action: 'start-review' | 'scope-review' | 'approve' | 'reject') {
    setBusy(action)
    try {
      const res = await fetch(`/api/change-requests/${cr.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          founderNotes: notes.trim() || undefined,
          scopeImpact: action === 'scope-review' ? scopeImpact : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'Review action failed', description: data.error ?? 'Something went wrong', variant: 'destructive' })
        return
      }
      toast({ title: 'Review updated', description: `“${cr.title}” → ${humanizeStatus(data.changeRequest.status)}.` })
      router.refresh()
      if (action !== 'start-review') onClose()
    } finally {
      setBusy(null)
    }
  }

  async function convert() {
    setBusy('convert')
    try {
      const res = await fetch(`/api/change-requests/${cr.id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedToId: assignee === 'NONE' ? null : assignee }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'Could not convert to task', description: data.error ?? 'Something went wrong', variant: 'destructive' })
        return
      }
      toast({ title: 'Converted to task', description: `Task created: “${data.task.title}”.` })
      router.refresh()
      onClose()
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{cr.title}</DialogTitle>
          <DialogDescription>
            {cr.projectName} · {cr.clientName} · raised by {cr.raisedByName} ({humanizeStatus(cr.raisedByRole)}) · {formatDateTime(cr.createdAt)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <InternalStatusBadge status={cr.status} />
            {cr.scopeImpact ? <InternalStatusBadge status={cr.scopeImpact} /> : null}
            {cr.decisionAt ? <span className="text-xs text-muted-foreground">Decided {formatDateTime(cr.decisionAt)}</span> : null}
          </div>

          <div className="rounded-lg border p-3 text-sm">
            <p className="whitespace-pre-wrap">{cr.details}</p>
          </div>

          {cr.status === 'CONVERTED_TO_TASK' && cr.linkedTask ? (
            <p className="text-sm">
              Converted to task:{' '}
              <Link href={`/app/tasks?project=${cr.linkedTask.projectId}`} className="text-primary underline">
                {cr.linkedTask.title}
              </Link>
            </p>
          ) : null}

          {isFounder ? (
            <div className="space-y-3 rounded-lg border border-dashed p-3">
              <p className="text-sm font-medium">Founder review</p>

              {cr.status === 'SUBMITTED' ? (
                <Button onClick={() => review('start-review')} disabled={busy !== null} className="min-h-[44px]">
                  {busy === 'start-review' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Start review
                </Button>
              ) : null}

              {(cr.status === 'UNDER_FOUNDER_REVIEW' || cr.status === 'SCOPE_REVIEWED') && (
                <div className="space-y-3">
                  {cr.status === 'UNDER_FOUNDER_REVIEW' ? (
                    <div className="space-y-1.5">
                      <Label>Scope impact</Label>
                      <Select value={scopeImpact} onValueChange={setScopeImpact}>
                        <SelectTrigger className="min-h-[44px] w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SCOPE_IMPACTS.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s === 'EXTRA_COST_QUOTED' ? 'Extra cost (quoted)' : 'No extra cost'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  <div className="space-y-1.5">
                    <Label htmlFor="cr-notes">Founder notes</Label>
                    <Textarea id="cr-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={4000} className="min-h-[44px]" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {cr.status === 'UNDER_FOUNDER_REVIEW' ? (
                      <Button variant="outline" onClick={() => review('scope-review')} disabled={busy !== null} className="min-h-[44px]">
                        {busy === 'scope-review' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />} Record scope review
                      </Button>
                    ) : null}
                    <Button onClick={() => review('approve')} disabled={busy !== null} className="min-h-[44px]">
                      {busy === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve
                    </Button>
                    <Button variant="destructive" onClick={() => review('reject')} disabled={busy !== null} className="min-h-[44px]">
                      {busy === 'reject' ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Reject
                    </Button>
                  </div>
                </div>
              )}

              {cr.status === 'APPROVED' ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Assign to developer (optional)</Label>
                    <Select value={assignee} onValueChange={setAssignee}>
                      <SelectTrigger className="min-h-[44px] w-full">
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">Unassigned</SelectItem>
                        {developers.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name} ({d.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={convert} disabled={busy !== null} className="min-h-[44px]">
                    {busy === 'convert' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />} Convert to task (HIGH priority)
                  </Button>
                </div>
              ) : null}

              {(cr.status === 'REJECTED' || cr.status === 'CONVERTED_TO_TASK') && cr.founderNotes ? (
                <p className="text-sm text-muted-foreground">Founder notes: {cr.founderNotes}</p>
              ) : null}
            </div>
          ) : (
            cr.founderNotes ? <p className="text-sm text-muted-foreground">Founder notes: {cr.founderNotes}</p> : null
          )}

          {/* Approval event history */}
          <div>
            <p className="mb-2 text-sm font-medium">Approval history</p>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">No approval events yet.</p>
            ) : (
              <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border p-3">
                {events.map((ev) => (
                  <div key={ev.id} className="text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{humanizeStatus(ev.action)}</span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(ev.createdAt)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {ev.actorName}
                      {ev.resultingAction ? ` · ${ev.resultingAction}` : ''}
                    </p>
                    {ev.note ? <p className="text-xs italic text-muted-foreground">“{ev.note}”</p> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="min-h-[44px]">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
