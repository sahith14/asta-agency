'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { useToast } from '@/hooks/use-toast'
import { AdminSpinner, AdminStatusBadge, adminFetch } from '@/components/internal/admin-bits'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  ROLES,
  TASK_PRIORITIES,
  TICKET_STATUSES,
  REPLY_VISIBILITIES,
  type Role,
} from '@/lib/constants'

type Reply = {
  id: string
  body: string
  visibility: string
  createdAt: string
  author: { id: string; name: string; role: string }
}

type TicketDetail = {
  id: string
  subject: string
  details: string
  type: string
  status: string
  priority: string
  createdAt: string
  resolvedAt: string | null
  clientId: string
  client: { id: string; name: string }
  project: { id: string; name: string } | null
  createdBy: { id: string; name: string; role: string }
  replies: Reply[]
}

const CAN_MANAGE: Role[] = [ROLES.FOUNDER, ROLES.CLIENT_MANAGER, ROLES.SUPPORT_FINANCE]

export function TicketDetailClient({ ticketId, viewerId, role }: { ticketId: string; viewerId: string; role: Role }) {
  const { toast } = useToast()
  const [ticket, setTicket] = useState<TicketDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [visibility, setVisibility] = useState<string>('CLIENT')
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const data = await adminFetch<{ ticket: TicketDetail }>(`/api/tickets/${ticketId}`)
      setTicket(data.ticket)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load ticket')
    }
  }, [ticketId])

  useEffect(() => {
    void load()
  }, [load])

  if (error) {
    return (
      <div className="space-y-4">
        <Button variant="outline" asChild className="h-11"><Link href="/app/tickets"><ArrowLeft className="h-4 w-4" /> Back to tickets</Link></Button>
        <Card><CardContent className="px-4 py-8 text-center text-sm text-muted-foreground">{error}</CardContent></Card>
      </div>
    )
  }
  if (!ticket) return <AdminSpinner label="Loading ticket…" />

  const isDeveloper = role === ROLES.WEB_DEVELOPER
  const canManage = CAN_MANAGE.includes(role)
  const developerCanReply = isDeveloper && ticket.project !== null
  const canReply = canManage || developerCanReply

  async function changeStatus(status: string) {
    try {
      const data = await adminFetch<{ ticket: TicketDetail }>(`/api/tickets/${ticketId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      setTicket(data.ticket)
      toast({ title: 'Status updated', description: `Ticket marked as ${status.toLowerCase().replace('_', ' ')}.` })
    } catch (err) {
      toast({ title: 'Could not update status', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    }
  }

  async function changePriority(priority: string) {
    try {
      const data = await adminFetch<{ ticket: TicketDetail }>(`/api/tickets/${ticketId}`, {
        method: 'PATCH',
        body: JSON.stringify({ priority }),
      })
      setTicket(data.ticket)
      toast({ title: 'Priority updated' })
    } catch (err) {
      toast({ title: 'Could not update priority', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    }
  }

  async function submitReply() {
    if (!replyBody.trim()) {
      toast({ title: 'Reply is empty', variant: 'destructive' })
      return
    }
    setSending(true)
    try {
      await adminFetch(`/api/tickets/${ticketId}/replies`, {
        method: 'POST',
        body: JSON.stringify({ body: replyBody.trim(), visibility }),
      })
      setReplyBody('')
      toast({
        title: 'Reply posted',
        description: visibility === 'CLIENT' ? 'The client has been notified of the update.' : 'Saved as an internal note (not visible to the client).',
      })
      await load()
    } catch (err) {
      toast({ title: 'Could not post reply', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" asChild className="h-11">
          <Link href="/app/tickets"><ArrowLeft className="h-4 w-4" /> Tickets</Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{ticket.subject}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {ticket.client.name}
            {ticket.project ? ` · ${ticket.project.name}` : ''} · raised by {ticket.createdBy.name} · {formatDateTime(ticket.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {ticket.type === 'WEBSITE_CHANGE' ? 'Website change' : 'Support'}
          </Badge>
          <AdminStatusBadge status={ticket.priority} />
          <AdminStatusBadge status={ticket.status} />
        </div>
      </div>

      {canManage && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="status-select" className="text-xs text-muted-foreground">Status</Label>
            <Select value={ticket.status} onValueChange={(v) => void changeStatus(v)}>
              <SelectTrigger id="status-select" className="h-11 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TICKET_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase().replace('_', ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="priority-select" className="text-xs text-muted-foreground">Priority</Label>
            <Select value={ticket.priority} onValueChange={(v) => void changePriority(v)}>
              <SelectTrigger id="priority-select" className="h-11 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {ticket.resolvedAt ? (
            <p className="text-xs text-muted-foreground">Resolved {formatDateTime(ticket.resolvedAt)}</p>
          ) : null}
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Original ticket</CardTitle>
        </CardHeader>
        <CardContent className="whitespace-pre-wrap text-sm">{ticket.details}</CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Conversation</h2>
        <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
          {ticket.replies.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No replies yet.</p>
          ) : (
            ticket.replies.map((r) => {
              const clientVisible = r.visibility === 'CLIENT'
              return (
                <div
                  key={r.id}
                  className={cn(
                    'rounded-lg border p-3',
                    clientVisible ? 'bg-card' : 'bg-muted/40 border-dashed'
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{r.author.name}</span>
                    <Badge variant="outline" className="text-[10px]">{r.author.role.replace('_', ' ')}</Badge>
                    {clientVisible ? (
                      <Badge className="bg-primary text-primary-foreground">Visible to client</Badge>
                    ) : (
                      <Badge variant="secondary">Internal note</Badge>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{r.body}</p>
                </div>
              )
            })
          )}
        </div>
      </div>

      {canReply ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Add reply</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2">
              <Label htmlFor="reply-visibility">Visibility</Label>
              <Select
                value={visibility}
                onValueChange={setVisibility}
                disabled={isDeveloper}
              >
                <SelectTrigger id="reply-visibility" className="h-11 w-full sm:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPLY_VISIBILITIES.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v === 'CLIENT' ? 'Client-visible update' : 'Internal note (staff only)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {isDeveloper
                  ? 'Developers can only post internal notes on their assigned projects’ tickets.'
                  : visibility === 'CLIENT'
                    ? 'This reply will be shown in the client portal and the client will be notified.'
                    : 'Internal notes are never visible to the client.'}
              </p>
            </div>
            <Textarea
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              rows={3}
              maxLength={5000}
              placeholder={visibility === 'CLIENT' ? 'Write an update the client will see…' : 'Write an internal note…'}
              aria-label="Reply body"
            />
            <Button onClick={() => void submitReply()} disabled={sending || !replyBody.trim()} className="h-11">
              <Send className="h-4 w-4" /> {sending ? 'Posting…' : 'Post reply'}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          You can view this ticket but cannot reply — only staff on the assigned project can post updates.
        </p>
      )}
      {viewerId === ticket.createdBy.id ? (
        <p className="text-xs text-muted-foreground">You raised this ticket.</p>
      ) : null}
    </div>
  )
}
