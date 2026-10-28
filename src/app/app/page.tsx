'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api, fmtDate, fmtMoney } from '@/lib/client'
import { useMe } from '@/components/app-shell'
import { StatusBadge, PriorityBadge } from '@/components/status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Clapperboard, MonitorSmartphone, Users, ListChecks, Wallet, CalendarDays, ArrowRight, AlertTriangle, Film } from 'lucide-react'

interface OverviewData {
  projects: Array<{ id: string; name: string; reference: string; serviceType: string; status: string; priority: string; targetDate: string | null; client: { name: string }; _count: { tasks: number; deliverables: number; shoots: number } }>
  tasks: Array<{ id: string; title: string; status: string; priority: string; dueDate: string | null; project: { name: string } | null; assignee: { name: string } | null }>
  upcomingShoots: Array<{ id: string; title: string; date: string; startTime: string; endTime: string; status: string; project: { name: string } }>
  upcomingMeetings: Array<{ id: string; title: string; startAt: string; client: { name: string } | null }>
  counts: { activeProjects: number; activeClients: number; openTasks: number; invoicesOutstanding: number; myTasks: number }
}

export default function OverviewPage() {
  const { me } = useMe()
  const [data, setData] = useState<OverviewData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<OverviewData>('/api/overview').then(setData).catch(e => setError(e.message))
  }, [])

  if (error) return <Alert variant="destructive"><AlertTitle>Failed to load</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  const stats = [
    { label: 'Active projects', value: data.counts.activeProjects, icon: MonitorSmartphone, href: '/app/projects' },
    { label: 'Active clients', value: data.counts.activeClients, icon: Users, href: '/app/clients' },
    { label: 'Open tasks', value: data.counts.openTasks, icon: ListChecks, href: '/app/tasks' },
    { label: 'Outstanding invoices', value: fmtMoney(data.counts.invoicesOutstanding), icon: Wallet, href: '/app/finance' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome back, {me?.name.split(' ')[0]}</h1>
        <p className="text-muted-foreground text-sm">Here&apos;s what&apos;s happening across the studio.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(s => (
          <Link key={s.label} href={s.href}>
            <Card className="hover:border-primary/40 transition-colors h-full">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{s.label}</span>
                  <s.icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-2xl font-bold mt-1">{s.value}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Active projects</CardTitle>
            <Button variant="ghost" size="sm" asChild><Link href="/app/projects">View all <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link></Button>
          </CardHeader>
          <CardContent>
            {data.projects.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No active projects yet.</p>
            ) : (
              <div className="space-y-3">
                {data.projects.slice(0, 6).map(p => (
                  <Link key={p.id} href={`/app/projects/${p.id}`} className="flex items-center gap-3 rounded-lg border p-3 hover:border-primary/40 transition-colors">
                    {p.serviceType === 'VIDEO_PRODUCTION' ? <Film className="h-4 w-4 text-primary shrink-0" /> : <MonitorSmartphone className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.reference} · {p.client.name} · {p._count.tasks} tasks{p._count.deliverables ? ` · ${p._count.deliverables} videos` : ''}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <PriorityBadge priority={p.priority} />
                      <StatusBadge status={p.status} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">My tasks</CardTitle>
              <Button variant="ghost" size="sm" asChild><Link href="/app/tasks?mine=true">All <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link></Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.tasks.length === 0 ? <p className="text-sm text-muted-foreground py-4 text-center">Nothing assigned to you.</p> : data.tasks.slice(0, 5).map(t => (
                <div key={t.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{t.title}</p>
                    <p className="text-xs text-muted-foreground">{t.project?.name ?? 'General'}{t.dueDate ? ` · due ${fmtDate(t.dueDate)}` : ''}</p>
                  </div>
                  <StatusBadge status={t.status} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Upcoming</CardTitle>
              <Button variant="ghost" size="sm" asChild><Link href="/app/calendar">Calendar <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link></Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {[...data.upcomingShoots.map(s => ({ id: s.id, kind: 'Shoot', title: s.title, when: `${fmtDate(s.date)} · ${s.startTime}`, href: `/app/video/shoots/${s.id}` })),
                ...data.upcomingMeetings.map(m => ({ id: m.id, kind: 'Meeting', title: m.title, when: fmtDate(m.startAt), href: '/app/calendar' }))].slice(0, 6).map(ev => (
                <Link key={`${ev.kind}-${ev.id}`} href={ev.href} className="flex items-center gap-3 rounded-md border px-3 py-2 hover:border-primary/40">
                  <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{ev.title}</p>
                    <p className="text-xs text-muted-foreground">{ev.kind} · {ev.when}</p>
                  </div>
                </Link>
              ))}
              {data.upcomingShoots.length === 0 && data.upcomingMeetings.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Nothing scheduled.</p>}
            </CardContent>
          </Card>
        </div>
      </div>

      {data.counts.myTasks > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{data.counts.myTasks} task{data.counts.myTasks > 1 ? 's' : ''} assigned to you</AlertTitle>
          <AlertDescription><Link href="/app/tasks?mine=true" className="underline">Open your task list</Link></AlertDescription>
        </Alert>
      )}
    </div>
  )
}
