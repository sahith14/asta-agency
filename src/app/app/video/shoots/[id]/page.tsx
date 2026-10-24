'use client'

import { useEffect, useState, useCallback, FormEvent } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { api, fmtDate } from '@/lib/client'
import { StatusBadge } from '@/components/status-badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, ArrowLeft, CalendarDays, Printer, CheckCircle2, XCircle, MapPin } from 'lucide-react'

interface Shoot {
  id: string; reference: string; title: string; date: string; startTime: string; endTime: string; timezone: string
  address: string | null; locationNotes: string | null; status: string; clientContact: string | null
  accessArrangements: string | null; callSheetNotes: string | null; transportNotes: string | null
  budgetedTravelCost: number | null; actualCost: number | null
  attendanceNotes: string | null; completionNotes: string | null; incidentNotes: string | null
  rescheduleReason: string | null; cancelReason: string | null
  project: { id: string; name: string; reference: string; client: { id: string; name: string; contactName: string | null; contactPhone: string | null } }
  manager: { id: string; name: string } | null
  assignments: Array<{ employee: { id: string; name: string; phone: string | null }; crewRole: string }>
  deliverableLinks: Array<{ deliverable: { id: string; title: string; reference: string; status: string; targetPlatform: string | null; aspectRatio: string | null; targetDurationSec: number | null } | null }>
  equipmentReservations: Array<{ item: { id: string; name: string; category: string | null } }>
}

export default function ShootDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [shoot, setShoot] = useState<Shoot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(() => {
    api<{ shoot: Shoot }>(`/api/video/shoots/${id}`).then(d => setShoot(d.shoot)).catch(e => setError(e.message))
  }, [id])
  useEffect(() => { load() }, [load])

  async function complete(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setActionError(null); setBusy(true)
    try {
      await api(`/api/video/shoots/${id}`, { method: 'POST', body: {
        action: 'complete',
        completionNotes: String(fd.get('completion')) || undefined,
        incidentNotes: String(fd.get('incident')) || undefined,
        attendanceNotes: String(fd.get('attendance')) || undefined,
        actualCost: fd.get('actualCost') ? parseFloat(String(fd.get('actualCost'))) : undefined,
      } })
      load()
    } catch (err) { setActionError(err instanceof Error ? err.message : 'Failed') } finally { setBusy(false) }
  }

  async function cancel(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setActionError(null); setBusy(true)
    try {
      await api(`/api/video/shoots/${id}`, { method: 'POST', body: { action: 'cancel', reason: String(fd.get('reason')) } })
      load()
    } catch (err) { setActionError(err instanceof Error ? err.message : 'Failed') } finally { setBusy(false) }
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Cannot open shoot</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => router.push('/app/video/shoots')}><ArrowLeft className="h-4 w-4 mr-1" />Back to calendar</Button>
      </Alert>
    )
  }
  if (!shoot) return <div className="space-y-4"><Skeleton className="h-8 w-80" /><Skeleton className="h-64" /></div>

  const active = ['PLANNED', 'SCHEDULED'].includes(shoot.status)

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => router.push('/app/video/shoots')}><ArrowLeft className="h-4 w-4 mr-1" />Shoot calendar</Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{shoot.title}</h1>
            <p className="text-sm text-muted-foreground">{shoot.reference} · <Link href={`/app/projects/${shoot.project.id}`} className="underline underline-offset-2">{shoot.project.name}</Link> · {shoot.project.client.name}</p>
          </div>
          <div className="flex items-center gap-2">
            {active && (
              <>
                <Dialog>
                  <DialogTrigger asChild><Button size="sm"><CheckCircle2 className="h-4 w-4 mr-1.5" />Record completion</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Record shoot completion</DialogTitle>
                      <DialogDescription>Shoots are never auto-completed by time passing — completion is always recorded manually.</DialogDescription></DialogHeader>
                    <form onSubmit={complete} className="space-y-4">
                      <div className="space-y-1.5"><Label htmlFor="att">Attendance notes</Label><Textarea id="att" name="attendance" rows={2} /></div>
                      <div className="space-y-1.5"><Label htmlFor="comp">Completion notes</Label><Textarea id="comp" name="completion" rows={2} /></div>
                      <div className="space-y-1.5"><Label htmlFor="inc">Incidents / blockers</Label><Textarea id="inc" name="incident" rows={2} /></div>
                      <div className="space-y-1.5"><Label htmlFor="ac">Actual cost (£)</Label><Textarea id="ac" name="actualCost" rows={1} className="h-9" /></div>
                      <DialogFooter><Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Mark completed</Button></DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
                <Dialog>
                  <DialogTrigger asChild><Button size="sm" variant="outline" className="text-destructive"><XCircle className="h-4 w-4 mr-1.5" />Cancel shoot</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Cancel shoot</DialogTitle></DialogHeader>
                    <form onSubmit={cancel} className="space-y-4">
                      <div className="space-y-1.5"><Label htmlFor="reason">Reason (required — client and crew are notified)</Label><Textarea id="reason" name="reason" rows={3} required maxLength={2000} /></div>
                      <DialogFooter><Button type="submit" variant="destructive" disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Cancel shoot</Button></DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </>
            )}
            <Button size="sm" variant="outline" asChild><Link href={`/app/video/shoots/${shoot.id}/call-sheet`} target="_blank"><Printer className="h-4 w-4 mr-1.5" />Call sheet</Link></Button>
            <StatusBadge status={shoot.status} />
          </div>
        </div>
      </div>

      {actionError && <Alert variant="destructive"><AlertTitle>Action failed</AlertTitle><AlertDescription>{actionError}</AlertDescription></Alert>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4" />Schedule & location</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
              <p><span className="text-muted-foreground">Date:</span> <strong>{fmtDate(shoot.date)}</strong></p>
              <p><span className="text-muted-foreground">Time:</span> <strong>{shoot.startTime}–{shoot.endTime}</strong> ({shoot.timezone})</p>
              <p className="sm:col-span-2"><span className="text-muted-foreground">Address:</span> {shoot.address ?? '—'}</p>
              {shoot.locationNotes && <p className="sm:col-span-2"><span className="text-muted-foreground">Location notes:</span> {shoot.locationNotes}</p>}
              {shoot.accessArrangements && <p className="sm:col-span-2"><span className="text-muted-foreground">Access arrangements:</span> {shoot.accessArrangements}</p>}
              {shoot.transportNotes && <p className="sm:col-span-2"><span className="text-muted-foreground">Transport:</span> {shoot.transportNotes}</p>}
              {shoot.clientContact && <p><span className="text-muted-foreground">Client contact:</span> {shoot.clientContact}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Planned deliverables</CardTitle>
              <CardDescription>Deliverables move through their own state machine — a shoot date alone never marks them shot.</CardDescription></CardHeader>
            <CardContent>
              {shoot.deliverableLinks.length === 0 ? <p className="text-sm text-muted-foreground py-4 text-center">No deliverables linked to this shoot.</p> : (
                <div className="space-y-2">
                  {shoot.deliverableLinks.map((l, i) => l.deliverable && (
                    <Link key={i} href={`/app/video/deliverables/${l.deliverable.id}`} className="flex items-center gap-3 rounded-lg border p-3 hover:border-primary/40">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{l.deliverable.title}</p>
                        <p className="text-xs text-muted-foreground">{l.deliverable.reference} · {l.deliverable.targetPlatform ?? '—'} · {l.deliverable.aspectRatio ?? '—'}{l.deliverable.targetDurationSec ? ` · ${l.deliverable.targetDurationSec}s` : ''}</p>
                      </div>
                      <StatusBadge status={l.deliverable.status} />
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {(shoot.completionNotes || shoot.attendanceNotes || shoot.incidentNotes) && (
            <Card>
              <CardHeader><CardTitle className="text-base">Completion record</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-2">
                {shoot.attendanceNotes && <p><span className="text-muted-foreground">Attendance:</span> {shoot.attendanceNotes}</p>}
                {shoot.completionNotes && <p><span className="text-muted-foreground">Completion:</span> {shoot.completionNotes}</p>}
                {shoot.incidentNotes && <p className="text-rose-700"><span className="text-muted-foreground">Incidents:</span> {shoot.incidentNotes}</p>}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Crew</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {shoot.manager && <p><strong>{shoot.manager.name}</strong> <span className="text-muted-foreground">· Shoot manager</span></p>}
              {shoot.assignments.filter(a => a.crewRole !== 'MANAGER').map(a => (
                <p key={a.employee.id}><strong>{a.employee.name}</strong> <span className="text-muted-foreground">· {a.crewRole}</span>{a.employee.phone ? <span className="block text-xs text-muted-foreground">{a.employee.phone}</span> : null}</p>
              ))}
              {shoot.assignments.length === 0 && !shoot.manager && <p className="text-muted-foreground">No crew assigned.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Equipment</CardTitle></CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              {shoot.equipmentReservations.length === 0 ? <p className="text-muted-foreground">No equipment reserved.</p> :
                shoot.equipmentReservations.map(r => (
                  <p key={r.item.id} className="flex items-center gap-2"><MapPin className="h-3 w-3 text-muted-foreground" />{r.item.name} <span className="text-muted-foreground text-xs">({r.item.category ?? 'kit'})</span></p>
                ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Costs</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              <p><span className="text-muted-foreground">Budgeted travel:</span> {shoot.budgetedTravelCost !== null ? `£${shoot.budgetedTravelCost.toFixed(2)}` : '—'}</p>
              <p><span className="text-muted-foreground">Actual cost:</span> {shoot.actualCost !== null ? `£${shoot.actualCost.toFixed(2)}` : '—'}</p>
            </CardContent>
          </Card>

          {shoot.cancelReason && (
            <Alert variant="destructive"><AlertTitle>Shoot cancelled</AlertTitle><AlertDescription>{shoot.cancelReason}</AlertDescription></Alert>
          )}
        </div>
      </div>
    </div>
  )
}
