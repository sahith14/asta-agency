'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api, fmtDate, STATUS_COLORS } from '@/lib/client'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import { Clapperboard, Film, CalendarDays, AlertTriangle, CheckCircle2, Clock, Scissors, Eye, PackageCheck, Plus, ListVideo } from 'lucide-react'

interface Dash {
  totals: { contracted: number; delivered: number; cancelled: number; remaining: number; overdue: number; completion: number | null; activeProjects: number; awaitingInternalReview: number; awaitingClientReview: number }
  stageCounts: Record<string, number>
  upcomingShoots: Array<{ id: string; title: string; date: string; startTime: string; endTime: string; status: string; project: { id: string; name: string; reference: string } }>
  recentDeliverables: Array<{ id: string; reference: string; title: string; status: string; deadline: string | null; project: { name: string; reference: string } }>
}

const STAGES = ['PLANNED', 'SCHEDULED', 'SHOT', 'FOOTAGE_READY', 'EDITING', 'INTERNAL_REVIEW', 'CLIENT_REVIEW', 'APPROVED', 'DELIVERED']

export default function VideoDashboardPage() {
  const [data, setData] = useState<Dash | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { api<Dash>('/api/video/dashboard').then(setData).catch(e => setError(e.message)) }, [])

  if (error) return <Alert variant="destructive"><AlertTitle>Failed to load video dashboard</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
        <Skeleton className="h-72" />
      </div>
    )
  }

  const t = data.totals
  const maxStage = Math.max(1, ...STAGES.map(s => data.stageCounts[s] ?? 0))

  const cards = [
    { label: 'Contracted videos', value: t.contracted, icon: ListVideo, hint: `${t.cancelled} cancelled` },
    { label: 'Delivered', value: t.delivered, icon: CheckCircle2, hint: t.completion !== null ? `${t.completion}% complete` : 'No contracted videos yet' },
    { label: 'Remaining', value: t.remaining, icon: Clock, hint: `${t.overdue} overdue` },
    { label: 'Awaiting review', value: t.awaitingInternalReview + t.awaitingClientReview, icon: Eye, hint: `${t.awaitingInternalReview} internal · ${t.awaitingClientReview} client` },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Clapperboard className="h-6 w-6 text-primary" /> Video Production</h1>
          <p className="text-muted-foreground text-sm">Live production pipeline across all video projects.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link href="/app/video/shoots">Shoot calendar</Link></Button>
          <Button asChild><Link href="/app/video/projects">Video projects <Plus className="h-4 w-4 ml-1" /></Link></Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(c => (
          <Card key={c.label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{c.label}</span>
                <c.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-3xl font-bold mt-1">{c.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{c.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {t.overdue > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t.overdue} deliverable{t.overdue > 1 ? 's' : ''} past deadline</AlertTitle>
          <AlertDescription>
            <Link href="/app/video/deliverables" className="underline">Open deliverables tracker</Link> to review blockers and next steps.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Production pipeline</CardTitle>
            <CardDescription>Stage distribution of all non-cancelled deliverables (each video counted once, in its current stage).</CardDescription>
          </CardHeader>
          <CardContent>
            {t.contracted === 0 ? (
              <div className="py-10 text-center text-muted-foreground">
                <Film className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No videos in production yet.</p>
                <Button size="sm" variant="outline" className="mt-4" asChild><Link href="/app/video/projects">Create a video project</Link></Button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {STAGES.map(stage => {
                  const count = data.stageCounts[stage] ?? 0
                  return (
                    <div key={stage} className="flex items-center gap-3">
                      <span className="w-36 shrink-0"><StatusBadge status={stage} className="w-full justify-center" /></span>
                      <div className="flex-1">
                        <Progress value={(count / maxStage) * 100} className="h-2.5" aria-label={`${count} in ${stage}`} />
                      </div>
                      <span className="w-8 text-right text-sm font-semibold tabular-nums">{count}</span>
                    </div>
                  )
                })}
                <div className="pt-3 border-t mt-3 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Overall completion</span>
                  <span className="font-bold">{t.completion !== null ? `${t.completion}%` : '—'}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Upcoming shoots</CardTitle>
              <Button variant="ghost" size="sm" asChild><Link href="/app/video/shoots">All</Link></Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.upcomingShoots.length === 0 ? <p className="text-sm text-muted-foreground py-4 text-center">No shoots scheduled.</p> :
                data.upcomingShoots.map(s => (
                  <Link key={s.id} href={`/app/video/shoots/${s.id}`} className="block rounded-md border px-3 py-2 hover:border-primary/40">
                    <p className="text-sm font-medium truncate">{s.title}</p>
                    <p className="text-xs text-muted-foreground">{fmtDate(s.date)} · {s.startTime}–{s.endTime} · {s.project.name}</p>
                  </Link>
                ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Latest activity</CardTitle>
              <Button variant="ghost" size="sm" asChild><Link href="/app/video/deliverables">Tracker</Link></Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.recentDeliverables.slice(0, 6).map(d => (
                <Link key={d.id} href={`/app/video/deliverables/${d.id}`} className="flex items-center gap-2 rounded-md border px-3 py-2 hover:border-primary/40">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{d.title}</p>
                    <p className="text-xs text-muted-foreground">{d.project.name}{d.deadline ? ` · due ${fmtDate(d.deadline)}` : ''}</p>
                  </div>
                  <StatusBadge status={d.status} />
                </Link>
              ))}
              {data.recentDeliverables.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No activity yet.</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
