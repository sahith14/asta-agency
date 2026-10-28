'use client'

import { useEffect, useState, FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import { api, fmtDate } from '@/lib/client'
import { StatusBadge, PriorityBadge } from '@/components/status-badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ListChecks, Plus, Loader2, ChevronDown, ChevronUp, Send } from 'lucide-react'

interface Task {
  id: string; title: string; description: string | null; status: string; priority: string; dueDate: string | null
  project: { id: string; name: string; reference: string } | null
  assignee: { id: string; name: string } | null
  _count: { comments: number }
}

export default function TasksPage() {
  const searchParams = useSearchParams()
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [team, setTeam] = useState<Array<{ id: string; name: string }>>([])
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([])
  const [error, setError] = useState<string | null>(null)
  const [mine, setMine] = useState(searchParams.get('mine') === 'true')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const load = (mineOnly: boolean) => {
    api<{ tasks: Task[] }>(`/api/tasks?pageSize=100${mineOnly ? '&mine=true' : ''}`).then(d => setTasks(d.tasks)).catch(e => setError(e.message))
  }
  useEffect(() => {
    load(mine)
    api<{ employees: Array<{ id: string; name: string }> }>('/api/team?pageSize=100').then(d => setTeam(d.employees)).catch(() => {})
    api<{ projects: Array<{ id: string; name: string; reference: string }> }>('/api/projects?pageSize=100').then(d => setProjects(d.projects)).catch(() => {})
  }, [mine])

  async function setStatus(taskId: string, status: string) {
    await api(`/api/tasks/${taskId}`, { method: 'PATCH', body: { status } }).catch(() => {})
    load(mine)
  }

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setBusy(true)
    try {
      await api('/api/tasks', { method: 'POST', body: {
        title: String(fd.get('title')), description: String(fd.get('description')) || undefined,
        projectId: String(fd.get('projectId')) !== 'none' ? String(fd.get('projectId')) : undefined,
        assigneeId: String(fd.get('assigneeId')) !== 'none' ? String(fd.get('assigneeId')) : undefined,
        priority: String(fd.get('priority')),
        dueDate: fd.get('dueDate') ? new Date(String(fd.get('dueDate')) + 'T09:00').toISOString() : undefined,
      } })
      setBusy(false)
      load(mine)
    } catch { setBusy(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ListChecks className="h-6 w-6 text-primary" /> Tasks</h1>
          <p className="text-muted-foreground text-sm">Shared work across both divisions.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={mine} onCheckedChange={c => setMine(!!c)} /> Only mine
          </label>
          <Dialog>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />New task</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New task</DialogTitle></DialogHeader>
              <form onSubmit={onCreate} className="space-y-4">
                <div className="space-y-1.5"><Label htmlFor="tk-title">Title</Label><Input id="tk-title" name="title" required maxLength={200} /></div>
                <div className="space-y-1.5"><Label htmlFor="tk-desc">Description</Label><Textarea id="tk-desc" name="description" rows={2} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Project</Label>
                    <Select name="projectId" defaultValue="none"><SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="none">General</SelectItem>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>
                  </div>
                  <div className="space-y-1.5"><Label>Assignee</Label>
                    <Select name="assigneeId" defaultValue="none"><SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="none">Unassigned</SelectItem>{team.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Priority</Label>
                    <Select name="priority" defaultValue="MEDIUM"><SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select>
                  </div>
                  <div className="space-y-1.5"><Label htmlFor="tk-due">Due date</Label><Input id="tk-due" name="dueDate" type="date" /></div>
                </div>
                <DialogFooter><Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create task</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {error && <Alert variant="destructive"><AlertTitle>Failed to load</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {!error && !tasks && <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>}

      {tasks && (
        tasks.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <ListChecks className="h-10 w-10 mx-auto mb-3 opacity-30" /><p className="font-medium">No tasks {mine ? 'assigned to you' : 'yet'}</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-2">
            {tasks.map(t => (
              <Card key={t.id}>
                <CardContent className="py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{t.title}</p>
                      <p className="text-xs text-muted-foreground">{t.project?.name ?? 'General'} · {t.assignee?.name ?? 'Unassigned'}{t.dueDate ? ` · due ${fmtDate(t.dueDate)}` : ''}{t._count.comments ? ` · ${t._count.comments} comments` : ''}</p>
                    </div>
                    <PriorityBadge priority={t.priority} />
                    <Select value={t.status} onValueChange={s => setStatus(t.id, s)}>
                      <SelectTrigger className="w-40 h-8" aria-label="Task status"><SelectValue /></SelectTrigger>
                      <SelectContent>{['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'].map(s => <SelectItem key={s} value={s}>{s.replaceAll('_', ' ')}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button size="icon" variant="ghost" aria-label="Toggle details" onClick={() => setExpanded(expanded === t.id ? null : t.id)}>
                      {expanded === t.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>
                  {expanded === t.id && <TaskDetail task={t} onCommented={() => load(mine)} />}
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  )
}

function TaskDetail({ task, onCommented }: { task: Task; onCommented: () => void }) {
  const [comments, setComments] = useState<Array<{ id: string; body: string; createdAt: string; author: { name: string } }>>([])
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  useEffect(() => {
    api<{ comments: typeof comments }>(`/api/tasks/${task.id}/comments`).then(d => setComments(d.comments)).catch(() => {})
  }, [task.id])

  async function submit() {
    if (!body.trim()) return
    setBusy(true)
    setSendError(null)
    try {
      // Comments are created via POST /api/tasks/[id] (the comments route is read-only)
      await api(`/api/tasks/${task.id}`, { method: 'POST', body: { body: body.trim() } })
      setBody('')
      const d = await api<{ comments: typeof comments }>(`/api/tasks/${task.id}/comments`)
      setComments(d.comments)
      onCommented()
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to add comment')
    } finally { setBusy(false) }
  }

  return (
    <div className="mt-3 border-t pt-3 space-y-2">
      {task.description && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{task.description}</p>}
      <div className="space-y-1.5 max-h-40 overflow-y-auto">
        {comments.map(c => (
          <p key={c.id} className="text-xs rounded bg-muted px-3 py-1.5"><strong>{c.author.name}</strong>: {c.body}</p>
        ))}
      </div>
      {sendError && <p className="text-xs text-destructive" role="alert">{sendError}</p>}
      <div className="flex gap-2">
        <Input value={body} onChange={e => setBody(e.target.value)} placeholder="Add a comment…" maxLength={4000}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit() } }} aria-label="Comment" />
        <Button size="sm" onClick={submit} disabled={busy || !body.trim()}><Send className="h-3.5 w-3.5" /><span className="sr-only">Add comment</span></Button>
      </div>
    </div>
  )
}
