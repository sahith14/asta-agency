'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Send } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { apiSend, errorMessage, withScope } from '@/components/portal/api'
import { useApi } from '@/components/portal/use-api'
import { FounderScopeGate, FounderViewingBar, useFounderClientId } from '@/components/portal/founder-scope'
import { EmptyState as PortalEmptyState, Spinner as PortalSpinner } from '@/components/portal/portal-ui'
import { useToast } from '@/hooks/use-toast'
import { ROLES } from '@/lib/constants'
import { formatDateTime, humanizeStatus, statusTone } from '@/lib/format'

type PortalBrief = {
  id: string
  title: string
  status: string
  budget: string | null
  timeline: string | null
  reviewNotes: string | null
  submittedAt: string | null
  updatedAt: string
  project: { id: string; name: string } | null
}

export function BriefsPortalClient({ role }: { role: string }) {
  const isFounder = role === ROLES.FOUNDER
  const [clientId] = useFounderClientId()
  const { data, error, loading, refetch } = useApi<{ briefs: PortalBrief[] }>(
    isFounder && !clientId ? null : withScope('/api/portal/briefs', isFounder ? clientId : null)
  )
  const router = useRouter()
  const [creating, setCreating] = useState(false)

  if (isFounder && !clientId) return <FounderScopeGate />

  const briefs = data?.briefs ?? []

  return (
    <div className="space-y-6">
      {isFounder && clientId ? <FounderViewingBar /> : null}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Briefs</h1>
          <p className="text-sm text-muted-foreground">
            Tell us what you need. A brief is the fastest way to start a new piece of work — we review every submission.
          </p>
        </div>
        <Button className="min-h-[44px]" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> New brief
        </Button>
      </header>

      {creating ? (
        <BriefFormDialog
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false)
            void refetch()
            router.refresh()
          }}
        />
      ) : null}

      {loading ? (
        <PortalSpinner label="Loading briefs…" />
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : briefs.length === 0 ? (
        <PortalEmptyState
          title="No briefs yet"
          hint="Create your first brief to describe a new project or piece of work. You can save it as a draft and submit it when you're ready."
        />
      ) : (
        <div className="space-y-3">
          {briefs.map((b) => (
            <Card key={b.id}>
              <CardContent className="space-y-2 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold leading-snug">{b.title}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusTone(b.status)}>{humanizeStatus(b.status)}</Badge>
                    {b.status === 'DRAFT' ? <DraftActions id={b.id} onSaved={() => { void refetch(); router.refresh() }} /> : null}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  {b.project ? `${b.project.name} · ` : ''}
                  {b.submittedAt ? `Submitted ${formatDateTime(b.submittedAt)}` : `Last edited ${formatDateTime(b.updatedAt)}`}
                </p>
                {b.reviewNotes ? (
                  <p className="rounded-md bg-muted/60 p-2 text-sm">
                    <span className="font-medium">Our response: </span>
                    {b.reviewNotes}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function DraftActions({ id, onSaved }: { id: string; onSaved: () => void }) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      await apiSend(`/api/portal/briefs/${id}`, 'PATCH', { submit: true })
      toast({ title: 'Brief submitted', description: 'Our team will review it and get back to you.' })
      onSaved()
    } catch (err) {
      toast({ title: 'Could not submit', description: errorMessage(err), variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button size="sm" variant="outline" className="min-h-[44px]" disabled={busy} onClick={() => void submit()}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit
    </Button>
  )
}

function BriefFormDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const submitModeRef = useRef(false)

  function save(submit: boolean) {
    submitModeRef.current = submit
    formRef.current?.requestSubmit()
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const submit = submitModeRef.current
    const form = new FormData(e.currentTarget)
    setBusy(true)
    try {
      await apiSend('/api/portal/briefs', 'POST', {
        title: form.get('title'),
        objectives: form.get('objectives'),
        audience: form.get('audience'),
        scope: form.get('scope'),
        budget: form.get('budget') || null,
        timeline: form.get('timeline') || null,
        notes: form.get('notes') || null,
        submit,
      })
      toast({
        title: submit ? 'Brief submitted' : 'Draft saved',
        description: submit ? 'Our team will review it and get back to you.' : 'You can submit it any time.',
      })
      onSaved()
    } catch (err) {
      toast({ title: 'Could not save brief', description: errorMessage(err), variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New brief</DialogTitle>
          <DialogDescription>Give us the essentials. You can save a draft and submit later.</DialogDescription>
        </DialogHeader>
        <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="b-title">What is this work? *</Label>
            <Input id="b-title" name="title" required maxLength={160} className="h-11" placeholder="e.g. Online booking system" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-obj">Objectives *</Label>
            <Textarea id="b-obj" name="objectives" required rows={3} maxLength={3000} className="min-h-[44px]" placeholder="What should this achieve for your business?" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-aud">Target audience *</Label>
            <Textarea id="b-aud" name="audience" required rows={2} maxLength={2000} className="min-h-[44px]" placeholder="Who is it for?" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-scope">Scope *</Label>
            <Textarea id="b-scope" name="scope" required rows={4} maxLength={3000} className="min-h-[44px]" placeholder="Pages, features, anything specific you need…" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="b-budget">Budget (optional)</Label>
              <Input id="b-budget" name="budget" maxLength={100} className="h-11" placeholder="e.g. £1,000–£2,000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-time">Timeline (optional)</Label>
              <Input id="b-time" name="timeline" maxLength={200} className="h-11" placeholder="e.g. Before the summer season" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-notes">Anything else (optional)</Label>
            <Textarea id="b-notes" name="notes" rows={2} maxLength={2000} className="min-h-[44px]" />
          </div>
          <DialogFooter className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" disabled={busy} onClick={() => save(false)} className="min-h-[44px] sm:mr-auto">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save draft
            </Button>
            <Button type="button" disabled={busy} onClick={() => save(true)} className="min-h-[44px]">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Save &amp; submit
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
