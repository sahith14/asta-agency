'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
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
import { Loader2, Plus, ExternalLink, ShieldCheck, Rocket } from 'lucide-react'
import { InternalStatusBadge } from '@/components/internal/InternalStatusBadge'
import { MILESTONE_STATUSES, DELIVERABLE_STATUSES, PROJECT_STATUSES, TASK_STATUSES } from '@/lib/constants'
import { humanizeStatus, formatDate, formatDateTime } from '@/lib/format'

// --- Types -----------------------------------------------------------------

type Role = string

type ProjectData = {
  id: string
  name: string
  description: string | null
  packageType: string | null
  status: string
  client: { id: string; name: string }
  assignedToId: string | null
  assignedToName: string | null
  startDate: string | null
  targetLaunchDate: string | null
  deployRequestedAt: string | null
  deployApprovedAt: string | null
  createdAt: string
}

type MilestoneData = {
  id: string
  title: string
  description: string | null
  status: string
  sortOrder: number
  dueDate: string | null
  completedAt: string | null
  clientVisible: boolean
}

type DeliverableData = {
  id: string
  title: string
  notes: string | null
  status: string
  clientVisible: boolean
  milestoneId: string | null
  milestoneTitle: string | null
}

type TaskData = {
  id: string
  title: string
  status: string
  priority: string
  dueDate: string | null
  isMaintenance: boolean
  assignedToId: string | null
  assignedToName: string | null
}

type DemoData = {
  id: string
  title: string
  demoUrl: string | null
  status: string
  authorizedAt: string | null
  clientApprovedAt: string | null
  createdAt: string
}

type AssetData = {
  id: string
  originalName: string
  mimeType: string
  sizeBytes: number
  visibility: string
  createdAt: string
  uploadedByName: string
}

type ChangeRequestData = {
  id: string
  title: string
  status: string
  scopeImpact: string | null
  createdAt: string
  raisedByName: string
}

type MaintenanceData = {
  id: string
  periodLabel: string
  status: string
  summary: string | null
  visibleToClient: boolean
  completedAt: string | null
}

type Props = {
  user: { id: string; role: Role }
  canManage: boolean
  isAssignedDev: boolean
  developers: { id: string; name: string; email: string }[]
  project: ProjectData
  milestones: MilestoneData[]
  deliverables: DeliverableData[]
  tasks: TaskData[]
  demos: DemoData[]
  assets: AssetData[]
  changeRequests: ChangeRequestData[]
  maintenanceReports: MaintenanceData[]
}

// PENDING → IN_PROGRESS → DELIVERED → APPROVED
const MILESTONE_NEXT: Record<string, string | undefined> = {
  PENDING: 'IN_PROGRESS',
  IN_PROGRESS: 'DELIVERED',
  DELIVERED: 'APPROVED',
  APPROVED: undefined,
}

async function callApi(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  let data: Record<string, unknown> = {}
  try {
    data = await res.json()
  } catch {
    data = {}
  }
  return { ok: res.ok, data }
}

// --- Root -------------------------------------------------------------------

export function ProjectDetail(props: Props) {
  const { project } = props
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">{project.name}</h1>
          <p className="text-sm text-muted-foreground">
            <Link href={`/app/clients/${project.client.id}`} className="hover:underline">
              {project.client.name}
            </Link>
            {project.packageType ? ` · ${project.packageType}` : ''} · started {formatDate(project.startDate ?? project.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <InternalStatusBadge status={project.status} />
          {project.deployApprovedAt ? (
            <Badge variant="default">
              <Rocket className="h-3 w-3" /> Deployment approved
            </Badge>
          ) : project.deployRequestedAt ? (
            <Badge variant="outline">
              <ShieldCheck className="h-3 w-3" /> Awaiting founder sign-off
            </Badge>
          ) : null}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="overview" className="min-h-[44px]">Overview</TabsTrigger>
          <TabsTrigger value="tasks" className="min-h-[44px]">Tasks ({props.tasks.length})</TabsTrigger>
          <TabsTrigger value="demos" className="min-h-[44px]">Demos ({props.demos.length})</TabsTrigger>
          <TabsTrigger value="change-requests" className="min-h-[44px]">Change Requests ({props.changeRequests.length})</TabsTrigger>
          <TabsTrigger value="assets" className="min-h-[44px]">Assets ({props.assets.length})</TabsTrigger>
          <TabsTrigger value="maintenance" className="min-h-[44px]">Maintenance ({props.maintenanceReports.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {props.canManage ? <SettingsCard {...props} /> : null}
            <DeployCard {...props} />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <MilestonesCard {...props} />
            <DeliverablesCard {...props} />
          </div>
        </TabsContent>

        <TabsContent value="tasks" className="mt-4">
          <TasksTab {...props} />
        </TabsContent>

        <TabsContent value="demos" className="mt-4">
          <DemosTab demos={props.demos} />
        </TabsContent>

        <TabsContent value="change-requests" className="mt-4">
          <CrTab changeRequests={props.changeRequests} />
        </TabsContent>

        <TabsContent value="assets" className="mt-4">
          <AssetsTab assets={props.assets} />
        </TabsContent>

        <TabsContent value="maintenance" className="mt-4">
          <MaintenanceTab reports={props.maintenanceReports} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// --- Project settings (manager/founder) --------------------------------------

function SettingsCard({ project, canManage, developers }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(project.status)
  const [assignedToId, setAssignedToId] = useState(project.assignedToId ?? 'NONE')

  if (!canManage) return null

  async function save() {
    setSaving(true)
    try {
      const { ok, data } = await callApi(`/api/projects/${project.id}`, 'PATCH', {
        status,
        assignedToId: assignedToId === 'NONE' ? null : assignedToId,
      })
      if (!ok) {
        toast({ title: 'Update failed', description: String(data.error ?? ''), variant: 'destructive' })
        return
      }
      toast({ title: 'Project updated' })
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Project settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {humanizeStatus(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Assigned developer</Label>
            <Select value={assignedToId} onValueChange={setAssignedToId}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">Unassigned</SelectItem>
                {developers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Target launch: {formatDate(project.targetLaunchDate)} · current dev: {project.assignedToName ?? 'unassigned'}
        </p>
        <Button onClick={save} disabled={saving} className="min-h-[44px]">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save settings
        </Button>
      </CardContent>
    </Card>
  )
}

// --- Deployment approval (P6-3 step 6) ---------------------------------------

function DeployCard({ project, canManage, isAssignedDev, user }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<'request' | 'approve' | null>(null)

  const canRequest = canManage || isAssignedDev
  const isFounder = user.role === 'FOUNDER'

  async function act(action: 'request' | 'approve') {
    setBusy(action)
    try {
      const { ok, data } = await callApi(`/api/projects/${project.id}/deploy`, 'POST', { action })
      if (!ok) {
        toast({ title: action === 'approve' ? 'Approval failed' : 'Request failed', description: String(data.error ?? ''), variant: 'destructive' })
        return
      }
      toast({
        title: action === 'approve' ? 'Deployment approved' : 'Deployment requested',
        description: action === 'approve' ? 'Project marked LAUNCH — deployment authorized.' : 'Founder users have been notified.',
      })
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Deployment approval</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">Requested:</span> {formatDateTime(project.deployRequestedAt)}
          </p>
          <p>
            <span className="text-muted-foreground">Approved:</span> {formatDateTime(project.deployApprovedAt)}
          </p>
        </div>
        {!project.deployApprovedAt ? (
          <p className="text-xs text-muted-foreground">
            Final launch gate: a staff member requests deployment, then the founder signs off. Approval marks the project LAUNCH.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Deployment is authorized — the project is marked LAUNCH.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {canRequest && !project.deployRequestedAt ? (
            <Button variant="outline" onClick={() => act('request')} disabled={busy !== null} className="min-h-[44px]">
              {busy === 'request' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Request deployment approval
            </Button>
          ) : null}
          {isFounder && project.deployRequestedAt && !project.deployApprovedAt ? (
            <Button onClick={() => act('approve')} disabled={busy !== null} className="min-h-[44px]">
              {busy === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />} Approve deployment (mark LAUNCH)
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

// --- Milestones ---------------------------------------------------------------

function MilestonesCard({ project, milestones, canManage, user }: Props) {
  const canSetAllStatuses = user.role === 'FOUNDER'
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)

  async function setStatus(mid: string, status: string) {
    setBusyId(mid)
    try {
      const { ok, data } = await callApi(`/api/projects/${project.id}/milestones/${mid}`, 'PATCH', { status })
      if (!ok) {
        toast({ title: 'Could not update milestone', description: String(data.error ?? ''), variant: 'destructive' })
        return
      }
      router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  async function toggleVisible(m: MilestoneData, clientVisible: boolean) {
    const { ok, data } = await callApi(`/api/projects/${project.id}/milestones/${m.id}`, 'PATCH', { clientVisible })
    if (!ok) {
      toast({ title: 'Could not update visibility', description: String(data.error ?? ''), variant: 'destructive' })
      return
    }
    router.refresh()
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Milestones</CardTitle>
        {canManage ? <AddMilestoneDialog projectId={project.id} existingCount={milestones.length} /> : null}
      </CardHeader>
      <CardContent className="max-h-96 space-y-4 overflow-y-auto">
        {milestones.length === 0 ? <p className="text-sm text-muted-foreground">No milestones yet.</p> : null}
        {milestones.map((m) => {
          const allStatuses = MILESTONE_STATUSES as readonly string[]
          const nextStatus = MILESTONE_NEXT[m.status]
          const options = Array.from(
            new Set(canSetAllStatuses ? allStatuses : nextStatus ? [m.status, nextStatus] : [m.status])
          )
          return (
            <div key={m.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium leading-snug">
                  {m.sortOrder}. {m.title}
                </p>
                {busyId === m.id ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <InternalStatusBadge status={m.status} />}
              </div>
              {m.description ? <p className="mt-1 text-xs text-muted-foreground">{m.description}</p> : null}
              <p className="mt-1 text-xs text-muted-foreground">
                Due {formatDate(m.dueDate)}
                {m.completedAt ? ` · completed ${formatDate(m.completedAt)}` : ''}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                {canManage && options.length > 1 ? (
                  <Select value={m.status} onValueChange={(v) => setStatus(m.id, v)}>
                    <SelectTrigger size="sm" className="min-h-[44px] w-[190px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s === m.status ? `${humanizeStatus(s)} (current)` : humanizeStatus(s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
                {canManage ? (
                  <label className="flex min-h-[44px] items-center gap-2 text-xs text-muted-foreground">
                    <Switch checked={m.clientVisible} onCheckedChange={(v) => toggleVisible(m, v)} aria-label={`Client visibility for ${m.title}`} />
                    Client-visible
                  </label>
                ) : (
                  <Badge variant={m.clientVisible ? 'secondary' : 'outline'}>{m.clientVisible ? 'Visible to client' : 'Internal'}</Badge>
                )}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

function AddMilestoneDialog({ projectId, existingCount }: { projectId: string; existingCount: number }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [clientVisible, setClientVisible] = useState(true)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setSaving(true)
    try {
      const { ok, data } = await callApi(`/api/projects/${projectId}/milestones`, 'POST', {
        title: form.get('title'),
        description: form.get('description') || null,
        dueDate: form.get('dueDate') || null,
        sortOrder: form.get('sortOrder') ? Number(form.get('sortOrder')) : existingCount + 1,
        clientVisible,
      })
      if (!ok) {
        toast({ title: 'Could not add milestone', description: String(data.error ?? ''), variant: 'destructive' })
        return
      }
      toast({ title: 'Milestone added' })
      setOpen(false)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-[44px]">
          <Plus className="h-4 w-4" /> Add
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add milestone</DialogTitle>
          <DialogDescription>Track a delivery phase for this project.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ms-title">Title *</Label>
            <Input id="ms-title" name="title" required maxLength={200} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ms-desc">Description</Label>
            <Textarea id="ms-desc" name="description" rows={2} maxLength={2000} className="min-h-[44px]" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="ms-due">Due date</Label>
              <Input id="ms-due" name="dueDate" type="date" className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ms-order">Sort order</Label>
              <Input id="ms-order" name="sortOrder" type="number" min={0} max={9999} defaultValue={existingCount + 1} className="h-11" />
            </div>
          </div>
          <label className="flex min-h-[44px] items-center gap-2 text-sm">
            <Switch checked={clientVisible} onCheckedChange={setClientVisible} aria-label="Client visible" />
            Visible to client in the portal
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="min-h-[44px]">
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="min-h-[44px]">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Add milestone
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// --- Deliverables --------------------------------------------------------------

function DeliverablesCard({ project, deliverables, canManage, isAssignedDev }: Props) {
  const router = useRouter()
  const canEdit = canManage || isAssignedDev
  const [busyId, setBusyId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [clientVisible, setClientVisible] = useState(true)

  async function setStatus(did: string, status: string) {
    setBusyId(did)
    try {
      const { ok, data } = await callApi(`/api/projects/${project.id}/deliverables/${did}`, 'PATCH', { status })
      if (!ok) {
        toast({ title: 'Could not update deliverable', description: String(data.error ?? ''), variant: 'destructive' })
        return
      }
      router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  async function addDeliverable(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setAdding(true)
    try {
      const { ok, data } = await callApi(`/api/projects/${project.id}/deliverables`, 'POST', {
        title,
        clientVisible,
      })
      if (!ok) {
        toast({ title: 'Could not add deliverable', description: String(data.error ?? ''), variant: 'destructive' })
        return
      }
      toast({ title: 'Deliverable added' })
      setTitle('')
      router.refresh()
    } finally {
      setAdding(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Deliverables</CardTitle>
      </CardHeader>
      <CardContent className="max-h-96 space-y-4 overflow-y-auto">
        {deliverables.length === 0 ? <p className="text-sm text-muted-foreground">No deliverables yet.</p> : null}
        {deliverables.map((d) => (
          <div key={d.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium leading-snug">{d.title}</p>
              {busyId === d.id ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <InternalStatusBadge status={d.status} />}
            </div>
            {d.notes ? <p className="mt-1 text-xs text-muted-foreground">{d.notes}</p> : null}
            {d.milestoneTitle ? <p className="mt-1 text-xs text-muted-foreground">Milestone: {d.milestoneTitle}</p> : null}
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {canEdit ? (
                <Select value={d.status} onValueChange={(v) => setStatus(d.id, v)}>
                  <SelectTrigger size="sm" className="min-h-[44px] w-[190px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DELIVERABLE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s === d.status ? `${humanizeStatus(s)} (current)` : humanizeStatus(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              {canEdit ? (
                <label className="flex min-h-[44px] items-center gap-2 text-xs text-muted-foreground">
                  <Switch
                    checked={d.clientVisible}
                    onCheckedChange={async (v) => {
                      const { ok, data } = await callApi(`/api/projects/${project.id}/deliverables/${d.id}`, 'PATCH', { clientVisible: v })
                      if (!ok) {
                        toast({ title: 'Could not update visibility', description: String(data.error ?? ''), variant: 'destructive' })
                        return
                      }
                      router.refresh()
                    }}
                    aria-label={`Client visibility for ${d.title}`}
                  />
                  Client-visible
                </label>
              ) : (
                <Badge variant={d.clientVisible ? 'secondary' : 'outline'}>{d.clientVisible ? 'Visible to client' : 'Internal'}</Badge>
              )}
            </div>
          </div>
        ))}

        {canEdit ? (
          <form onSubmit={addDeliverable} className="space-y-2 rounded-lg border border-dashed p-3">
            <Label htmlFor="dl-title" className="text-xs">
              Add deliverable
            </Label>
            <Input
              id="dl-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Booking enquiry form"
              maxLength={200}
              className="h-11"
            />
            <div className="flex items-center justify-between gap-3">
              <label className="flex min-h-[44px] items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={clientVisible} onCheckedChange={setClientVisible} aria-label="Client visible" />
                Client-visible
              </label>
              <Button type="submit" size="sm" disabled={adding || !title.trim()} className="min-h-[44px]">
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
              </Button>
            </div>
          </form>
        ) : null}
      </CardContent>
    </Card>
  )
}

// --- Tasks tab -----------------------------------------------------------------

function TasksTab({ project, tasks, canManage, isAssignedDev, user }: Props) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)

  // Devs may move status of their own tasks or any task on their assigned
  // projects (mirrors the API rule); managers/founder can always do it.
  const canSetStatus = (t: TaskData) => canManage || isAssignedDev || t.assignedToId === user.id

  async function setStatus(tid: string, status: string) {
    setBusyId(tid)
    try {
      const { ok, data } = await callApi(`/api/tasks/${tid}`, 'PATCH', { status })
      if (!ok) {
        toast({ title: 'Could not update task', description: String(data.error ?? ''), variant: 'destructive' })
        return
      }
      router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Tasks</CardTitle>
      </CardHeader>
      <CardContent className="max-h-[32rem] space-y-3 overflow-y-auto">
        {tasks.length === 0 ? <p className="text-sm text-muted-foreground">No tasks on this project.</p> : null}
        {tasks.map((t) => (
          <div key={t.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium leading-snug">
                {t.title}
                {t.isMaintenance ? <Badge variant="outline" className="ml-2">Maintenance</Badge> : null}
              </p>
              <div className="flex items-center gap-2">
                <InternalStatusBadge status={t.priority} />
                {busyId === t.id ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <InternalStatusBadge status={t.status} />}
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t.assignedToName ? `Assigned to ${t.assignedToName}` : 'Unassigned'}
              {t.dueDate ? ` · due ${formatDate(t.dueDate)}` : ''}
            </p>
            {canSetStatus(t) ? (
              <div className="mt-2">
                <Select value={t.status} onValueChange={(v) => setStatus(t.id, v)}>
                  <SelectTrigger size="sm" className="min-h-[44px] w-[190px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s === t.status ? `${humanizeStatus(s)} (current)` : humanizeStatus(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
        ))}
        <Separator />
        <p className="text-xs text-muted-foreground">
          Manage the full task board on the{' '}
          <Link href={`/app/tasks?project=${project.id}`} className="underline">
            Tasks page
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  )
}

// --- Demos / CRs / Assets / Maintenance tabs (display) ---------------------------

function DemosTab({ demos }: { demos: DemoData[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Demos</CardTitle>
      </CardHeader>
      <CardContent className="max-h-[32rem] space-y-3 overflow-y-auto">
        {demos.length === 0 ? <p className="text-sm text-muted-foreground">No demos for this project yet.</p> : null}
        {demos.map((d) => (
          <div key={d.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{d.title}</p>
              <InternalStatusBadge status={d.status} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Created {formatDate(d.createdAt)}
              {d.authorizedAt ? ` · authorized ${formatDate(d.authorizedAt)}` : ''}
              {d.clientApprovedAt ? ' · approved by client' : ''}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {d.demoUrl ? (
                <Button variant="outline" size="sm" asChild className="min-h-[44px]">
                  <a href={d.demoUrl} target="_blank" rel="noreferrer noopener">
                    <ExternalLink className="h-4 w-4" /> Open preview
                  </a>
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" asChild className="min-h-[44px]">
                <Link href="/app/demos">Open demo queue</Link>
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function CrTab({ changeRequests }: { changeRequests: ChangeRequestData[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Change requests</CardTitle>
      </CardHeader>
      <CardContent className="max-h-[32rem] space-y-3 overflow-y-auto">
        {changeRequests.length === 0 ? <p className="text-sm text-muted-foreground">No change requests for this project.</p> : null}
        {changeRequests.map((cr) => (
          <div key={cr.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{cr.title}</p>
              <InternalStatusBadge status={cr.status} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Raised by {cr.raisedByName} · {formatDate(cr.createdAt)}
              {cr.scopeImpact ? ` · scope: ${humanizeStatus(cr.scopeImpact)}` : ''}
            </p>
          </div>
        ))}
        <Separator />
        <p className="text-xs text-muted-foreground">
          Review the full queue on the{' '}
          <Link href="/app/change-requests" className="underline">
            Change Requests page
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  )
}

function AssetsTab({ assets }: { assets: AssetData[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Assets</CardTitle>
      </CardHeader>
      <CardContent className="max-h-[32rem] space-y-3 overflow-y-auto">
        {assets.length === 0 ? <p className="text-sm text-muted-foreground">No assets uploaded for this project.</p> : null}
        {assets.map((a) => (
          <div key={a.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{a.originalName}</p>
              <Badge variant={a.visibility === 'CLIENT' ? 'secondary' : 'outline'}>{a.visibility === 'CLIENT' ? 'Client' : 'Internal'}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {a.mimeType} · {(a.sizeBytes / 1024).toFixed(0)} KB · uploaded by {a.uploadedByName} · {formatDate(a.createdAt)}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function MaintenanceTab({ reports }: { reports: MaintenanceData[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Maintenance reports</CardTitle>
      </CardHeader>
      <CardContent className="max-h-[32rem] space-y-3 overflow-y-auto">
        {reports.length === 0 ? <p className="text-sm text-muted-foreground">No maintenance reports for this project.</p> : null}
        {reports.map((r) => (
          <div key={r.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{r.periodLabel}</p>
              <InternalStatusBadge status={r.status} />
            </div>
            {r.summary ? <p className="mt-1 text-xs text-muted-foreground">{r.summary}</p> : null}
            <p className="mt-1 text-xs text-muted-foreground">
              Completed {formatDate(r.completedAt)} · {r.visibleToClient ? 'visible to client' : 'internal'}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
