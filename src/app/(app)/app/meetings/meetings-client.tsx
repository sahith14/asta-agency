'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, CheckCircle2, Link as LinkIcon, Loader2, MapPin, Plus, XCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from '@/hooks/use-toast'
import { AdminEmptyState, AdminSpinner } from '@/components/internal/admin-bits'
import { formatDateTime, humanizeStatus } from '@/lib/format'

export type MeetingRow = {
  id: string
  title: string
  description: string | null
  startsAt: string
  durationMinutes: number
  location: string | null
  meetingLink: string | null
  status: string
  outcome: string | null
  clientId: string | null
  clientName: string | null
  projectId: string | null
  projectName: string | null
  createdByName: string
}

type ClientOption = { id: string; name: string }
type ProjectOption = { id: string; name: string; clientId: string }

export function MeetingsClient({
  canManage,
  meetings,
  clients,
  projects,
}: {
  canManage: boolean
  meetings: MeetingRow[]
  clients: ClientOption[]
  projects: ProjectOption[]
}) {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [clientFilter, setClientFilter] = useState('ALL')
  const [showSchedule, setShowSchedule] = useState(false)
  const [cancelling, setCancelling] = useState<MeetingRow | null>(null)
  const [completing, setCompleting] = useState<MeetingRow | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [loaded] = useState(true)

  const filtered = useMemo(
    () =>
      meetings.filter(
        (m) =>
          (statusFilter === 'ALL' || m.status === statusFilter) && (clientFilter === 'ALL' || m.clientId === clientFilter)
      ),
    [meetings, statusFilter, clientFilter]
  )
  const upcoming = filtered.filter((m) => m.status === 'SCHEDULED')
  const past = filtered.filter((m) => m.status !== 'SCHEDULED')

  async function patch(id: string, body: Record<string, unknown>, successMsg: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/meetings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ title: 'Could not update meeting', description: data.error ?? 'Something went wrong', variant: 'destructive' })
        return
      }
      toast({ title: successMsg })
      router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  if (!loaded) return <AdminSpinner label="Loading meetings…" />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">Meetings</h1>
          <p className="text-sm text-muted-foreground">Client and project meetings. Clients see their own meetings in the portal.</p>
        </div>
        {canManage ? (
          <Button className="min-h-[44px]" onClick={() => setShowSchedule(true)}>
            <Plus className="h-4 w-4" /> Schedule meeting
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="min-h-[44px] w-[190px]" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="SCHEDULED">Scheduled</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="min-h-[44px] w-[240px]" aria-label="Filter by client">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All clients</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          {filtered.length} meeting{filtered.length === 1 ? '' : 's'}
        </p>
      </div>

      {filtered.length === 0 ? (
        <AdminEmptyState
          title="No meetings"
          description={canManage ? 'Schedule the first client or project meeting.' : 'No meetings match the current filters.'}
        />
      ) : (
        <>
          {upcoming.length > 0 ? (
            <section aria-label="Upcoming meetings" className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Upcoming</h2>
              {upcoming.map((m) => (
                <MeetingCard key={m.id}>
                  <MeetingBody m={m} />
                  {canManage ? (
                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button variant="outline" size="sm" className="min-h-[44px]" disabled={busyId === m.id} onClick={() => setCompleting(m)}>
                        <CheckCircle2 className="h-4 w-4" /> Complete…
                      </Button>
                      <Button variant="outline" size="sm" className="min-h-[44px] text-destructive" disabled={busyId === m.id} onClick={() => setCancelling(m)}>
                        <XCircle className="h-4 w-4" /> Cancel
                      </Button>
                    </div>
                  ) : null}
                </MeetingCard>
              ))}
            </section>
          ) : null}

          {past.length > 0 ? (
            <section aria-label="Past meetings" className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Past</h2>
              {past.map((m) => (
                <MeetingCard key={m.id}>
                  <MeetingBody m={m} />
                </MeetingCard>
              ))}
            </section>
          ) : null}
        </>
      )}

      {showSchedule ? <ScheduleDialog clients={clients} projects={projects} onClose={() => setShowSchedule(false)} /> : null}

      <AlertDialog open={!!cancelling} onOpenChange={(o) => !o && setCancelling(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this meeting?</AlertDialogTitle>
            <AlertDialogDescription>
              “{cancelling?.title}” will be marked cancelled{cancelling?.clientName ? ` and ${cancelling.clientName} will be notified` : ''}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]">Keep meeting</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-[44px] bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                const m = cancelling
                setCancelling(null)
                if (m) void patch(m.id, { status: 'CANCELLED' }, 'Meeting cancelled')
              }}
            >
              Cancel meeting
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {completing ? (
        <CompleteDialog
          meeting={completing}
          busy={busyId === completing.id}
          onClose={() => setCompleting(null)}
          onSubmit={(outcome) => {
            const m = completing
            setCompleting(null)
            if (m) void patch(m.id, { status: 'COMPLETED', outcome }, 'Meeting completed')
          }}
        />
      ) : null}
    </div>
  )
}

function MeetingCard({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-1 pt-4">{children}</CardContent>
    </Card>
  )
}

function MeetingBody({ m }: { m: MeetingRow }) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold leading-snug">{m.title}</p>
        <Badge variant={m.status === 'SCHEDULED' ? 'default' : m.status === 'CANCELLED' ? 'destructive' : 'secondary'}>
          {humanizeStatus(m.status)}
        </Badge>
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <CalendarDays className="h-3.5 w-3.5" /> {formatDateTime(m.startsAt)} · {m.durationMinutes} min
        </span>
        {m.location ? (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" /> {m.location}
          </span>
        ) : null}
        {m.meetingLink ? (
          <a href={m.meetingLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
            <LinkIcon className="h-3.5 w-3.5" /> Join link
          </a>
        ) : null}
      </p>
      <p className="text-sm text-muted-foreground">
        {m.clientName ?? 'Internal'}
        {m.projectName ? ` · ${m.projectName}` : ''} · scheduled by {m.createdByName}
      </p>
      {m.description ? <p className="whitespace-pre-wrap text-sm text-muted-foreground">{m.description}</p> : null}
      {m.outcome ? (
        <p className="rounded-md bg-muted/60 p-2 text-sm">
          <span className="font-medium">Outcome: </span>
          {m.outcome}
        </p>
      ) : null}
    </>
  )
}

function ScheduleDialog({ clients, projects, onClose }: { clients: ClientOption[]; projects: ProjectOption[]; onClose: () => void }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [clientId, setClientId] = useState('NONE')
  const [projectId, setProjectId] = useState('NONE')
  const projectOptions = projects.filter((p) => clientId === 'NONE' || p.clientId === clientId)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setBusy(true)
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.get('title'),
          description: form.get('description') || null,
          startsAt: form.get('startsAt'),
          durationMinutes: Number(form.get('durationMinutes') ?? 30),
          clientId: clientId === 'NONE' ? null : clientId,
          projectId: projectId === 'NONE' ? null : projectId,
          location: form.get('location') || null,
          meetingLink: form.get('meetingLink') || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'Could not schedule meeting', description: data.error ?? data.issues?.[0]?.message ?? 'Something went wrong', variant: 'destructive' })
        return
      }
      toast({ title: 'Meeting scheduled', description: String(form.get('title')) })
      onClose()
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule meeting</DialogTitle>
          <DialogDescription>The client&apos;s portal users are notified automatically.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="m-title">Title *</Label>
            <Input id="m-title" name="title" required maxLength={160} className="h-11" placeholder="e.g. Kick-off — website build" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="m-starts">Date &amp; time *</Label>
              <Input id="m-starts" name="startsAt" type="datetime-local" required className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-dur">Duration (minutes)</Label>
              <Input id="m-dur" name="durationMinutes" type="number" min={15} max={480} step={15} defaultValue={30} className="h-11" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Client</Label>
              <Select value={clientId} onValueChange={(v) => { setClientId(v); setProjectId('NONE') }}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Internal (no client)</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">None</SelectItem>
                  {projectOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="m-loc">Location</Label>
              <Input id="m-loc" name="location" maxLength={200} className="h-11" placeholder="Office / phone…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-link">Meeting link</Label>
              <Input id="m-link" name="meetingLink" type="url" maxLength={500} className="h-11" placeholder="https://…" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-desc">Agenda</Label>
            <Textarea id="m-desc" name="description" rows={3} maxLength={2000} className="min-h-[44px]" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} className="min-h-[44px]">
              Cancel
            </Button>
            <Button type="submit" disabled={busy} className="min-h-[44px]">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Schedule
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CompleteDialog({
  meeting,
  busy,
  onClose,
  onSubmit,
}: {
  meeting: MeetingRow
  busy: boolean
  onClose: () => void
  onSubmit: (outcome: string) => void
}) {
  const [outcome, setOutcome] = useState('')
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Complete meeting</DialogTitle>
          <DialogDescription>Record what was agreed in “{meeting.title}”. The outcome is stored with the meeting.</DialogDescription>
        </DialogHeader>
        <Textarea value={outcome} onChange={(e) => setOutcome(e.target.value)} rows={4} maxLength={2000} placeholder="What was agreed? Next steps?" aria-label="Meeting outcome" className="min-h-[44px]" />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} className="min-h-[44px]">
            Back
          </Button>
          <Button onClick={() => onSubmit(outcome.trim())} disabled={busy} className="min-h-[44px]">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Mark completed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
