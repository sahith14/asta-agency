'use client'

import Link from 'next/link'
import { ArrowRight, MonitorPlay } from 'lucide-react'
import { ROLES } from '@/lib/constants'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { withScope } from '@/components/portal/api'
import { FounderScopeGate, FounderViewingBar, useFounderClientId } from '@/components/portal/founder-scope'
import { EmptyState, ErrorBox, Spinner, StatusBadge } from '@/components/portal/portal-ui'
import { useApi } from '@/components/portal/use-api'

type DemoListItem = {
  id: string
  title: string
  status: string
  authorizedAt: string | null
  clientApprovedAt: string | null
  projectName: string
}

const NEEDS_REVIEW = ['AUTHORIZED_FOR_PREVIEW', 'SENT_TO_CLIENT', 'CHANGES_REQUESTED']

export function DemosClient({ role }: { role: string }) {
  const isFounder = role === ROLES.FOUNDER
  const [clientId] = useFounderClientId()
  const { data, error, loading } = useApi<{ demos: DemoListItem[] }>(
    isFounder && !clientId ? null : withScope('/api/portal/demos', isFounder ? clientId : null),
  )

  if (isFounder && !clientId) return <FounderScopeGate />

  const demos = data?.demos ?? []
  const needsReview = demos.filter((d) => NEEDS_REVIEW.includes(d.status))
  const others = demos.filter((d) => !NEEDS_REVIEW.includes(d.status))

  return (
    <div className="space-y-6">
      {isFounder && clientId ? <FounderViewingBar /> : null}

      <header>
        <h1 className="text-2xl font-bold tracking-tight">Demos &amp; previews</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Look at your website previews and tell us what you think — approve them or request changes.
        </p>
      </header>

      {error ? <ErrorBox message={error} /> : null}
      {loading ? <Spinner /> : null}

      {!loading && !error && demos.length === 0 ? (
        <EmptyState
          title="No previews yet"
          hint="When we have something to show you, a preview link will appear here."
          icon={MonitorPlay}
        />
      ) : null}

      {needsReview.length > 0 ? (
        <section className="space-y-3" aria-label="Demos needing your review">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-primary">Needs your review</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {needsReview.map((d) => (
              <Card key={d.id} className="border-primary/50 bg-primary/[0.04] transition-shadow hover:shadow-md">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-base">{d.title}</CardTitle>
                    <StatusBadge status={d.status} />
                  </div>
                  <CardDescription>
                    {d.projectName}
                    {d.authorizedAt ? ` · sent ${formatDate(d.authorizedAt)}` : ''}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {d.status === 'CHANGES_REQUESTED' ? (
                    <p className="mb-3 text-sm text-muted-foreground">
                      Changes requested — our team is reviewing. You can still view the preview or approve it whenever
                      you&apos;re happy.
                    </p>
                  ) : null}
                  <Buttonish href={`/portal/demos/${d.id}`} label="Review demo" />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {others.length > 0 ? (
        <section className="space-y-3" aria-label="Earlier demos">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Approved previews</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {others.map((d) => (
              <Card key={d.id} className="transition-shadow hover:shadow-md">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-base">{d.title}</CardTitle>
                    <StatusBadge status={d.status} />
                  </div>
                  <CardDescription>
                    {d.projectName}
                    {d.clientApprovedAt ? ` · approved ${formatDate(d.clientApprovedAt)}` : ''}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Buttonish href={`/portal/demos/${d.id}`} label="View details" />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

function Buttonish({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex min-h-11 w-full items-center justify-between rounded-md border px-4 text-sm font-medium transition-colors',
        'bg-background hover:bg-accent hover:text-accent-foreground',
      )}
    >
      {label}
      <ArrowRight className="h-4 w-4" aria-hidden />
    </Link>
  )
}
