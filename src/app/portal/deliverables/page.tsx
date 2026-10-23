'use client'

import { useEffect, useState, FormEvent } from 'react'
import { api, fmtDate, fmtDateTime } from '@/lib/client'
import { StatusBadge } from '@/components/status-badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { Eye, CheckCircle2, RotateCcw, ExternalLink, Loader2 } from 'lucide-react'

interface PortalDeliverable {
  id: string; reference: string; title: string; status: string; platform: string | null
  aspectRatio: string | null; targetDurationSec: number | null; clientNotes: string | null
  deadline: string | null; deliveredAt: string | null; deliveryReference: string | null
  project: { id: string; name: string; reference: string }
  versions: Array<{
    id: string; versionNumber: number; previewReference: string | null; changeSummary: string | null
    reviewStatus: string; approvedAt: string | null
    myComments: Array<{ id: string; body: string; timecode: string | null; at: string }>
  }>
}

export default function PortalDeliverablesPage() {
  const { toast } = useToast()
  const [items, setItems] = useState<PortalDeliverable[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => api<{ deliverables: PortalDeliverable[] }>('/api/portal/deliverables').then(d => setItems(d.deliverables)).catch(e => setError(e.message))
  useEffect(() => { load() }, [])

  async function decide(versionId: string, decision: 'APPROVED' | 'REVISION_REQUESTED', comment: string, timecode?: string) {
    setBusy(true)
    try {
      await api('/api/portal/overview', { method: 'POST', body: { versionId, decision, comment: comment || undefined, timecode } })
      toast({ title: decision === 'APPROVED' ? 'Version approved' : 'Revision requested', description: 'Your production team has been notified.' })
      load()
    } catch (err) {
      toast({ title: 'Action failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' })
    } finally { setBusy(false) }
  }

  if (error) return <Alert variant="destructive"><AlertTitle>Failed to load</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
  if (!items) return <div className="space-y-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32" />)}</div>

  const inReview = items.filter(d => d.versions.some(v => v.reviewStatus === 'PENDING_CLIENT'))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Video reviews</h1>
        <p className="text-muted-foreground text-sm">Watch the preview, then approve a specific version or request changes. Approvals always bind to one version.</p>
      </div>

      {items.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground"><Eye className="h-10 w-10 mx-auto mb-3 opacity-30" /><p className="font-medium">Nothing to review yet</p><p className="text-sm mt-1">When your editor shares a cut, it will appear here.</p></CardContent></Card>
      ) : (
        <div className="space-y-4">
          {items.map(d => {
            const pending = d.versions.find(v => v.reviewStatus === 'PENDING_CLIENT')
            return (
              <Card key={d.id} className={pending ? 'border-primary/40' : ''}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{d.title}</CardTitle>
                      <CardDescription>{d.reference} · {d.project.name} · {d.platform ?? '—'} {d.aspectRatio ? `· ${d.aspectRatio}` : ''}{d.targetDurationSec ? ` · ${d.targetDurationSec}s` : ''}</CardDescription>
                    </div>
                    <StatusBadge status={d.status} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {d.clientNotes && <p className="text-sm rounded-lg bg-muted px-3 py-2">{d.clientNotes}</p>}
                  {pending && (
                    <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
                      <p className="text-sm font-semibold mb-1">Version {pending.versionNumber} awaiting your review</p>
                      {pending.changeSummary && <p className="text-sm text-muted-foreground mb-2">{pending.changeSummary}</p>}
                      {pending.previewReference && (
                        <a href={pending.previewReference} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary underline underline-offset-4 mb-3">
                          <ExternalLink className="h-3.5 w-3.5" />Open preview
                        </a>
                      )}
                      <ReviewDialog busy={busy} onDecide={(decision, comment, timecode) => decide(pending.id, decision, comment, timecode)} />
                    </div>
                  )}
                  {d.versions.filter(v => v.reviewStatus !== 'PENDING_CLIENT').map(v => (
                    <div key={v.id} className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">v{v.versionNumber}{v.changeSummary ? <span className="text-muted-foreground font-normal"> — {v.changeSummary}</span> : null}</p>
                        <p className="text-xs text-muted-foreground">{v.approvedAt ? `Approved ${fmtDateTime(v.approvedAt)}` : ''}</p>
                        {v.myComments.map(c => (
                          <p key={c.id} className="text-xs text-muted-foreground mt-0.5">Your feedback{c.timecode ? ` @ ${c.timecode}` : ''}: {c.body}</p>
                        ))}
                      </div>
                      {v.previewReference && <a href={v.previewReference} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline underline-offset-2">Preview ↗</a>}
                      <StatusBadge status={v.reviewStatus} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {inReview.length > 0 && <p className="text-xs text-muted-foreground">{inReview.length} version{inReview.length > 1 ? 's' : ''} awaiting your review.</p>}
    </div>
  )
}

function ReviewDialog({ busy, onDecide }: { busy: boolean; onDecide: (d: 'APPROVED' | 'REVISION_REQUESTED', comment: string, timecode?: string) => void }) {
  const [open, setOpen] = useState(false)
  const [comment, setComment] = useState('')
  const [timecode, setTimecode] = useState('')

  function submit(decision: 'APPROVED' | 'REVISION_REQUESTED') {
    onDecide(decision, comment.trim(), timecode.trim() || undefined)
    setComment(''); setTimecode('')
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm">Review this version</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Review decision</DialogTitle>
          <DialogDescription>Approving locks this version. Requesting a revision sends it back to the editor — describe what you&apos;d like changed.</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-2">
            <div className="col-span-3 space-y-1.5"><Label htmlFor="rv-comment">Feedback (required for revisions)</Label><Textarea id="rv-comment" rows={3} value={comment} onChange={e => setComment(e.target.value)} placeholder="e.g. Love the opening, please swap the music after the first shot…" /></div>
            <div className="space-y-1.5"><Label htmlFor="rv-time">Timecode</Label><Input id="rv-time" value={timecode} onChange={e => setTimecode(e.target.value)} placeholder="0:12" /></div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="secondary" disabled={busy || !comment.trim()} onClick={() => submit('REVISION_REQUESTED')}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1.5" />}Request revision
            </Button>
            <Button disabled={busy} onClick={() => submit('APPROVED')}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}Approve version
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
