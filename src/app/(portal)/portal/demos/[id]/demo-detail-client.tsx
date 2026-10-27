'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  MessageSquareText,
  PencilLine,
  ShieldCheck,
  ThumbsUp,
} from 'lucide-react'
import { ROLES } from '@/lib/constants'
import { formatDate, formatDateTime } from '@/lib/format'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { apiSend, errorMessage, withScope } from '@/components/portal/api'
import { FounderScopeGate, FounderViewingBar, useFounderClientId } from '@/components/portal/founder-scope'
import { authorRoleLabel, EmptyState, ErrorBox, Spinner, StatusBadge } from '@/components/portal/portal-ui'
import { useApi } from '@/components/portal/use-api'
import { useToast } from '@/hooks/use-toast'
import { Loader2 } from 'lucide-react'

type Feedback = {
  id: string
  type: string
  message: string
  createdAt: string
  authorName: string
  authorRole: string
}

type DemoDetail = {
  id: string
  title: string
  demoUrl: string
  status: string
  authorizedAt: string | null
  clientApprovedAt: string | null
  createdAt: string
  project: { id: string; name: string }
  feedback: Feedback[]
}

const ACTIONABLE = ['SENT_TO_CLIENT', 'AUTHORIZED_FOR_PREVIEW', 'CHANGES_REQUESTED']

const FEEDBACK_LABELS: Record<string, string> = {
  APPROVAL: 'Approval',
  CHANGE_REQUEST: 'Change request',
  COMMENT: 'Comment',
}

export function DemoDetailClient({ demoId, role }: { demoId: string; role: string }) {
  const isFounder = role === ROLES.FOUNDER
  const [clientId] = useFounderClientId()
  const { data, error, loading, refetch } = useApi<{ demo: DemoDetail }>(
    isFounder && !clientId ? null : withScope(`/api/portal/demos/${demoId}`, isFounder ? clientId : null),
  )
  const { toast } = useToast()

  const [approving, setApproving] = useState(false)
  const [crOpen, setCrOpen] = useState(false)
  const [crTitle, setCrTitle] = useState('')
  const [crDetails, setCrDetails] = useState('')
  const [crSubmitting, setCrSubmitting] = useState(false)

  if (isFounder && !clientId) return <FounderScopeGate />

  const demo = data?.demo

  async function approve() {
    setApproving(true)
    try {
      await apiSend(`/api/portal/demos/${demoId}/approve`, 'POST', {})
      toast({
        title: 'Demo approved',
        description: 'Thank you — our team has been notified. No extra work or charges are created by approving.',
      })
      refetch()
    } catch (err) {
      toast({ title: 'Could not approve', description: errorMessage(err), variant: 'destructive' })
    } finally {
      setApproving(false)
    }
  }

  async function submitChangeRequest(e: React.FormEvent) {
    e.preventDefault()
    setCrSubmitting(true)
    try {
      await apiSend(`/api/portal/demos/${demoId}/request-changes`, 'POST', {
        title: crTitle,
        details: crDetails,
      })
      toast({
        title: 'Change request sent',
        description: 'Our team will review it and get back to you.',
      })
      setCrOpen(false)
      setCrTitle('')
      setCrDetails('')
      refetch()
    } catch (err) {
      toast({ title: 'Could not send request', description: errorMessage(err), variant: 'destructive' })
    } finally {
      setCrSubmitting(false)
    }
  }

  const actionable = demo ? ACTIONABLE.includes(demo.status) : false
  const approved = demo?.status === 'APPROVED'

  return (
    <div className="space-y-6">
      {isFounder && clientId ? <FounderViewingBar /> : null}

      <Link
        href="/portal/demos"
        className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> All demos &amp; previews
      </Link>

      {error ? <ErrorBox message={error} /> : null}
      {loading ? <Spinner /> : null}

      {demo ? (
        <>
          <header className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{demo.title}</h1>
              <StatusBadge status={demo.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {demo.project.name} · sent for your review{' '}
              {formatDate(demo.authorizedAt ?? demo.createdAt)}
            </p>
          </header>

          {/* Status timeline */}
          <ol className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden /> Prepared by our team
            </li>
            {demo.authorizedAt ? (
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden /> Authorized {formatDate(demo.authorizedAt)}
              </li>
            ) : null}
            <li className="flex items-center gap-1.5">
              {approved ? (
                <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
              ) : (
                <span className="inline-block h-4 w-4 rounded-full border" aria-hidden />
              )}
              {approved ? `Approved ${formatDate(demo.clientApprovedAt)}` : 'Your approval'}
            </li>
          </ol>

          {demo.status === 'CHANGES_REQUESTED' ? (
            <Alert>
              <MessageSquareText className="h-4 w-4" aria-hidden />
              <AlertDescription>
                Changes requested — our team is reviewing. You can still view the preview, or approve it whenever
                you&apos;re happy.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Preview + approval */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Website preview</CardTitle>
                <CardDescription>
                  The link below opens your website preview in a new tab. Have a good look around first.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <Button asChild className="min-h-11 w-full sm:w-auto">
                  <a href={demo.demoUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" aria-hidden />
                    Open website preview
                  </a>
                </Button>

                <Separator />

                {approved ? (
                  <div className="space-y-2">
                    <p className="flex items-center gap-2 font-medium text-primary">
                      <CheckCircle2 className="h-5 w-5" aria-hidden /> Approved on {formatDate(demo.clientApprovedAt)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Thank you — our team has been notified. Approving a demo confirms you&apos;re happy with the
                      design; it doesn&apos;t authorise any extra work, publishing or charges.
                    </p>
                  </div>
                ) : actionable ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Happy with what you see? Approve it and we&apos;ll move to the next step. Need something changed?
                      Request changes instead — both are fine at any time.
                    </p>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button className="min-h-11" disabled={approving}>
                            {approving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <ThumbsUp className="mr-2 h-4 w-4" aria-hidden />}
                            Approve demo
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Approve this demo?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Approving tells our team you&apos;re happy with this preview. It does not authorise any
                              extra work, publishing or charges. If you&apos;d like something changed, choose
                              &ldquo;Request changes&rdquo; instead.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="min-h-11">Cancel</AlertDialogCancel>
                            <AlertDialogAction className="min-h-11" onClick={approve}>
                              Yes, approve it
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>

                      <Dialog open={crOpen} onOpenChange={setCrOpen}>
                        <DialogTrigger asChild>
                          <Button variant="outline" className="min-h-11">
                            <PencilLine className="mr-2 h-4 w-4" aria-hidden />
                            Request changes
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-lg">
                          <DialogHeader>
                            <DialogTitle>Request changes</DialogTitle>
                            <DialogDescription>
                              Tell us what you&apos;d like adjusted. Our team will review and come back to you.
                            </DialogDescription>
                          </DialogHeader>
                          <form onSubmit={submitChangeRequest} className="space-y-4">
                            <div className="space-y-2">
                              <Label htmlFor="cr-title">Summary</Label>
                              <Input
                                id="cr-title"
                                value={crTitle}
                                onChange={(e) => setCrTitle(e.target.value)}
                                placeholder="e.g. Please use our real logo"
                                required
                                minLength={3}
                                maxLength={150}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="cr-details">Details</Label>
                              <Textarea
                                id="cr-details"
                                value={crDetails}
                                onChange={(e) => setCrDetails(e.target.value)}
                                placeholder="Describe the changes you'd like…"
                                rows={5}
                                required
                                minLength={5}
                                maxLength={4000}
                              />
                            </div>
                            <DialogFooter>
                              <Button
                                type="button"
                                variant="outline"
                                className="min-h-11"
                                onClick={() => setCrOpen(false)}
                              >
                                Cancel
                              </Button>
                              <Button type="submit" className="min-h-11" disabled={crSubmitting}>
                                {crSubmitting ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                                ) : null}
                                Send request
                              </Button>
                            </DialogFooter>
                          </form>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {/* Feedback history */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <MessageSquareText className="h-4 w-4 text-primary" aria-hidden />
                  Feedback history
                </CardTitle>
                <CardDescription>Everything said about this preview, newest last.</CardDescription>
              </CardHeader>
              <CardContent>
                {demo.feedback.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No feedback yet — yours could be the first.</p>
                ) : (
                  <ul className="max-h-96 space-y-4 overflow-y-auto pr-1">
                    {demo.feedback.map((f) => (
                      <li key={f.id} className="rounded-lg border bg-muted/30 p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">
                            {f.authorName}
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              {authorRoleLabel(f.authorRole)}
                            </span>
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{formatDateTime(f.createdAt)}</span>
                          </span>
                        </div>
                        <p className="mt-1.5 whitespace-pre-wrap text-muted-foreground">{f.message}</p>
                        <p className="mt-1.5 text-[11px] uppercase tracking-wide text-muted-foreground/70">
                          {FEEDBACK_LABELS[f.type] ?? f.type}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                <Separator className="my-4" />
                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  Every approval and change request is recorded in an audit trail, so there&apos;s always a clear record
                  of who decided what.
                </p>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}

      {!loading && !error && !demo ? (
        <EmptyState
          title="Preview not found"
          hint="This preview doesn't exist or isn't linked to your account."
        />
      ) : null}
    </div>
  )
}
