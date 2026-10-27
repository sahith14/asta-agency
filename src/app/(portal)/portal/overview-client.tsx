'use client'

import Link from 'next/link'
import {
  ArrowRight,
  BellRing,
  FileText,
  Globe,
  LifeBuoy,
  MonitorSmartphone,
  ReceiptText,
  Sparkles,
} from 'lucide-react'
import { ROLES } from '@/lib/constants'
import { formatDate, formatGBP } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { withScope } from '@/components/portal/api'
import { FounderScopeGate, FounderViewingBar, useFounderClientId } from '@/components/portal/founder-scope'
import { EmptyState, ErrorBox, Spinner, StatusBadge } from '@/components/portal/portal-ui'
import { useApi } from '@/components/portal/use-api'

type OverviewData = {
  founder?: boolean
  clients?: { id: string; name: string }[]
  hint?: string
  client?: { id: string; name: string }
  activeProjects: { id: string; name: string; status: string; targetLaunchDate: string | null }[]
  demosAwaiting: { id: string; title: string; status: string; authorizedAt: string | null; projectName: string }[]
  outstandingInvoices: {
    id: string
    number: string
    amountCents: number
    currency: string
    status: string
    dueDate: string | null
  }[]
  openTickets: number
  unreadNotifications: number
  activeSubscription: {
    id: string
    planName: string
    monthlyPriceCents: number
    currency: string
    renewalDate: string | null
    status: string
  } | null
}

export function OverviewClient({ userName, role }: { userName: string; role: string }) {
  const isFounder = role === ROLES.FOUNDER
  const [clientId] = useFounderClientId()
  const path = isFounder ? (clientId ? withScope('/api/portal/overview', clientId) : null) : '/api/portal/overview'
  const { data, error, loading } = useApi<OverviewData>(path)

  if (isFounder && !clientId) return <FounderScopeGate />

  return (
    <div className="space-y-6">
      {isFounder && clientId ? <FounderViewingBar /> : null}

      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome back, {userName.split(' ')[0]}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {data?.client
            ? `Here's the latest on ${data.client.name}.`
            : 'Here\u2019s the latest on your website.'}
        </p>
      </header>

      {error ? <ErrorBox message={error} /> : null}
      {loading || (!error && !data) ? <Spinner /> : null}

      {data?.client ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Demos awaiting review */}
          <Card className="border-primary/40 bg-primary/[0.04] md:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <MonitorSmartphone className="h-4 w-4 text-primary" aria-hidden />
                Demos awaiting your review
              </CardTitle>
              <CardDescription>Look at the preview and tell us: approve it, or request changes.</CardDescription>
            </CardHeader>
            <CardContent>
              {data.demosAwaiting.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing to review right now — you&apos;re all caught up.</p>
              ) : (
                <ul className="space-y-2">
                  {data.demosAwaiting.map((d) => (
                    <li key={d.id}>
                      <Link
                        href={`/portal/demos/${d.id}`}
                        className="flex min-h-11 items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 text-sm transition-colors hover:bg-accent"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{d.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">{d.projectName}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <StatusBadge status={d.status} />
                          <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Projects */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe className="h-4 w-4 text-primary" aria-hidden />
                Your website project{data.activeProjects.length === 1 ? '' : 's'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.activeProjects.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active projects at the moment.</p>
              ) : (
                data.activeProjects.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate font-medium">{p.name}</span>
                    <StatusBadge status={p.status} />
                  </div>
                ))
              )}
              <Separator />
              <Button asChild variant="ghost" size="sm" className="min-h-11 w-full justify-between px-2">
                <Link href="/portal/projects">
                  View projects <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Outstanding invoices */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ReceiptText className="h-4 w-4 text-primary" aria-hidden />
                Outstanding invoices
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.outstandingInvoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">You&apos;re all square — nothing outstanding.</p>
              ) : (
                <ul className="space-y-2">
                  {data.outstandingInvoices.map((inv) => (
                    <li key={inv.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{inv.number}</span>
                        <span className="text-xs text-muted-foreground">Due {formatDate(inv.dueDate)}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="font-semibold">{formatGBP(inv.amountCents, inv.currency)}</span>
                        <StatusBadge status={inv.status} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Separator />
              <Button asChild variant="ghost" size="sm" className="min-h-11 w-full justify-between px-2">
                <Link href="/portal/billing">
                  Go to billing <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Support & notifications */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <LifeBuoy className="h-4 w-4 text-primary" aria-hidden />
                Support & updates
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span>Open support tickets</span>
                <Badge variant={data.openTickets > 0 ? 'secondary' : 'outline'}>{data.openTickets}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span>
                  <BellRing className="mr-1 inline h-3.5 w-3.5" aria-hidden /> Unread notifications
                </span>
                <Badge variant={data.unreadNotifications > 0 ? 'default' : 'outline'}>{data.unreadNotifications}</Badge>
              </div>
              <Separator />
              <Button asChild variant="ghost" size="sm" className="min-h-11 w-full justify-between px-2">
                <Link href="/portal/support">
                  Contact support <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Subscription */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden />
                Your care plan
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {data.activeSubscription ? (
                <>
                  <p className="font-medium">{data.activeSubscription.planName}</p>
                  <p className="text-muted-foreground">
                    {formatGBP(data.activeSubscription.monthlyPriceCents, data.activeSubscription.currency)} / month
                  </p>
                  <p className="text-muted-foreground">
                    Renews {formatDate(data.activeSubscription.renewalDate)}
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">No active care plan — ask us in Support if you&apos;d like one.</p>
              )}
            </CardContent>
          </Card>

          {/* Files teaser */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-primary" aria-hidden />
                Files & photos
              </CardTitle>
              <CardDescription>Send us logos, photos or documents for your website.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild size="sm" className="min-h-11">
                <Link href="/portal/assets">Open files</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {!loading && !error && data && !data.client ? (
        <EmptyState title="Nothing to show yet" hint="Once work starts on your website, updates will appear here." />
      ) : null}
    </div>
  )
}
