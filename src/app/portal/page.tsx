'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api, fmtDate, fmtMoney } from '@/lib/client'
import { StatusBadge } from '@/components/status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { CalendarDays, Film, Wallet, LifeBuoy, ArrowRight, Video, Eye } from 'lucide-react'

interface PortalData {
  client: { name: string; businessCategory: string } | null
  projects: Array<{ id: string; name: string; reference: string; serviceType: string; status: string; targetDate: string | null; videoProject: { agreedVideoCount: number } | null; _count: { deliverables: number; tasks: number } }>
  deliverablesInReview: number
  upcomingShoots: Array<{ id: string; title: string; date: string; startTime: string; address: string | null }>
  openTickets: number
  unreadNotifications: number
  invoices: Array<{ id: string; number: string; amount: number; status: string; dueDate: string | null }>
}

export default function PortalOverviewPage() {
  const [data, setData] = useState<PortalData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { api<PortalData>('/api/portal/overview').then(setData).catch(e => setError(e.message)) }, [])

  if (error) return <Alert variant="destructive"><AlertTitle>Failed to load</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
  if (!data) return <div className="space-y-4"><Skeleton className="h-8 w-64" /><div className="grid gap-4 sm:grid-cols-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28" />)}</div><Skeleton className="h-64" /></div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome{data.client ? `, ${data.client.name}` : ''}</h1>
        <p className="text-muted-foreground text-sm">Your projects, video reviews and deliveries — all in one place.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/portal/deliverables">
          <Card className="hover:border-primary/40 transition-colors h-full">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Videos awaiting your review</span><Eye className="h-4 w-4 text-muted-foreground" /></div>
              <p className="text-3xl font-bold mt-1">{data.deliverablesInReview}</p>
              {data.deliverablesInReview > 0 && <p className="text-xs text-primary mt-1">Review now →</p>}
            </CardContent>
          </Card>
        </Link>
        <Link href="/portal/projects">
          <Card className="hover:border-primary/40 transition-colors h-full">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Active projects</span><Film className="h-4 w-4 text-muted-foreground" /></div>
              <p className="text-3xl font-bold mt-1">{data.projects.length}</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/portal/support">
          <Card className="hover:border-primary/40 transition-colors h-full">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Open support requests</span><LifeBuoy className="h-4 w-4 text-muted-foreground" /></div>
              <p className="text-3xl font-bold mt-1">{data.openTickets}</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {data.upcomingShoots.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4" />Upcoming filming days</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.upcomingShoots.map(s => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <Video className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{s.title}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(s.date)} · from {s.startTime}{s.address ? ` · ${s.address}` : ''}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Your projects</CardTitle>
          <Button variant="ghost" size="sm" asChild><Link href="/portal/projects">All <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link></Button>
        </CardHeader>
        <CardContent>
          {data.projects.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">No projects yet — your account manager will set these up.</p> : (
            <div className="space-y-2">
              {data.projects.map(p => (
                <Link key={p.id} href="/portal/projects" className="flex items-center gap-3 rounded-lg border p-3 hover:border-primary/40">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.serviceType === 'VIDEO_PRODUCTION' ? `Video production · ${p.videoProject?.agreedVideoCount ?? 0} contracted videos` : 'Website project'}
                      {p.targetDate ? ` · target ${fmtDate(p.targetDate)}` : ''}
                    </p>
                  </div>
                  <StatusBadge status={p.status} />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {data.invoices.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4" />Recent invoices</CardTitle>
            <Button variant="ghost" size="sm" asChild><Link href="/portal/invoices">All <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link></Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.invoices.slice(0, 4).map(inv => (
              <div key={inv.id} className="flex items-center gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1"><p className="text-sm font-medium">{inv.number}</p><p className="text-xs text-muted-foreground">{inv.dueDate ? `Due ${fmtDate(inv.dueDate)}` : ''}</p></div>
                <span className="font-semibold">{fmtMoney(inv.amount)}</span>
                <StatusBadge status={inv.status} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
