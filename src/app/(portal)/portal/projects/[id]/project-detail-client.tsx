'use client'

import Link from 'next/link'
import { ArrowLeft, CalendarDays, CheckCircle2, Circle, CircleDot, Package, Wrench } from 'lucide-react'
import { ROLES } from '@/lib/constants'
import { formatDate } from '@/lib/format'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { withScope } from '@/components/portal/api'
import { FounderScopeGate, FounderViewingBar, useFounderClientId } from '@/components/portal/founder-scope'
import { EmptyState, ErrorBox, friendlyStatus, Spinner, StatusBadge } from '@/components/portal/portal-ui'
import { useApi } from '@/components/portal/use-api'

type Check = { name?: string; status?: string; evidence?: string; notes?: string }

type ProjectDetail = {
  id: string
  name: string
  description: string | null
  status: string
  packageType: string | null
  startDate: string | null
  targetLaunchDate: string | null
  deployApprovedAt: string | null
  milestones: { id: string; title: string; status: string; dueDate: string | null; completedAt: string | null }[]
  deliverables: { id: string; title: string; status: string }[]
  maintenanceReports: {
    id: string
    periodLabel: string
    summary: string | null
    completedAt: string | null
    checks: Check[]
  }[]
}

function MilestoneDot({ status }: { status: string }) {
  if (status === 'APPROVED') return <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" aria-hidden />
  if (status === 'DELIVERED') return <CheckCircle2 className="h-5 w-5 shrink-0 text-primary/70" aria-hidden />
  if (status === 'IN_PROGRESS') return <CircleDot className="h-5 w-5 shrink-0 text-primary/70" aria-hidden />
  return <Circle className="h-5 w-5 shrink-0 text-muted-foreground/50" aria-hidden />
}

export function ProjectDetailClient({ projectId, role }: { projectId: string; role: string }) {
  const isFounder = role === ROLES.FOUNDER
  const [clientId] = useFounderClientId()
  const { data, error, loading } = useApi<{ project: ProjectDetail }>(
    isFounder && !clientId ? null : withScope(`/api/portal/projects/${projectId}`, isFounder ? clientId : null),
  )

  if (isFounder && !clientId) return <FounderScopeGate />

  const project = data?.project

  return (
    <div className="space-y-6">
      {isFounder && clientId ? <FounderViewingBar /> : null}

      <Link
        href="/portal/projects"
        className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> All projects
      </Link>

      {error ? <ErrorBox message={error} /> : null}
      {loading ? <Spinner /> : null}

      {project ? (
        <>
          {project.deployApprovedAt ? (
            <Alert className="border-primary/40 bg-primary/10 text-primary">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              <AlertDescription className="font-medium text-primary">
                Website launched — {formatDate(project.deployApprovedAt)}. Your new website is live. Thank you for
                building it with us!
              </AlertDescription>
            </Alert>
          ) : null}

          <header className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
              <StatusBadge status={project.status} />
            </div>
            {project.description ? <p className="max-w-3xl text-sm text-muted-foreground">{project.description}</p> : null}
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
              {project.packageType ? (
                <span className="flex items-center gap-1.5">
                  <Package className="h-4 w-4" aria-hidden /> {project.packageType}
                </span>
              ) : null}
              {project.startDate ? <span>Started {formatDate(project.startDate)}</span> : null}
              {project.targetLaunchDate ? (
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4" aria-hidden /> Target launch {formatDate(project.targetLaunchDate)}
                </span>
              ) : null}
            </div>
          </header>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Milestone timeline */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Milestones</CardTitle>
                <CardDescription>How the build is progressing.</CardDescription>
              </CardHeader>
              <CardContent>
                {project.milestones.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Milestones will appear here once the plan is agreed.</p>
                ) : (
                  <ol className="space-y-0">
                    {project.milestones.map((m, i) => (
                      <li key={m.id} className="relative flex gap-3 pb-6 last:pb-0">
                        {i < project.milestones.length - 1 ? (
                          <span className="absolute left-[9px] top-6 h-full w-px bg-border" aria-hidden />
                        ) : null}
                        <MilestoneDot status={m.status} />
                        <div className="min-w-0">
                          <p className="font-medium leading-5">{m.title}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <StatusBadge status={m.status} />
                            {m.completedAt ? <span>Completed {formatDate(m.completedAt)}</span> : null}
                            {!m.completedAt && m.dueDate ? <span>Due {formatDate(m.dueDate)}</span> : null}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>

            {/* Deliverables */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Deliverables</CardTitle>
                <CardDescription>What we&apos;re building for you.</CardDescription>
              </CardHeader>
              <CardContent>
                {project.deliverables.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Deliverables will be listed once agreed.</p>
                ) : (
                  <ul className="space-y-3">
                    {project.deliverables.map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate font-medium">{d.title}</span>
                        <StatusBadge status={d.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Maintenance reports */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Wrench className="h-4 w-4 text-primary" aria-hidden />
                Website care reports
              </CardTitle>
              <CardDescription>
                Honest monthly checks on your website — including anything that failed and what we&apos;re doing about
                it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {project.maintenanceReports.length === 0 ? (
                <EmptyState
                  title="No care reports yet"
                  hint="Once your care plan starts, monthly health-check reports will appear here."
                />
              ) : (
                <Accordion type="multiple" className="w-full">
                  {project.maintenanceReports.map((r) => (
                    <AccordionItem key={r.id} value={r.id}>
                      <AccordionTrigger className="min-h-11 text-left">
                        <span className="flex flex-wrap items-center gap-2 pr-2">
                          <span className="font-medium">{r.periodLabel}</span>
                          <span className="text-xs text-muted-foreground">Completed {formatDate(r.completedAt)}</span>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-3">
                        {r.summary ? <p className="text-sm">{r.summary}</p> : null}
                        <Separator />
                        <ul className="space-y-3">
                          {r.checks.map((c, idx) => (
                            <li key={idx} className="text-sm">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium">{friendlyStatus(c.name)}</span>
                                <StatusBadge status={c.status} />
                              </div>
                              {c.evidence ? (
                                <p className="mt-0.5 text-xs text-muted-foreground">Evidence: {c.evidence}</p>
                              ) : null}
                              {c.notes ? <p className="mt-0.5 text-xs text-muted-foreground">{c.notes}</p> : null}
                            </li>
                          ))}
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

      {!loading && !error && !project ? (
        <EmptyState title="Project not found" hint="This project doesn't exist or isn't linked to your account." />
      ) : null}
    </div>
  )
}
