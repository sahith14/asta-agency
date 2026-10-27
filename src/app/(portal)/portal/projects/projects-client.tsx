'use client'

import Link from 'next/link'
import { ArrowRight, CalendarDays, Globe } from 'lucide-react'
import { ROLES } from '@/lib/constants'
import { formatDate } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { withScope } from '@/components/portal/api'
import { FounderScopeGate, FounderViewingBar, useFounderClientId } from '@/components/portal/founder-scope'
import { EmptyState, ErrorBox, Spinner, StatusBadge } from '@/components/portal/portal-ui'
import { useApi } from '@/components/portal/use-api'

type ProjectListItem = {
  id: string
  name: string
  status: string
  packageType: string | null
  startDate: string | null
  targetLaunchDate: string | null
  deployApprovedAt: string | null
  milestones: { id: string; title: string; status: string; dueDate: string | null; completedAt: string | null }[]
  deliverables: { id: string; title: string; status: string }[]
}

export function ProjectsClient({ role }: { role: string }) {
  const isFounder = role === ROLES.FOUNDER
  const [clientId] = useFounderClientId()
  const { data, error, loading } = useApi<{ projects: ProjectListItem[] }>(
    isFounder && !clientId ? null : withScope('/api/portal/projects', isFounder ? clientId : null),
  )

  if (isFounder && !clientId) return <FounderScopeGate />

  const projects = data?.projects ?? []

  return (
    <div className="space-y-6">
      {isFounder && clientId ? <FounderViewingBar /> : null}

      <header>
        <h1 className="text-2xl font-bold tracking-tight">My websites</h1>
        <p className="mt-1 text-sm text-muted-foreground">Progress, milestones and what&apos;s coming next.</p>
      </header>

      {error ? <ErrorBox message={error} /> : null}
      {loading ? <Spinner /> : null}

      {!loading && !error && projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          hint="When we start building your website, you'll be able to follow its progress here."
          icon={Globe}
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {projects.map((p) => {
          const done = p.milestones.filter((m) => m.status === 'APPROVED' || m.status === 'DELIVERED').length
          return (
            <Card key={p.id} className="flex flex-col transition-shadow hover:shadow-md">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-base">
                    <Link href={`/portal/projects/${p.id}`} className="hover:underline">
                      {p.name}
                    </Link>
                  </CardTitle>
                  <StatusBadge status={p.status} />
                </div>
                {p.packageType ? <CardDescription>{p.packageType}</CardDescription> : null}
              </CardHeader>
              <CardContent className="mt-auto space-y-3">
                {p.deployApprovedAt ? (
                  <Badge className="bg-primary text-primary-foreground">Website launched</Badge>
                ) : p.targetLaunchDate ? (
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <CalendarDays className="h-4 w-4" aria-hidden />
                    Target launch {formatDate(p.targetLaunchDate)}
                  </p>
                ) : null}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {p.milestones.length === 0
                      ? 'Milestones coming soon'
                      : `${done} of ${p.milestones.length} milestones done`}
                  </span>
                  <span className="text-muted-foreground">{p.deliverables.length} deliverables</span>
                </div>
                <Button asChild variant="outline" size="sm" className="min-h-11 w-full justify-between">
                  <Link href={`/portal/projects/${p.id}`}>
                    Open project <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
