'use client'

import { useEffect, useState, FormEvent } from 'react'
import { api, fmtDateTime } from '@/lib/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { CalendarDays, Plus, Loader2, Clapperboard, Users } from 'lucide-react'

interface Meeting { id: string; title: string; startAt: string; endAt: string; location: string | null; notes: string | null; client: { name: string } | null; project: { name: string; reference: string } | null }
interface Shoot { id: string; title: string; date: string; startTime: string; endTime: string; status: string; project: { name: string } }

export default function CalendarPage() {
  const [meetings, setMeetings] = useState<Meeting[] | null>(null)
  const [shoots, setShoots] = useState<Shoot[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([])
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    const from = new Date(Date.now() - 7 * 86400000).toISOString()
    const to = new Date(Date.now() + 60 * 86400000).toISOString()
    Promise.all([
      api<{ meetings: Meeting[] }>(`/api/meetings?from=${from}&to=${to}`),
      api<{ shoots: Shoot[] }>(`/api/video/shoots?from=${from}&to=${to}`),
      api<{ clients: Array<{ id: string; name: string }> }>('/api/clients?pageSize=100').catch(() => ({ clients: [] })),
      api<{ projects: Array<{ id: string; name: string }> }>('/api/projects?pageSize=100').catch(() => ({ projects: [] })),
    ])
      .then(([m, s, c, p]) => { setMeetings(m.meetings); setShoots(s.shoots); setClients(c.clients); setProjects(p.projects) })
      .catch(e => setError(e.message))
  }, [])

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setBusy(true)
    try {
      await api('/api/meetings', { method: 'POST', body: {
        title: String(fd.get('title')),
        clientId: String(fd.get('clientId')) !== 'none' ? String(fd.get('clientId')) : undefined,
        projectId: String(fd.get('projectId')) !== 'none' ? String(fd.get('projectId')) : undefined,
        startAt: new Date(String(fd.get('date')) + 'T' + String(fd.get('start'))).toISOString(),
        endAt: new Date(String(fd.get('date')) + 'T' + String(fd.get('end'))).toISOString(),
        location: String(fd.get('location')) || undefined,
      } })
      setBusy(false)
      const from = new Date(Date.now() - 7 * 86400000).toISOString()
      const to = new Date(Date.now() + 60 * 86400000).toISOString()
      api<{ meetings: Meeting[] }>(`/api/meetings?from=${from}&to=${to}`).then(d => setMeetings(d.meetings)).catch(() => {})
    } catch { setBusy(false) }
  }

  const events = [
    ...((meetings ?? []).map(m => ({ kind: 'meeting' as const, id: m.id, title: m.title, when: m.startAt, where: m.location, sub: m.client?.name ?? m.project?.name ?? '' }))),
    ...(shoots.map(s => ({ kind: 'shoot' as const, id: s.id, title: s.title, when: `${new Date(s.date).toDateString()}T${s.startTime}`, where: null, sub: s.project.name }))),
  ].sort((a, b) => new Date(a.when).getTime() - new Date(b.when).getTime())

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><CalendarDays className="h-6 w-6 text-primary" /> Calendar</h1>
          <p className="text-muted-foreground text-sm">Meetings and shoots in one view.</p>
        </div>
        <Dialog>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Schedule meeting</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Schedule meeting</DialogTitle></DialogHeader>
            <form onSubmit={onCreate} className="space-y-4">
              <div className="space-y-1.5"><Label htmlFor="m-title">Title</Label><Input id="m-title" name="title" required maxLength={160} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Client</Label>
                  <Select name="clientId" defaultValue="none"><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="none">—</SelectItem>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
                </div>
                <div className="space-y-1.5"><Label>Project</Label>
                  <Select name="projectId" defaultValue="none"><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="none">—</SelectItem>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5"><Label htmlFor="m-date">Date</Label><Input id="m-date" name="date" type="date" required /></div>
                <div className="space-y-1.5"><Label htmlFor="m-start">Start</Label><Input id="m-start" name="start" type="time" required defaultValue="10:00" /></div>
                <div className="space-y-1.5"><Label htmlFor="m-end">End</Label><Input id="m-end" name="end" type="time" required defaultValue="11:00" /></div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="m-loc">Location</Label><Input id="m-loc" name="location" placeholder="Google Meet / office…" /></div>
              <DialogFooter><Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Schedule</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {error && <Alert variant="destructive"><AlertTitle>Failed to load</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {!error && !meetings && <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14" />)}</div>}

      {meetings && (
        events.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-30" /><p className="font-medium">Nothing scheduled in the next 60 days</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-2">
            {events.map(ev => (
              <Card key={`${ev.kind}-${ev.id}`}>
                <CardContent className="py-3.5 flex items-center gap-3">
                  {ev.kind === 'shoot' ? <Clapperboard className="h-4 w-4 text-primary shrink-0" /> : <Users className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{ev.title}</p>
                    <p className="text-xs text-muted-foreground">{fmtDateTime(ev.when)}{ev.where ? ` · ${ev.where}` : ''} · {ev.sub}</p>
                  </div>
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground border rounded px-1.5 py-0.5">{ev.kind}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  )
}
