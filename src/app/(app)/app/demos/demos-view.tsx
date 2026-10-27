'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from '@/hooks/use-toast'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  DialogTrigger,
} from '@/components/ui/dialog'
import { Loader2, MonitorPlay, Plus, ExternalLink, Send, ShieldCheck } from 'lucide-react'
import { InternalStatusBadge } from '@/components/internal/InternalStatusBadge'
import { DEMO_STATUSES } from '@/lib/constants'
import { humanizeStatus, formatDate } from '@/lib/format'

type DemoRow = {
  id: string
  title: string
  demoUrl: string
  status: string
  authorizedAt: string | null
  clientApprovedAt: string | null
  createdAt: string
  projectId: string
  projectName: string
  clientName: string
}

type ProjectOption = { id: string; name: string; clientName: string }

export function DemosView({ role, demos, projects }: { role: string; demos: DemoRow[]; projects: ProjectOption[] }) {
  const router = useRouter()
  const [filter, setFilter] = useState<string>('ALL')
  const [busyId, setBusyId] = useState<string | null>(null)

  const isFounder = role === 'FOUNDER'
  const canCreate = role === 'FOUNDER' || role === 'CLIENT_MANAGER' || role === 'WEB_DEVELOPER'

  const filtered = useMemo(() => (filter === 'ALL' ? demos : demos.filter((d) => d.status === filter)), [demos, filter])

  async function submitForReview(d: DemoRow) {
    setBusyId(d.id)
    try {
      const res = await fetch(`/api/demos/${d.id}/ready`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'Could not submit for review', description: data.error ?? 'Something went wrong', variant: 'destructive' })
        return
      }
      toast({ title: 'Submitted for founder review', description: `“${d.title}” is now READY_FOR_FOUNDER.` })
      router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">Demo queue</h1>
          <p className="text-sm text-muted-foreground">
            Prepare → submit for founder review → founder authorizes → client reviews in the portal.
          </p>
        </div>
        {canCreate ? <NewDemoDialog projects={projects} /> : null}
      </div>

      <div className="flex items-center gap-2">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="min-h-[44px] w-[220px]" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses ({demos.length})</SelectItem>
            {DEMO_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {humanizeStatus(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">{filter === 'ALL' ? 'No demos yet.' : `No demos with status ${humanizeStatus(filter)}.`}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filtered.map((d) => (
            <Card key={d.id}>
              <CardContent className="space-y-2 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold leading-snug">{d.title}</p>
                    <p className="text-sm text-muted-foreground">
                      <Link href={`/app/projects/${d.projectId}`} className="hover:underline">
                        {d.projectName}
                      </Link>{' '}
                      · {d.clientName}
                    </p>
                  </div>
                  <InternalStatusBadge status={d.status} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Created {formatDate(d.createdAt)}
                  {d.authorizedAt ? ` · authorized ${formatDate(d.authorizedAt)}` : ''}
                  {d.clientApprovedAt ? ' · approved by client' : ''}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {(d.status === 'PREPARING' || d.status === 'CHANGES_REQUESTED') ? (
                    <Button size="sm" onClick={() => submitForReview(d)} disabled={busyId === d.id} className="min-h-[44px]">
                      {busyId === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit for review
                    </Button>
                  ) : null}
                  {isFounder && d.status === 'READY_FOR_FOUNDER' ? <AuthorizeDialog demo={d} /> : null}
                  {isFounder && d.status === 'CHANGES_REQUESTED' ? <AuthorizeDialog demo={d} label="Re-authorize after rework" /> : null}
                  <Button variant="outline" size="sm" asChild className="min-h-[44px]">
                    <a href={d.demoUrl} target="_blank" rel="noreferrer noopener">
                      <ExternalLink className="h-4 w-4" /> Open external preview
                    </a>
                  </Button>
                  <Button variant="ghost" size="sm" asChild className="min-h-[44px]">
                    <Link href={`/app/projects/${d.projectId}`}>Project</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function AuthorizeDialog({ demo, label }: { demo: DemoRow; label?: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function authorize() {
    setBusy(true)
    try {
      const note = (document.getElementById('authorize-note') as HTMLTextAreaElement | null)?.value ?? undefined
      const res = await fetch(`/api/demos/${demo.id}/authorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note?.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'Authorization failed', description: data.error ?? 'Something went wrong', variant: 'destructive' })
        return
      }
      toast({ title: 'Client preview authorized', description: 'The client has been notified in their portal.' })
      setOpen(false)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="min-h-[44px]">
          {label ? <ShieldCheck className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />} {label ?? 'Authorize client preview'}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Authorize client preview</DialogTitle>
          <DialogDescription>
            “{demo.title}” ({demo.projectName}) becomes visible to {demo.clientName} in their portal. Founder approval is always required —
            client demo approval never implies extra-cost work.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="authorize-note">Note to client (optional)</Label>
            <Textarea id="authorize-note" rows={3} maxLength={2000} placeholder="Added to the demo feedback thread as a comment." className="min-h-[44px]" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="min-h-[44px]">
              Cancel
            </Button>
            <Button onClick={authorize} disabled={busy} className="min-h-[44px]">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Authorize
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function NewDemoDialog({ projects }: { projects: ProjectOption[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [projectId, setProjectId] = useState('')

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setBusy(true)
    try {
      const res = await fetch('/api/demos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          title: form.get('title'),
          demoUrl: form.get('demoUrl'),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'Could not create demo', description: data.error ?? 'Something went wrong', variant: 'destructive' })
        return
      }
      toast({ title: 'Demo created', description: `“${data.demo.title}” is now PREPARING.` })
      setOpen(false)
      setProjectId('')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="min-h-[44px]">
          <Plus className="h-4 w-4" /> New demo
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New demo</DialogTitle>
          <DialogDescription>Register an externally hosted preview URL for a project.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Project *</Label>
            <Select value={projectId} onValueChange={setProjectId} required>
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} — {p.clientName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="demo-title">Title *</Label>
            <Input id="demo-title" name="title" required maxLength={200} placeholder="e.g. Homepage v3 preview" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="demo-url">External demo URL *</Label>
            <Input id="demo-url" name="demoUrl" required maxLength={500} type="url" placeholder="https://demo.example.com/v3" className="h-11" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="min-h-[44px]">
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !projectId} className="min-h-[44px]">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MonitorPlay className="h-4 w-4" />} Create demo
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
