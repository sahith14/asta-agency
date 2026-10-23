'use client'

import { useEffect, useState, useMemo, FormEvent } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { api, fmtDate } from '@/lib/client'
import { StatusBadge } from '@/components/status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { ChevronLeft, ChevronRight, Plus, CalendarDays, MapPin, Loader2, AlertTriangle } from 'lucide-react'

interface Shoot {
  id: string; reference: string; title: string; date: string; startTime: string; endTime: string; status: string
  address: string | null
  project: { id: string; name: string; reference: string; client: { name: string } }
  assignments: Array<{ employee: { id: string; name: string } }>
  deliverableLinks: Array<{ deliverable: { id: string; title: string; status: string } | null }>
  equipmentReservations: Array<{ item: { id: string; name: string } }>
}

function monthDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const start = new Date(first)
  start.setDate(1 - first.getDay())
  return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
}

export default function ShootCalendarPage() {
  const searchParams = useSearchParams()
  const presetProject = searchParams.get('projectId')
  const [cursor, setCursor] = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() } })
  const [shoots, setShoots] = useState<Shoot[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'month' | 'list'>('month')

  useEffect(() => {
    const from = new Date(cursor.y, cursor.m, 1)
    const to = new Date(cursor.y, cursor.m + 1, 0, 23, 59, 59)
    const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })
    if (presetProject) params.set('projectId', presetProject)
    api<{ shoots: Shoot[] }>(`/api/video/shoots?${params}`).then(d => setShoots(d.shoots)).catch(e => setError(e.message))
  }, [cursor, presetProject])

  const byDay = useMemo(() => {
    const map = new Map<string, Shoot[]>()
    for (const s of shoots ?? []) {
      const key = new Date(s.date).toDateString()
      map.set(key, [...(map.get(key) ?? []), s])
    }
    return map
  }, [shoots])

  const days = monthDays(cursor.y, cursor.m)
  const today = new Date().toDateString()

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><CalendarDays className="h-6 w-6 text-primary" /> Shoot Calendar</h1>
          <p className="text-muted-foreground text-sm">Production scheduling with crew and equipment conflict detection.</p>
        </div>
        <ScheduleShootDialog presetProjectId={presetProject} onDone={() => {
          const from = new Date(cursor.y, cursor.m, 1); const to = new Date(cursor.y, cursor.m + 1, 0, 23, 59, 59)
          api<{ shoots: Shoot[] }>(`/api/video/shoots?from=${from.toISOString()}&to=${to.toISOString()}${presetProject ? `&projectId=${presetProject}` : ''}`).then(d => setShoots(d.shoots)).catch(() => {})
        }} />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => setCursor(c => ({ y: c.m === 0 ? c.y - 1 : c.y, m: c.m === 0 ? 11 : c.m - 1 }))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" aria-label="Next month" onClick={() => setCursor(c => ({ y: c.m === 11 ? c.y + 1 : c.y, m: c.m === 11 ? 0 : c.m + 1 }))}><ChevronRight className="h-4 w-4" /></Button>
          <span className="font-semibold min-w-40">{new Date(cursor.y, cursor.m).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span>
        </div>
        <div className="flex gap-1 rounded-lg border p-1">
          {(['month', 'list'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1 text-sm rounded-md ${view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              aria-pressed={view === v}>{v === 'month' ? 'Month' : 'List'}</button>
          ))}
        </div>
      </div>

      {error && <Alert variant="destructive"><AlertTitle>Failed to load</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {!error && !shoots && <Skeleton className="h-[480px]" />}

      {shoots && view === 'month' && (
        <Card>
          <CardContent className="p-2 sm:p-4">
            <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <div key={d} className="bg-muted px-2 py-1.5 text-[11px] font-semibold text-muted-foreground text-center">{d}</div>
              ))}
              {days.map(day => {
                const dayShoots = byDay.get(day.toDateString()) ?? []
                const inMonth = day.getMonth() === cursor.m
                return (
                  <div key={day.toISOString()} className={`bg-background min-h-20 sm:min-h-28 p-1.5 ${inMonth ? '' : 'opacity-40'}`}>
                    <p className={`text-xs mb-1 ${day.toDateString() === today ? 'bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center font-bold' : 'text-muted-foreground'}`}>
                      {day.getDate()}
                    </p>
                    <div className="space-y-1">
                      {dayShoots.map(s => (
                        <Link key={s.id} href={`/app/video/shoots/${s.id}`}
                          className={`block rounded px-1.5 py-1 text-[11px] leading-tight border ${s.status === 'CANCELLED' ? 'bg-zinc-100 border-zinc-200 text-zinc-500 line-through' : s.status === 'COMPLETED' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-primary/10 border-primary/30 hover:bg-primary/20'}`}>
                          <span className="font-semibold">{s.startTime}</span> {s.title}
                        </Link>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {shoots && view === 'list' && (
        <div className="space-y-2">
          {shoots.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No shoots this month</p>
              <p className="text-sm mt-1">Schedule a shoot to see it here.</p>
            </CardContent></Card>
          ) : shoots.map(s => (
            <Link key={s.id} href={`/app/video/shoots/${s.id}`}>
              <Card className="hover:border-primary/40 transition-colors">
                <CardContent className="py-4 flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{s.title}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <CalendarDays className="h-3 w-3" />{fmtDate(s.date)} · {s.startTime}–{s.endTime}
                      {s.address && <><MapPin className="h-3 w-3 ml-1" />{s.address.slice(0, 40)}</>}
                    </p>
                    <p className="text-xs text-muted-foreground">{s.project.name} · {s.project.client.name} · crew: {s.assignments.map(a => a.employee.name).join(', ') || 'none'}</p>
                  </div>
                  <StatusBadge status={s.status} />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function ScheduleShootDialog({ presetProjectId, onDone }: { presetProjectId?: string | null; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [conflicts, setConflicts] = useState<string[]>([])
  const [projects, setProjects] = useState<Array<{ id: string; name: string; reference: string }>>([])
  const [team, setTeam] = useState<Array<{ id: string; name: string; role: string }>>([])
  const [equipment, setEquipment] = useState<Array<{ id: string; name: string }>>([])
  const [projectId, setProjectId] = useState(presetProjectId ?? '')
  const [crew, setCrew] = useState<string[]>([])
  const [items, setItems] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    api<{ projects: Array<{ id: string; name: string; reference: string }> }>('/api/projects?serviceType=VIDEO_PRODUCTION&pageSize=100').then(d => setProjects(d.projects)).catch(() => {})
    api<{ employees: Array<{ id: string; name: string; role: string }> }>('/api/team?pageSize=100').then(d => setTeam(d.employees.filter(e => ['VIDEOGRAPHER', 'CLIENT_MANAGER', 'OWNER', 'CREATIVE_DIRECTOR'].includes(e.role)))).catch(() => {})
    api<{ items: Array<{ id: string; name: string }> }>('/api/video/equipment').then(d => setEquipment(d.items)).catch(() => {})
  }, [open])

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setErr(null); setConflicts([]); setBusy(true)
    try {
      const res = await api<{ shoot: { id: string }; conflicts: string[] }>('/api/video/shoots', { method: 'POST', body: {
        projectId, title: String(fd.get('title')),
        date: new Date(String(fd.get('date')) + 'T00:00:00').toISOString(),
        startTime: String(fd.get('startTime')), endTime: String(fd.get('endTime')),
        address: String(fd.get('address')) || undefined,
        clientContact: String(fd.get('contact')) || undefined,
        callSheetNotes: String(fd.get('notes')) || undefined,
        managerId: crew.includes('__manager__') ? undefined : undefined,
        videographerIds: crew, equipmentItemIds: items,
        deliverableIds: fd.getAll('deliverable') as string[],
      } })
      setOpen(false); setCrew([]); setItems([]); onDone()
      if (res.conflicts.length) setConflicts(res.conflicts)
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Failed to schedule shoot')
    } finally { setBusy(false) }
  }

  const videographers = team.filter(t => t.role === 'VIDEOGRAPHER' || t.role === 'OWNER')
  const selectedProject = projects.find(p => p.id === projectId)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Schedule shoot</Button></DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Schedule shoot session</DialogTitle>
          <DialogDescription>One shoot can cover multiple deliverables. Conflicts are flagged before saving.</DialogDescription></DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}
          {conflicts.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Scheduling conflicts detected (from last save)</AlertTitle>
              <AlertDescription><ul className="list-disc pl-4">{conflicts.map((c, i) => <li key={i}>{c}</li>)}</ul></AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label>Video project</Label>
            <Select value={projectId || undefined} onValueChange={setProjectId} required>
              <SelectTrigger aria-label="Video project"><SelectValue placeholder="Select project" /></SelectTrigger>
              <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="sh-title">Shoot title</Label><Input id="sh-title" name="title" required maxLength={160} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label htmlFor="sh-date">Date</Label><Input id="sh-date" name="date" type="date" required /></div>
            <div className="space-y-1.5"><Label htmlFor="sh-start">Start</Label><Input id="sh-start" name="startTime" type="time" required defaultValue="09:00" /></div>
            <div className="space-y-1.5"><Label htmlFor="sh-end">End</Label><Input id="sh-end" name="endTime" type="time" required defaultValue="13:00" /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="sh-address">Location address</Label><Input id="sh-address" name="address" maxLength={400} /></div>
          <div className="space-y-1.5"><Label htmlFor="sh-contact">Client contact on site</Label><Input id="sh-contact" name="contact" maxLength={120} /></div>
          {videographers.length > 0 && (
            <div className="space-y-1.5">
              <Label>Crew (videographers)</Label>
              <div className="space-y-1.5 max-h-32 overflow-y-auto border rounded-md p-3">
                {videographers.map(v => (
                  <label key={v.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={crew.includes(v.id)} onCheckedChange={(c) => setCrew(prev => c ? [...prev, v.id] : prev.filter(x => x !== v.id))} />
                    {v.name} <span className="text-muted-foreground text-xs">({v.role.replaceAll('_', ' ')})</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {selectedProject && (
            <ProjectDeliverables projectId={projectId} />
          )}
          {equipment.length > 0 && (
            <div className="space-y-1.5">
              <Label>Equipment reservations</Label>
              <div className="space-y-1.5 max-h-32 overflow-y-auto border rounded-md p-3">
                {equipment.map(item => (
                  <label key={item.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={items.includes(item.id)} onCheckedChange={(c) => setItems(prev => c ? [...prev, item.id] : prev.filter(x => x !== item.id))} />
                    {item.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-1.5"><Label htmlFor="sh-notes">Call sheet notes</Label><Input id="sh-notes" name="notes" maxLength={2000} /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={busy || !projectId}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Schedule</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ProjectDeliverables({ projectId }: { projectId: string }) {
  const [deliverables, setDeliverables] = useState<Array<{ id: string; title: string; status: string }>>([])
  useEffect(() => {
    if (!projectId) return
    api<{ project: { deliverables: Array<{ id: string; title: string; status: string }> } }>(`/api/projects/${projectId}`)
      .then(d => setDeliverables(d.project.deliverables.filter(x => ['PLANNED', 'SCHEDULED'].includes(x.status))))
      .catch(() => {})
  }, [projectId])
  if (deliverables.length === 0) return null
  return (
    <div className="space-y-1.5">
      <Label>Planned deliverables to film</Label>
      <div className="space-y-1.5 max-h-32 overflow-y-auto border rounded-md p-3">
        {deliverables.map(dl => (
          <label key={dl.id} className="flex items-center gap-2 text-sm">
            <Checkbox name="deliverable" value={dl.id} />
            {dl.title} <StatusBadge status={dl.status} className="text-[10px] px-1 py-0" />
          </label>
        ))}
      </div>
    </div>
  )
}
