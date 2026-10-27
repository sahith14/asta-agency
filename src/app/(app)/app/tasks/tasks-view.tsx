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
import { Loader2, Plus } from 'lucide-react'
import { InternalStatusBadge } from '@/components/internal/InternalStatusBadge'
import { TaskCommentsDialog } from './task-comments'
import { TASK_STATUSES, TASK_PRIORITIES } from '@/lib/constants'
import { humanizeStatus, formatDate } from '@/lib/format'

type TaskRow = {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  dueDate: string | null
  isMaintenance: boolean
  changeRequestId: string | null
  assignedToId: string | null
  assignedToName: string | null
  createdByName: string
  projectId: string
  projectName: string
  commentsCount: number
}

type ProjectOption = { id: string; name: string; clientName: string }
type DeveloperOption = { id: string; name: string; email: string }

export function TasksView({
  role,
  userId,
  initialStatus,
  initialProjectId,
  tasks,
  projects,
  developers,
}: {
  role: string
  userId: string
  initialStatus: string
  initialProjectId: string
  tasks: TaskRow[]
  projects: ProjectOption[]
  developers: DeveloperOption[]
}) {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState(initialStatus)
  const [projectFilter, setProjectFilter] = useState(initialProjectId)
  const [busyId, setBusyId] = useState<string | null>(null)

  const canCreate = role === 'FOUNDER' || role === 'CLIENT_MANAGER'
  const isDev = role === 'WEB_DEVELOPER'

  const filtered = useMemo(
    () =>
      tasks.filter(
        (t) => (statusFilter === 'ALL' || t.status === statusFilter) && (projectFilter === 'ALL' || t.projectId === projectFilter)
      ),
    [tasks, statusFilter, projectFilter]
  )

  // Devs can only move status of tasks assigned to them or on their projects.
  const canSetStatus = (t: TaskRow) => canCreate || t.assignedToId === userId

  async function setStatus(t: TaskRow, status: string) {
    setBusyId(t.id)
    try {
      const res = await fetch(`/api/tasks/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'Could not update task', description: data.error ?? 'Something went wrong', variant: 'destructive' })
        return
      }
      toast({ title: 'Task updated', description: `“${t.title}” → ${humanizeStatus(status)}.` })
      router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">Tasks</h1>
          <p className="text-sm text-muted-foreground">{isDev ? 'Your tasks and your projects’ tasks.' : 'Delivery and maintenance tasks across projects.'}</p>
        </div>
        {canCreate ? <NewTaskDialog projects={projects} developers={developers} /> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="min-h-[44px] w-[200px]" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {TASK_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {humanizeStatus(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="min-h-[44px] w-[260px]" aria-label="Filter by project">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          {filtered.length} task{filtered.length === 1 ? '' : 's'}
        </p>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tasks match the current filters.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => (
            <Card key={t.id}>
              <CardContent className="space-y-2 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold leading-snug">
                      {t.title}
                      {t.isMaintenance ? <span className="ml-2 text-xs text-muted-foreground">(maintenance)</span> : null}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      <Link href={`/app/projects/${t.projectId}`} className="hover:underline">
                        {t.projectName}
                      </Link>{' '}
                      · {t.assignedToName ? `Assigned to ${t.assignedToName}` : 'Unassigned'} · created by {t.createdByName}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <InternalStatusBadge status={t.priority} />
                    {busyId === t.id ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <InternalStatusBadge status={t.status} />}
                  </div>
                </div>
                {t.description ? <p className="whitespace-pre-wrap text-sm text-muted-foreground">{t.description}</p> : null}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <p className="text-xs text-muted-foreground">Due {formatDate(t.dueDate)}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <TaskCommentsDialog taskId={t.id} taskTitle={t.title} initialCount={t.commentsCount} />
                    {canSetStatus(t) ? (
                      <Select value={t.status} onValueChange={(v) => setStatus(t, v)}>
                        <SelectTrigger size="sm" className="min-h-[44px] w-[190px]" aria-label={`Change status of ${t.title}`}>
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
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function NewTaskDialog({ projects, developers }: { projects: ProjectOption[]; developers: DeveloperOption[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [assignedToId, setAssignedToId] = useState('NONE')
  const [priority, setPriority] = useState('MEDIUM')

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setBusy(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          title: form.get('title'),
          description: form.get('description') || null,
          assignedToId: assignedToId === 'NONE' ? null : assignedToId,
          priority,
          status: form.get('status') || 'BACKLOG',
          dueDate: form.get('dueDate') || null,
          isMaintenance: form.get('isMaintenance') === 'on',
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'Could not create task', description: data.error ?? 'Something went wrong', variant: 'destructive' })
        return
      }
      toast({ title: 'Task created', description: `“${data.task.title}” was added.` })
      setOpen(false)
      setProjectId('')
      setAssignedToId('NONE')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="min-h-[44px]">
          <Plus className="h-4 w-4" /> New task
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>Assign work to a web developer.</DialogDescription>
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
            <Label htmlFor="task-title">Title *</Label>
            <Input id="task-title" name="title" required maxLength={200} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-desc">Description</Label>
            <Textarea id="task-desc" name="description" rows={3} maxLength={5000} className="min-h-[44px]" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Assignee</Label>
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
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {humanizeStatus(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="task-due">Due date</Label>
              <Input id="task-due" name="dueDate" type="date" className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-status">Initial status</Label>
              <Select name="status" defaultValue="BACKLOG">
                <SelectTrigger id="task-status" className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {humanizeStatus(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <label className="flex min-h-[44px] items-center gap-2 text-sm">
            <input type="checkbox" name="isMaintenance" className="h-4 w-4" /> Maintenance task
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="min-h-[44px]">
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !projectId} className="min-h-[44px]">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
