'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Plus, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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
import { useToast } from '@/hooks/use-toast'
import { AdminEmptyState, AdminSpinner, AdminStatusBadge, adminFetch } from '@/components/internal/admin-bits'
import { formatDateTime } from '@/lib/format'
import { MAINTENANCE_CHECKS, MAINTENANCE_CHECK_STATUSES, ROLES, type Role } from '@/lib/constants'

type ProjectOption = { id: string; name: string; clientId: string; assignedToId: string | null; client: { name: string } }

type Check = { name: string; status: string; evidence: string; notes?: string }

type Report = {
  id: string
  projectId: string
  periodLabel: string
  checksJson: string
  summary: string | null
  status: string
  visibleToClient: boolean
  completedAt: string | null
  completedBy: { id: string; name: string } | null
  createdAt: string
  project: { id: string; name: string; client: { name: string } }
}

const EVIDENCE_HINT =
  'Evidence is required for every check — record what you actually saw (URL, dashboard value, backup log, etc.). Reports without evidence are rejected.'

function parseChecks(json: string): Check[] {
  try {
    const parsed: unknown = JSON.parse(json)
    if (Array.isArray(parsed)) return parsed as Check[]
    return []
  } catch {
    return []
  }
}

export function MaintenanceClient({
  role,
  userId,
  projects,
}: {
  role: Role
  userId: string
  projects: ProjectOption[]
}) {
  const { toast } = useToast()
  const [reports, setReports] = useState<Report[] | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // create form
  const [projectId, setProjectId] = useState('')
  const [periodLabel, setPeriodLabel] = useState('')
  const [summary, setSummary] = useState('')
  const [draftChecks, setDraftChecks] = useState<Check[]>(
    MAINTENANCE_CHECKS.map((name) => ({ name, status: 'PASS', evidence: '', notes: '' }))
  )

  const load = useCallback(async () => {
    setReports(null)
    try {
      const data = await adminFetch<{ reports: Report[] }>('/api/maintenance')
      setReports(data.reports)
    } catch (err) {
      toast({ title: 'Could not load maintenance reports', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
      setReports([])
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  function setCheck(index: number, patch: Partial<Check>) {
    setDraftChecks((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)))
  }

  async function submitReport() {
    if (!projectId || !periodLabel.trim()) {
      toast({ title: 'Missing fields', description: 'Project and period label are required.', variant: 'destructive' })
      return
    }
    const missingEvidence = draftChecks.find((c) => c.evidence.trim().length < 5)
    if (missingEvidence) {
      toast({
        title: 'Evidence missing',
        description: `“${missingEvidence.name}” needs evidence of at least 5 characters. ${EVIDENCE_HINT}`,
        variant: 'destructive',
      })
      return
    }
    setSubmitting(true)
    try {
      await adminFetch('/api/maintenance', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          periodLabel: periodLabel.trim(),
          checks: draftChecks.map((c) => ({ name: c.name, status: c.status, evidence: c.evidence.trim(), notes: c.notes?.trim() || undefined })),
          summary: summary.trim() || undefined,
        }),
      })
      toast({ title: 'Report created as draft', description: 'Complete it when the period\u2019s checks are finished.' })
      setCreateOpen(false)
      setProjectId('')
      setPeriodLabel('')
      setSummary('')
      setDraftChecks(MAINTENANCE_CHECKS.map((name) => ({ name, status: 'PASS', evidence: '', notes: '' })))
      await load()
    } catch (err) {
      toast({ title: 'Could not create report', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  async function completeReport(report: Report, visibleToClient: boolean) {
    try {
      await adminFetch(`/api/maintenance/${report.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'COMPLETED', visibleToClient }),
      })
      toast({
        title: 'Report completed',
        description: visibleToClient ? 'The client has been notified that their monthly report is ready.' : 'Saved as completed (not visible to the client).',
      })
      await load()
    } catch (err) {
      toast({ title: 'Could not complete report', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    }
  }

  async function toggleVisibility(report: Report) {
    try {
      await adminFetch(`/api/maintenance/${report.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ visibleToClient: !report.visibleToClient }),
      })
      await load()
    } catch (err) {
      toast({ title: 'Could not update visibility', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    }
  }

  const visibleProjects =
    role === ROLES.WEB_DEVELOPER ? projects.filter((p) => p.assignedToId === userId) : projects

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Maintenance reports</h1>
          <p className="text-sm text-muted-foreground">
            Monthly SOP checks with evidence. Every PASS/FAIL needs proof; SKIPPED needs a reason.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="h-11"><Plus className="h-4 w-4" /> New report</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>New maintenance report</DialogTitle>
              <DialogDescription>{EVIDENCE_HINT}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="maint-project">Project</Label>
                  <Select value={projectId} onValueChange={setProjectId}>
                    <SelectTrigger id="maint-project" className="h-11 w-full">
                      <SelectValue placeholder="Select a project" />
                    </SelectTrigger>
                    <SelectContent>
                      {visibleProjects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.client.name} — {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="maint-period">Period label</Label>
                  <Input id="maint-period" value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} placeholder="e.g. January 2026" className="h-11" maxLength={80} />
                </div>
              </div>
              <div className="space-y-3">
                <Label>SOP checks</Label>
                {draftChecks.map((c, i) => (
                  <div key={c.name} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[130px_120px_1fr]">
                    <div>
                      <p className="text-sm font-medium">{c.name}</p>
                      <Select value={c.status} onValueChange={(v) => setCheck(i, { status: v })}>
                        <SelectTrigger className="mt-1 h-11 w-[120px]" aria-label={`${c.name} result`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MAINTENANCE_CHECK_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor={`evidence-${c.name}`} className="text-xs text-muted-foreground">
                        Evidence {c.status === 'SKIPPED' ? '(reason for skipping)' : '(required)'}
                      </Label>
                      <Textarea
                        id={`evidence-${c.name}`}
                        value={c.evidence}
                        onChange={(e) => setCheck(i, { evidence: e.target.value })}
                        rows={2}
                        placeholder={c.status === 'SKIPPED' ? 'Why was this check skipped this period?' : 'What did you observe? Include specifics.'}
                      />
                      <Input
                        value={c.notes ?? ''}
                        onChange={(e) => setCheck(i, { notes: e.target.value })}
                        placeholder="Optional notes"
                        className="mt-2 h-11"
                        maxLength={1000}
                        aria-label={`${c.name} notes`}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="maint-summary">Summary (optional)</Label>
                <Textarea id="maint-summary" value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} maxLength={2000} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => void submitReport()} disabled={submitting} className="h-11 w-full sm:w-auto">
                {submitting ? 'Creating…' : 'Create draft report'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value="maintenance">
        <TabsList>
          <TabsTrigger value="tickets" asChild>
            <Link href="/app/tickets">Tickets</Link>
          </TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance reports</TabsTrigger>
        </TabsList>
      </Tabs>

      {reports === null ? (
        <AdminSpinner label="Loading reports…" />
      ) : reports.length === 0 ? (
        <AdminEmptyState title="No maintenance reports yet" description="Create the first monthly SOP report for one of your projects." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {reports.map((r) => {
            const checks = parseChecks(r.checksJson)
            return (
              <Card key={r.id}>
                <CardContent className="px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{r.project.client.name} — {r.project.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Period: {r.periodLabel} · {formatDateTime(r.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <AdminStatusBadge status={r.status} />
                      {r.visibleToClient ? (
                        <Badge variant="outline"><ShieldCheck className="h-3 w-3" /> Client-visible</Badge>
                      ) : (
                        <Badge variant="secondary">Internal</Badge>
                      )}
                    </div>
                  </div>

                  {r.completedAt ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Completed {formatDateTime(r.completedAt)}{r.completedBy ? ` by ${r.completedBy.name}` : ''}
                    </p>
                  ) : null}

                  <div className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
                    {checks.map((c) => (
                      <div key={c.name} className="rounded-md border p-2">
                        <div className="flex items-center gap-2">
                          <AdminStatusBadge status={c.status} />
                          <span className="text-sm font-medium">{c.name}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{c.evidence}</p>
                        {c.notes ? <p className="mt-1 text-xs italic text-muted-foreground">Notes: {c.notes}</p> : null}
                      </div>
                    ))}
                  </div>

                  {r.summary ? <p className="mt-3 text-sm">{r.summary}</p> : null}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {r.status !== 'COMPLETED' ? (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" className="h-11"><CheckCircle2 className="h-4 w-4" /> Mark completed</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Complete this maintenance report?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This stamps the report as completed under your name
                              {r.visibleToClient ? ' and notifies the client that their monthly report is ready.' : '.'}
                              Reported results must reflect the actual checks evidenced above.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => void completeReport(r, r.visibleToClient)}>
                              Complete report
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ) : null}
                    <label className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
                      <Checkbox checked={r.visibleToClient} onCheckedChange={() => void toggleVisibility(r)} aria-label="Toggle client visibility" />
                      Visible to client
                    </label>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
