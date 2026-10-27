'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowLeft, LifeBuoy, Loader2, SendHorizonal } from 'lucide-react'
import { ROLES } from '@/lib/constants'
import { formatDate, formatDateTime } from '@/lib/format'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { apiSend, errorMessage, withScope } from '@/components/portal/api'
import { FounderScopeGate, FounderViewingBar, useFounderClientId } from '@/components/portal/founder-scope'
import { authorRoleLabel, EmptyState, ErrorBox, Spinner, StatusBadge } from '@/components/portal/portal-ui'
import { useApi } from '@/components/portal/use-api'
import { useToast } from '@/hooks/use-toast'

type Reply = {
  id: string
  body: string
  createdAt: string
  authorId: string
  authorName: string
  authorRole: string
}

type TicketDetail = {
  id: string
  subject: string
  details: string
  status: string
  priority: string
  type: string
  createdAt: string
  projectName: string | null
  replies: Reply[]
}

export function TicketDetailClient({
  ticketId,
  role,
  userId,
}: {
  ticketId: string
  role: string
  userId: string
}) {
  const isFounder = role === ROLES.FOUNDER
  const [clientId] = useFounderClientId()
  const { data, error, loading, refetch } = useApi<{ ticket: TicketDetail }>(
    isFounder && !clientId ? null : withScope(`/api/portal/tickets/${ticketId}`, isFounder ? clientId : null),
  )
  const { toast } = useToast()

  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  if (isFounder && !clientId) return <FounderScopeGate />

  const ticket = data?.ticket

  async function submitReply(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setSending(true)
    try {
      await apiSend(`/api/portal/tickets/${ticketId}/replies`, 'POST', { body: body.trim() })
      toast({ title: 'Reply sent', description: 'Our team has been notified.' })
      setBody('')
      refetch()
    } catch (err) {
      toast({ title: 'Could not send reply', description: errorMessage(err), variant: 'destructive' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6">
      {isFounder && clientId ? <FounderViewingBar /> : null}

      <Link
        href="/portal/support"
        className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> All support tickets
      </Link>

      {error ? <ErrorBox message={error} /> : null}
      {loading ? <Spinner /> : null}

      {ticket ? (
        <>
          <header className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{ticket.subject}</h1>
              <StatusBadge status={ticket.priority} />
              <StatusBadge status={ticket.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              Opened {formatDate(ticket.createdAt)}
              {ticket.projectName ? ` · ${ticket.projectName}` : ''}
            </p>
          </header>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">What you told us</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{ticket.details}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Updates &amp; conversation</CardTitle>
              <CardDescription>
                Progress updates from our team appear here — you&apos;ll only ever see replies meant for you.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {ticket.replies.length === 0 ? (
                <EmptyState
                  title="No replies yet"
                  hint="We've got your ticket — our team will post an update here soon."
                  icon={LifeBuoy}
                />
              ) : (
                <ul className="max-h-96 space-y-3 overflow-y-auto pr-1">
                  {ticket.replies.map((r) => {
                    const own = r.authorRole === 'CLIENT' || r.authorId === userId
                    return (
                      <li
                        key={r.id}
                        className={`rounded-lg border p-3 text-sm ${own ? 'border-primary/40 bg-primary/[0.04]' : 'bg-muted/30'}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">
                            {own ? 'You' : r.authorName}
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              {authorRoleLabel(r.authorRole)}
                            </span>
                          </span>
                          <span className="text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</span>
                        </div>
                        <p className="mt-1.5 whitespace-pre-wrap text-muted-foreground">{r.body}</p>
                      </li>
                    )
                  })}
                </ul>
              )}

              <Separator />

              {ticket.status === 'RESOLVED' || ticket.status === 'CLOSED' ? (
                <Alert>
                  <AlertDescription className="text-sm">
                    This ticket is {ticket.status === 'CLOSED' ? 'closed' : 'marked resolved'}. If you still need
                    something, just reply below and we&apos;ll pick it back up.
                  </AlertDescription>
                </Alert>
              ) : null}

              <form onSubmit={submitReply} className="space-y-3">
                <Label htmlFor="reply-body" className="sr-only">
                  Write a reply
                </Label>
                <Textarea
                  id="reply-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write a reply…"
                  rows={4}
                  required
                  minLength={1}
                  maxLength={4000}
                />
                <Button type="submit" className="min-h-11" disabled={sending || !body.trim()}>
                  {sending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <SendHorizonal className="mr-2 h-4 w-4" aria-hidden />
                  )}
                  Send reply
                </Button>
              </form>
            </CardContent>
          </Card>
        </>
      ) : null}

      {!loading && !error && !ticket ? (
        <EmptyState title="Ticket not found" hint="This ticket doesn't exist or isn't linked to your account." />
      ) : null}
    </div>
  )
}
