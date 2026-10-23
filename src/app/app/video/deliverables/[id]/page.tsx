'use client'

import { useEffect, useState, useCallback, FormEvent } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { api, fmtDate, fmtDateTime } from '@/lib/client'
import { StatusBadge } from '@/components/status-badge'
import { useMe } from '@/components/app-shell'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, ArrowLeft, GitBranch, FileText, ArrowRightCircle, Send } from 'lucide-react'

interface Version {
  id: string; versionNumber: number; previewReference: string | null; uploadedByName: string | null
  changeSummary: string | null; reviewStatus: string; internalFeedback: string | null; approvedAt: string | null; createdAt: string
  comments: Array<{ id: string; authorName: string; authorType: string; body: string; timecode: string | null; createdAt: string }>
}

interface Brief {
  id: string; versionNumber: number; approvalStatus: string; createdAt: string
  content: Record<string, string | number | undefined>
}

interface Deliverable {
  id: string; reference: string; title: string; description: string | null; category: string
  status: string; priority: string; targetPlatform: string | null; aspectRatio: string | null
  targetDurationSec: number | null; videographerId: string | null; editorId: string | null
  plannedShootDate: string | null; deadline: string | null; revisionCount: number; revisionAllowance: number
  footageBackupVerified: boolean; blockers: string | null; internalNotes: string | null; clientNotes: string | null
  currentVersionNumber: number; deliveredAt: string | null; deliveryReference: string | null
  cancelReason: string | null; replacesId: string | null; isReplacement: boolean
  project: { id: string; name: string; reference: string; client: { id: string; name: string } }
  videographer: { id: string; name: string } | null
  editor: { id: string; name: string } | null
  replaces: { id: string; reference: string; title: string } | null
  replacedBy: Array<{ id: string; reference: string; title: string }>
  shootLinks: Array<{ session: { id: string; reference: string; title: string; date: string; status: string } }>
}

const NEXT_ACTIONS: Record<string, Array<{ to: string; label: string }>> = {
  PLANNED: [{ to: 'SCHEDULED', label: 'Schedule' }],
  SCHEDULED: [{ to: 'SHOT', label: 'Mark shot' }],
  SHOT: [{ to: 'FOOTAGE_READY', label: 'Mark footage ready' }],
  FOOTAGE_READY: [{ to: 'EDITING', label: 'Start editing' }],
  EDITING: [{ to: 'INTERNAL_REVIEW', label: 'Submit for internal review' }],
  REVISION_REQUIRED: [{ to: 'EDITING', label: 'Resume editing' }],
  APPROVED: [{ to: 'DELIVERED', label: 'Mark delivered' }],
}

export default function DeliverableDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { me } = useMe()
  const [d, setD] = useState<Deliverable | null>(null)
  const [versions, setVersions] = useState<Version[]>([])
  const [briefs, setBriefs] = useState<Brief[]>([])
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api<{ deliverable: Deliverable }>(`/api/video/deliverables/${id}`).then(x => { setD(x.deliverable) }).catch(e => setError(e.message))
    api<{ versions: Version[] }>(`/api/video/deliverables/${id}/versions`).then(x => setVersions(x.versions)).catch(() => {})
  }, [id])

  useEffect(() => { load() }, [load])

  async function transition(to: string, reason?: string) {
    setActionError(null); setBusy(true)
    try {
      await api(`/api/video/deliverables/${id}/transition`, { method: 'POST', body: { to, reason } })
      load()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Transition failed')
    } finally { setBusy(false) }
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Cannot open deliverable</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => router.push('/app/video/deliverables')}><ArrowLeft className="h-4 w-4 mr-1" />Back to tracker</Button>
      </Alert>
    )
  }
  if (!d) return <div className="space-y-4"><Skeleton className="h-8 w-96" /><Skeleton className="h-40" /><Skeleton className="h-64" /></div>

  const role = me?.role
  const isManager = ['OWNER', 'CLIENT_MANAGER'].includes(role ?? '')
  const isReviewer = ['OWNER', 'CREATIVE_DIRECTOR', 'CLIENT_MANAGER'].includes(role ?? '')
  const canRegisterVersion = ['EDITING', 'REVISION_REQUIRED'].includes(d.status) && (isManager || d.editorId === me?.userId)
  const nextActions = NEXT_ACTIONS[d.status] ?? []
  const footageVerifiedNeeded = d.status === 'SHOT' && !d.footageBackupVerified

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => router.push('/app/video/deliverables')}>
          <ArrowLeft className="h-4 w-4 mr-1" />Deliverables tracker
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{d.title}</h1>
            <p className="text-sm text-muted-foreground">
              {d.reference} · <Link href={`/app/projects/${d.project.id}`} className="underline underline-offset-2">{d.project.name}</Link> · {d.project.client.name}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={d.status} />
            {d.deadline && <span className={`text-xs ${d.deadline && new Date(d.deadline) < new Date() && !['DELIVERED', 'CANCELLED'].includes(d.status) ? 'text-rose-600 font-semibold' : 'text-muted-foreground'}`}>Due {fmtDate(d.deadline)}</span>}
          </div>
        </div>
      </div>

      {actionError && <Alert variant="destructive"><AlertTitle>Action failed</AlertTitle><AlertDescription>{actionError}</AlertDescription></Alert>}
      {footageVerifiedNeeded && (
        <Alert>
          <AlertTitle>Footage backup verification required</AlertTitle>
          <AlertDescription>Verify the footage backup below before marking footage ready.</AlertDescription>
        </Alert>
      )}

      {/* Next actions bar */}
      {(nextActions.length > 0 || canRegisterVersion) && (
        <Card>
          <CardContent className="py-4 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium mr-2">Next actions:</span>
            {footageVerifiedNeeded && isManager === false && (role === 'VIDEOGRAPHER' || isManager) && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => api(`/api/video/deliverables/${id}`, { method: 'PATCH', body: { footageBackupVerified: true } }).then(load)}>
                Verify footage backup
              </Button>
            )}
            {footageVerifiedNeeded && isManager && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => api(`/api/video/deliverables/${id}`, { method: 'PATCH', body: { footageBackupVerified: true } }).then(load)}>
                Verify footage backup
              </Button>
            )}
            {nextActions.map(a => (
              <Button key={a.to} size="sm" disabled={busy || (a.to === 'FOOTAGE_READY' && !d.footageBackupVerified)} onClick={() => transition(a.to)}>
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRightCircle className="h-4 w-4 mr-1.5" />}{a.label}
              </Button>
            ))}
            {canRegisterVersion && <RegisterVersionDialog deliverableId={id} nextVersion={d.currentVersionNumber + 1} onDone={load} />}
            {['PLANNED', 'SCHEDULED'].includes(d.status) && isManager && (
              <CancelDialog deliverableId={id} onDone={load} />
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Versions & reviews */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><GitBranch className="h-4 w-4" />Edit versions & reviews</CardTitle>
              <CardDescription>Approvals bind to a specific version. A replacement version requires a new review — prior feedback is preserved.</CardDescription>
            </CardHeader>
            <CardContent>
              {versions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No edit versions registered yet.</p>
              ) : (
                <div className="space-y-3">
                  {versions.map(v => (
                    <div key={v.id} className="rounded-lg border p-4 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">v{v.versionNumber} {v.changeSummary ? <span className="font-normal text-muted-foreground">— {v.changeSummary}</span> : null}</p>
                          <p className="text-xs text-muted-foreground">Uploaded by {v.uploadedByName ?? '—'} · {fmtDateTime(v.createdAt)}</p>
                        </div>
                        <StatusBadge status={v.reviewStatus} />
                      </div>
                      {v.previewReference && (
                        <p className="text-xs"><span className="text-muted-foreground">Preview:</span> <a href={v.previewReference} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 break-all">{v.previewReference}</a></p>
                      )}
                      {v.internalFeedback && <p className="text-xs rounded bg-muted px-3 py-2"><strong>Internal review:</strong> {v.internalFeedback}</p>}
                      {v.comments.length > 0 && (
                        <div className="space-y-1.5">
                          {v.comments.map(c => (
                            <p key={c.id} className="text-xs rounded bg-muted px-3 py-1.5">
                              <strong>{c.authorName}</strong>{c.timecode ? <span className="text-muted-foreground"> @ {c.timecode}</span> : null}: {c.body}
                            </p>
                          ))}
                        </div>
                      )}
                      {v.reviewStatus === 'PENDING_INTERNAL' && isReviewer && (
                        <InternalReviewDialog versionId={v.id} onDone={load} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Creative briefs */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" />Creative brief history</CardTitle>
              <CardDescription>Versioned briefs show which instructions applied during production.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <BriefFormDialog deliverableId={id} nextVersion={(briefs[0]?.versionNumber ?? 0) + 1} onDone={load} canEdit={['OWNER', 'CLIENT_MANAGER', 'CREATIVE_DIRECTOR', 'VIDEO_EDITOR'].includes(role ?? '')} />
              {briefs.length === 0 ? <p className="text-sm text-muted-foreground py-2">No brief versions yet.</p> : briefs.map(b => (
                <div key={b.id} className="rounded-lg border p-4 text-sm space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">Brief v{b.versionNumber} <span className="font-normal text-muted-foreground text-xs">· {fmtDateTime(b.createdAt)}</span></p>
                    <StatusBadge status={b.approvalStatus === 'DRAFT' ? 'TODO' : b.approvalStatus === 'INTERNAL_APPROVED' ? 'REVIEW' : 'APPROVED'} />
                  </div>
                  <div className="grid gap-1 sm:grid-cols-2 text-xs text-muted-foreground">
                    {b.content.objective && <p><strong>Objective:</strong> {b.content.objective}</p>}
                    {b.content.audience && <p><strong>Audience:</strong> {b.content.audience}</p>}
                    {b.content.keyMessage && <p><strong>Key message:</strong> {b.content.keyMessage}</p>}
                    {b.content.hook && <p><strong>Hook:</strong> {b.content.hook}</p>}
                    {b.content.musicDirection && <p><strong>Music:</strong> {b.content.musicDirection}</p>}
                    {b.content.callToAction && <p><strong>CTA:</strong> {b.content.callToAction}</p>}
                  </div>
                  {b.content.script && <div className="rounded bg-muted p-3 text-xs whitespace-pre-wrap max-h-40 overflow-y-auto">{b.content.script}</div>}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Production details</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              <p><span className="text-muted-foreground">Category:</span> {d.category.replaceAll('_', ' ')}</p>
              <p><span className="text-muted-foreground">Platform:</span> {d.targetPlatform ?? '—'} · <span className="text-muted-foreground">Format:</span> {d.aspectRatio ?? '—'}{d.targetDurationSec ? ` · ${d.targetDurationSec}s` : ''}</p>
              <p><span className="text-muted-foreground">Videographer:</span> {d.videographer?.name ?? 'Unassigned'}</p>
              <p><span className="text-muted-foreground">Editor:</span> {d.editor?.name ?? 'Unassigned'}</p>
              <p><span className="text-muted-foreground">Planned shoot:</span> {fmtDate(d.plannedShootDate)}</p>
              <p><span className="text-muted-foreground">Revisions:</span> {d.revisionCount} / {d.revisionAllowance} used</p>
              <p><span className="text-muted-foreground">Footage backup verified:</span> {d.footageBackupVerified ? 'Yes' : 'No'}</p>
              {d.isReplacement && d.replaces && <p className="text-xs pt-2 border-t"><span className="text-muted-foreground">Replaces:</span> <Link href={`/app/video/deliverables/${d.replaces.id}`} className="underline">{d.replaces.title}</Link></p>}
              {d.cancelReason && <p className="text-xs text-rose-700"><span className="text-muted-foreground">Cancel reason:</span> {d.cancelReason}</p>}
              {d.deliveredAt && <p className="text-xs pt-2 border-t"><span className="text-muted-foreground">Delivered:</span> {fmtDateTime(d.deliveredAt)}{d.deliveryReference ? ` · ${d.deliveryReference}` : ''}</p>}
            </CardContent>
          </Card>

          {d.shootLinks.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Linked shoots</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {d.shootLinks.map(l => (
                  <Link key={l.session.id} href={`/app/video/shoots/${l.session.id}`} className="block rounded-md border px-3 py-2 hover:border-primary/40">
                    <p className="text-sm font-medium truncate">{l.session.title}</p>
                    <p className="text-xs text-muted-foreground">{fmtDate(l.session.date)} · {l.session.status}</p>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {isManager && (
            <Card>
              <CardHeader><CardTitle className="text-base">Internal notes</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{d.internalNotes ?? '—'}</p>
                <p className="text-[11px] text-muted-foreground mt-2">Client-facing notes: {d.clientNotes ?? '—'}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function RegisterVersionDialog({ deliverableId, nextVersion, onDone }: { deliverableId: string; nextVersion: number; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setErr(null); setBusy(true)
    try {
      await api(`/api/video/deliverables/${deliverableId}/versions`, { method: 'POST', body: {
        previewReference: String(fd.get('preview')) || undefined,
        changeSummary: String(fd.get('summary')) || undefined,
        submitForInternalReview: true,
      } })
      setOpen(false); onDone()
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'Failed') } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><Send className="h-4 w-4 mr-1.5" />Register edit v{nextVersion}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Register edit version & submit for internal review</DialogTitle>
          <DialogDescription>Editors cannot bypass internal review. The internal reviewer then sends it to the client.</DialogDescription></DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}
          <div className="space-y-1.5"><Label htmlFor="v-preview">Preview reference (link)</Label><Input id="v-preview" name="preview" type="url" placeholder="https://…" /></div>
          <div className="space-y-1.5"><Label htmlFor="v-summary">Change summary</Label><Textarea id="v-summary" name="summary" rows={2} maxLength={2000} /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Register & submit</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function InternalReviewDialog({ versionId, onDone }: { versionId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function decide(decision: 'INTERNAL_APPROVED' | 'INTERNAL_REJECTED', feedback: string) {
    setErr(null); setBusy(true)
    try {
      await api(`/api/video/versions/${versionId}`, { method: 'POST', body: { decision: decision === 'INTERNAL_APPROVED' ? 'INTERNAL_APPROVED' : 'INTERNAL_REJECTED', feedback: feedback || undefined } })
      setOpen(false); onDone()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm">Review this version</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Internal quality review</DialogTitle></DialogHeader>
        {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}
        <InternalReviewForm busy={busy} onSubmit={decide} onCancel={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

function InternalReviewForm({ busy, onSubmit, onCancel }: { busy: boolean; onSubmit: (d: 'INTERNAL_APPROVED' | 'INTERNAL_REJECTED', f: string) => void; onCancel: () => void }) {
  const [feedback, setFeedback] = useState('')
  return (
    <div className="space-y-4">
      <div className="space-y-1.5"><Label htmlFor="ir-feedback">Review notes (QC checklist: aspect ratio, audio, colour, captions, branding, music rights, duration, CTA, brief compliance, playback)</Label>
        <Textarea id="ir-feedback" rows={3} value={feedback} onChange={e => setFeedback(e.target.value)} maxLength={4000} /></div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button variant="destructive" disabled={busy} onClick={() => onSubmit('INTERNAL_REJECTED', feedback)}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Reject → back to editing</Button>
        <Button disabled={busy} onClick={() => onSubmit('INTERNAL_APPROVED', feedback)}>Approve → send to client</Button>
      </DialogFooter>
    </div>
  )
}

function BriefFormDialog({ deliverableId, nextVersion, onDone, canEdit }: { deliverableId: string; nextVersion: number; onDone: () => void; canEdit: boolean }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  if (!canEdit) return null

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setErr(null); setBusy(true)
    try {
      await api(`/api/video/deliverables/${deliverableId}/brief`, { method: 'POST', body: {
        objective: String(fd.get('objective')) || undefined,
        audience: String(fd.get('audience')) || undefined,
        keyMessage: String(fd.get('keyMessage')) || undefined,
        hook: String(fd.get('hook')) || undefined,
        script: String(fd.get('script')) || undefined,
        musicDirection: String(fd.get('music')) || undefined,
        callToAction: String(fd.get('cta')) || undefined,
      } })
      setOpen(false); onDone()
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'Failed') } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><FileText className="h-4 w-4 mr-1.5" />New brief v{nextVersion}</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Creative brief v{nextVersion}</DialogTitle></DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="b-objective">Objective</Label><Input id="b-objective" name="objective" /></div>
            <div className="space-y-1.5"><Label htmlFor="b-audience">Audience</Label><Input id="b-audience" name="audience" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="b-key">Key message</Label><Input id="b-key" name="keyMessage" /></div>
            <div className="space-y-1.5"><Label htmlFor="b-hook">Hook / opening</Label><Input id="b-hook" name="hook" /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="b-script">Script / shot sequence</Label><Textarea id="b-script" name="script" rows={5} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="b-music">Music direction</Label><Input id="b-music" name="music" /></div>
            <div className="space-y-1.5"><Label htmlFor="b-cta">Call to action</Label><Input id="b-cta" name="cta" /></div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save brief version</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CancelDialog({ deliverableId, onDone }: { deliverableId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setErr(null); setBusy(true)
    try {
      await api(`/api/video/deliverables/${deliverableId}/transition`, { method: 'POST', body: { to: 'CANCELLED', reason: String(fd.get('reason')) } })
      setOpen(false); onDone()
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'Failed') } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="ghost" className="text-destructive">Cancel deliverable</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Cancel deliverable</DialogTitle>
          <DialogDescription>A replacement can be created afterwards — the cancelled record is preserved for the audit trail.</DialogDescription></DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}
          <div className="space-y-1.5"><Label htmlFor="c-reason">Reason (required)</Label><Textarea id="c-reason" name="reason" rows={2} required maxLength={2000} /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Keep</Button>
            <Button type="submit" variant="destructive" disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Cancel deliverable</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
