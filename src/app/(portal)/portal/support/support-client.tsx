'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowRight, LifeBuoy, Loader2, Plus, SplitSquareHorizontal } from 'lucide-react'
import { ROLES } from '@/lib/constants'
import { formatDate } from '@/lib/format'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { apiSend, errorMessage, withScope } from '@/components/portal/api'
import { FounderScopeGate, FounderViewingBar, useFounderClientId } from '@/components/portal/founder-scope'
import { EmptyState, ErrorBox, friendlyStatus, Spinner, StatusBadge } from '@/components/portal/portal-ui'
import { useApi } from '@/components/portal/use-api'
import { useToast } from '@/hooks/use-toast'

type TicketRow = {
  id: string
  subject: string
  status: string
  priority: string
  type: string
  createdAt: string
  projectName: string | null
}

type ChangeRequestRow = {
  id: string
  title: string
  details: string
  status: string
  scopeImpact: string | null
  founderNotes: string | null
  decisionAt: string | null
  createdAt: string
  demoTitle: string | null
  projectName: string
}

type ProjectRow = { id: string; name: string }

export function SupportClient({ role }: { role: string }) {
  const isFounder = role === ROLES.FOUNDER
  const [clientId] = useFounderClientId()
  const scope = isFounder ? clientId : null
  const ticketsApi = useApi<{ tickets: TicketRow[]; counts: { total: number; open: number } }>(
    isFounder && !clientId ? null : withScope('/api/portal/tickets', scope),
  )
  const crApi = useApi<{ changeRequests: ChangeRequestRow[] }>(
    isFounder && !clientId ? null : withScope('/api/portal/change-requests', scope),
  )
  const projectsApi = useApi<{ projects: ProjectRow[] }>(
    isFounder && !clientId ? null : withScope('/api/portal/projects', scope),
  )
  const { toast } = useToast()

  // New ticket dialog state (shared by "new ticket" and "request a website change")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [presetType, setPresetType] = useState<'SUPPORT' | 'WEBSITE_CHANGE'>('SUPPORT')
  const [subject, setSubject] = useState('')
  const [type, setType] = useState<'SUPPORT' | 'WEBSITE_CHANGE'>('SUPPORT')
  const [projectId, setProjectId] = useState<string>('')
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const projects = useMemo(() => projectsApi.data?.projects ?? [], [projectsApi.data])

  function openDialog(preset: 'SUPPORT' | 'WEBSITE_CHANGE') {
    setPresetType(preset)
    setType(preset)
    setSubject('')
    setDetails('')
    setProjectId('')
    setDialogOpen(true)
  }

  async function submitTicket(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await apiSend<{ ticket: { id: string } }>('/api/portal/tickets', 'POST', {
        subject,
        details,
        type,
        projectId: projectId || undefined,
      })
      toast({ title: 'Request sent', description: 'Our team has been notified and will reply soon.' })
      setDialogOpen(false)
      ticketsApi.refetch()
      // Navigate straight into the thread so the client can see updates land.
      window.location.href = `/portal/support/${res.ticket.id}`
    } catch (err) {
      toast({ title: 'Could not send', description: errorMessage(err), variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {isFounder && clientId ? <FounderViewingBar /> : null}

      <header>
        <h1 className="text-2xl font-bold tracking-tight">Support</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ask us anything, report a problem, or request a change to your website.
        </p>
      </header>

      <Tabs defaultValue="tickets" className="space-y-4">
        <TabsList className="flex w-full flex-wrap sm:w-auto">
          <TabsTrigger value="tickets" className="min-h-11 flex-1 gap-1.5 sm:flex-none">
            <LifeBuoy className="h-4 w-4" aria-hidden /> Support tickets
          </TabsTrigger>
          <TabsTrigger value="changes" className="min-h-11 flex-1 gap-1.5 sm:flex-none">
            <SplitSquareHorizontal className="h-4 w-4" aria-hidden /> My change requests
          </TabsTrigger>
        </TabsList>

        {/* ------------------------------------------------ tickets tab */}
        <TabsContent value="tickets" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {ticketsApi.data ? `${ticketsApi.data.counts.open} open · ${ticketsApi.data.counts.total} total` : ' '}
            </p>
            <Button onClick={() => openDialog('SUPPORT')} className="min-h-11">
              <Plus className="mr-2 h-4 w-4" aria-hidden /> New support ticket
            </Button>
          </div>

          {ticketsApi.error ? <ErrorBox message={ticketsApi.error} /> : null}
          {ticketsApi.loading ? <Spinner /> : null}

          {!ticketsApi.loading && !ticketsApi.error && (ticketsApi.data?.tickets.length ?? 0) === 0 ? (
            <EmptyState
              title="No support tickets yet"
              hint="Stuck on something? Open a ticket and we'll help you out — you'll see our replies here."
            />
          ) : null}

          <ul className="space-y-3">
            {(ticketsApi.data?.tickets ?? []).map((t) => (
              <li key={t.id}>
                <Link
                  href={`/portal/support/${t.id}`}
                  className="block rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-accent"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium">{t.subject}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <StatusBadge status={t.priority} />
                      <StatusBadge status={t.status} />
                      <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Opened {formatDate(t.createdAt)}
                    {t.projectName ? ` · ${t.projectName}` : ''} · {friendlyStatus(t.type)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </TabsContent>

        {/* --------------------------------------------- change requests tab */}
        <TabsContent value="changes" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Requests raised from demo reviews, plus anything you ask for here.
            </p>
            <Button onClick={() => openDialog('WEBSITE_CHANGE')} className="min-h-11">
              <Plus className="mr-2 h-4 w-4" aria-hidden /> Request a website change
            </Button>
          </div>

          {crApi.error ? <ErrorBox message={crApi.error} /> : null}
          {crApi.loading ? <Spinner /> : null}

          {!crApi.loading && !crApi.error && (crApi.data?.changeRequests.length ?? 0) === 0 ? (
            <EmptyState
              title="No change requests yet"
              hint="Spot something you'd like different on your website? Request a change above, or raise it from a demo preview."
            />
          ) : null}

          <ul className="grid gap-4 md:grid-cols-2">
            {(crApi.data?.changeRequests ?? []).map((cr) => (
              <li key={cr.id}>
                <Card className="h-full">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="text-base">{cr.title}</CardTitle>
                      <StatusBadge status={cr.status} />
                    </div>
                    <CardDescription>
                      {cr.projectName}
                      {cr.demoTitle ? ` · from “${cr.demoTitle}”` : ''} · raised {formatDate(cr.createdAt)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <p className="line-clamp-3 whitespace-pre-wrap text-muted-foreground">{cr.details}</p>

                    {/* Decision timeline — outcome only, shared in plain English */}
                    <div className="rounded-lg border bg-muted/30 p-3 text-xs">
                      <p className="font-medium">Progress</p>
                      <ol className="mt-1.5 space-y-1">
                        <li className="flex items-center gap-1.5">
                          <span className="inline-block h-2 w-2 rounded-full bg-primary" aria-hidden />
                          Submitted {formatDate(cr.createdAt)}
                        </li>
                        {cr.decisionAt ? (
                          <li className="flex items-center gap-1.5">
                            <span className="inline-block h-2 w-2 rounded-full bg-primary" aria-hidden />
                            Reviewed {formatDate(cr.decisionAt)} — {friendlyStatus(cr.status)}
                          </li>
                        ) : (
                          <li className="flex items-center gap-1.5 text-muted-foreground">
                            <span className="inline-block h-2 w-2 rounded-full border" aria-hidden />
                            Awaiting review by our team
                          </li>
                        )}
                      </ol>
                      {cr.founderNotes ? (
                        <p className="mt-2 border-t pt-2 text-muted-foreground">
                          <span className="font-medium text-foreground">Our response: </span>
                          {cr.founderNotes}
                        </p>
                      ) : null}
                      {cr.scopeImpact === 'EXTRA_COST_QUOTED' ? (
                        <p className="mt-1 text-muted-foreground">
                          This change sits outside your current package — we&apos;ll send a separate quote before any
                          work starts.
                        </p>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </TabsContent>
      </Tabs>

      {/* ------------------------------------------------ new ticket dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{presetType === 'WEBSITE_CHANGE' ? 'Request a website change' : 'New support ticket'}</DialogTitle>
            <DialogDescription>
              {presetType === 'WEBSITE_CHANGE'
                ? 'Tell us what you\'d like changed on your website. We\'ll confirm scope before any work starts.'
                : 'Describe what you need and our team will get back to you.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitTicket} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ticket-subject">Subject</Label>
              <Input
                id="ticket-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Update opening hours"
                required
                minLength={3}
                maxLength={150}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ticket-type">Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as 'SUPPORT' | 'WEBSITE_CHANGE')}>
                  <SelectTrigger id="ticket-type" className="min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SUPPORT">Support question</SelectItem>
                    <SelectItem value="WEBSITE_CHANGE">Website change</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ticket-project">Project (optional)</Label>
                <Select value={projectId} onValueChange={(v) => setProjectId(v)}>
                  <SelectTrigger id="ticket-project" className="min-h-11">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ticket-details">Details</Label>
              <Textarea
                id="ticket-details"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Give us as much detail as you can…"
                rows={5}
                required
                minLength={5}
                maxLength={4000}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" className="min-h-11" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="min-h-11" disabled={submitting}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
                Send
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
