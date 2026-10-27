'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { AdminEmptyState, AdminSpinner, AdminStatusBadge, adminFetch } from '@/components/internal/admin-bits'
import { formatDate } from '@/lib/format'
import { ROLES, TASK_PRIORITIES, TICKET_STATUSES, TICKET_TYPES, type Role } from '@/lib/constants'

type ClientOption = { id: string; name: string }
type ProjectOption = { id: string; name: string; clientId: string }

type TicketListItem = {
  id: string
  subject: string
  type: string
  status: string
  priority: string
  createdAt: string
  source: string
  client: { id: string; name: string }
  project: { id: string; name: string } | null
  createdBy: { id: string; name: string }
  _count: { replies: number }
}

const PRIORITY_OPTIONS = TASK_PRIORITIES

export function TicketsClient({
  role,
  clients,
  projects,
}: {
  role: Role
  clients: ClientOption[]
  projects: ProjectOption[]
}) {
  const { toast } = useToast()
  const [tickets, setTickets] = useState<TicketListItem[] | null>(null)
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [priorityFilter, setPriorityFilter] = useState('ALL')
  const [createOpen, setCreateOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // create form state
  const [clientId, setClientId] = useState('')
  const [projectId, setProjectId] = useState('none')
  const [type, setType] = useState<string>(TICKET_TYPES[0])
  const [priority, setPriority] = useState<string>('MEDIUM')
  const [subject, setSubject] = useState('')
  const [details, setDetails] = useState('')

  const load = useCallback(async () => {
    setTickets(null)
    const params = new URLSearchParams()
    if (statusFilter !== 'ALL') params.set('status', statusFilter)
    if (priorityFilter !== 'ALL') params.set('priority', priorityFilter)
    try {
      const data = await adminFetch<{ tickets: TicketListItem[] }>(`/api/tickets?${params.toString()}`)
      setTickets(data.tickets)
    } catch (err) {
      toast({ title: 'Could not load tickets', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
      setTickets([])
    }
  }, [statusFilter, priorityFilter, toast])

  useEffect(() => {
    void load()
  }, [load])

  const clientProjects = projects.filter((p) => p.clientId === clientId)

  async function submitTicket() {
    if (!clientId || !subject.trim() || !details.trim()) {
      toast({ title: 'Missing fields', description: 'Client, subject and details are required.', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    try {
      await adminFetch('/api/tickets', {
        method: 'POST',
        body: JSON.stringify({
          clientId,
          projectId: projectId === 'none' ? null : projectId,
          subject: subject.trim(),
          details: details.trim(),
          type,
          priority,
        }),
      })
      toast({ title: 'Ticket created', description: 'The support ticket was opened with source "Internal".' })
      setCreateOpen(false)
      setSubject('')
      setDetails('')
      setClientId('')
      setProjectId('none')
      setType(TICKET_TYPES[0])
      setPriority('MEDIUM')
      await load()
    } catch (err) {
      toast({ title: 'Could not create ticket', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Support tickets</h1>
          <p className="text-sm text-muted-foreground">
            Internal ticket triage across all clients
            {role === ROLES.WEB_DEVELOPER ? ' (scoped to your assigned projects and tickets you raised)' : ''}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void load()} aria-label="Refresh ticket list" className="h-11">
            <RefreshCw className="h-4 w-4" />
            <span className="sr-only">Refresh</span>
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="h-11">
                <Plus className="h-4 w-4" /> New ticket
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>New support ticket</DialogTitle>
                <DialogDescription>Logged internally on behalf of a client business.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid gap-2">
                  <Label htmlFor="ticket-client">Client</Label>
                  <Select value={clientId} onValueChange={(v) => { setClientId(v); setProjectId('none') }}>
                    <SelectTrigger id="ticket-client" className="h-11 w-full">
                      <SelectValue placeholder="Select a client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ticket-project">Project (optional)</Label>
                  <Select value={projectId} onValueChange={setProjectId} disabled={!clientId}>
                    <SelectTrigger id="ticket-project" className="h-11 w-full">
                      <SelectValue placeholder={clientId ? 'No specific project' : 'Select a client first'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No specific project</SelectItem>
                      {clientProjects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>Type</Label>
                    <Select value={type} onValueChange={setType}>
                      <SelectTrigger className="h-11 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TICKET_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{t === 'SUPPORT' ? 'Support' : 'Website change'}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Priority</Label>
                    <Select value={priority} onValueChange={setPriority}>
                      <SelectTrigger className="h-11 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITY_OPTIONS.map((p) => (
                          <SelectItem key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ticket-subject">Subject</Label>
                  <Input id="ticket-subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="h-11" maxLength={200} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ticket-details">Details</Label>
                  <Textarea id="ticket-details" value={details} onChange={(e) => setDetails(e.target.value)} rows={4} maxLength={5000} />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => void submitTicket()} disabled={submitting} className="h-11 w-full sm:w-auto">
                  {submitting ? 'Creating…' : 'Create ticket'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs value="tickets">
        <TabsList>
          <TabsTrigger value="tickets">Tickets</TabsTrigger>
          <TabsTrigger value="maintenance" asChild>
            <Link href="/app/tickets/maintenance">Maintenance reports</Link>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-11 w-44" aria-label="Filter by status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {TICKET_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase().replace('_', ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="h-11 w-44" aria-label="Filter by priority">
            <SelectValue placeholder="All priorities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All priorities</SelectItem>
            {PRIORITY_OPTIONS.map((p) => (
              <SelectItem key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {tickets === null ? (
        <AdminSpinner label="Loading tickets…" />
      ) : tickets.length === 0 ? (
        <AdminEmptyState title="No tickets found" description="Try clearing the filters, or create a new ticket." />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden max-h-96 overflow-y-auto rounded-lg border md:block">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Replies</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableCaption className="sr-only">Support tickets</TableCaption>
              <TableBody>
                {tickets.map((t) => (
                  <TableRow key={t.id} className="cursor-pointer" aria-label={`Open ticket ${t.subject}`}>
                    <TableCell className="max-w-64 truncate font-medium">
                      <Link href={`/app/tickets/${t.id}`} className="hover:underline">{t.subject}</Link>
                    </TableCell>
                    <TableCell>{t.client.name}</TableCell>
                    <TableCell className="max-w-48 truncate">{t.project?.name ?? '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{t.type === 'WEBSITE_CHANGE' ? 'Website change' : 'Support'}</TableCell>
                    <TableCell><AdminStatusBadge status={t.priority} /></TableCell>
                    <TableCell><AdminStatusBadge status={t.status} /></TableCell>
                    <TableCell className="text-right tabular-nums">{t._count.replies}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(t.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="grid gap-3 md:hidden">
            {tickets.map((t) => (
              <Link key={t.id} href={`/app/tickets/${t.id}`} className="block">
                <Card className="transition-colors hover:bg-accent/40">
                  <CardContent className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium leading-tight">{t.subject}</p>
                      <AdminStatusBadge status={t.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t.client.name} · {t.project?.name ?? 'No project'} · {t._count.replies} repl{t._count.replies === 1 ? 'y' : 'ies'}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <AdminStatusBadge status={t.priority} />
                      <span className="text-xs text-muted-foreground">{formatDate(t.createdAt)}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
