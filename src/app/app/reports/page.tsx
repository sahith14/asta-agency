'use client'

import { useEffect, useState } from 'react'
import { api, fmtMoney } from '@/lib/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { BarChart3, AlertTriangle } from 'lucide-react'

interface Report {
  serviceFilter: string
  clients: number
  activeProjects: number
  projectsByStatus: Record<string, number>
  overdueProjects: number
  overdueDeliverables: number
  overdueShoots: number
  websiteProjects: number
  videoProjects: number
  videoDeliverables: { contracted: number; delivered: number; stageCounts: Record<string, number>; completion: number | null }
  finance: { invoiced: number; collected: number }
  teamWorkload: Record<string, number>
}

const STAGES = ['PLANNED', 'SCHEDULED', 'SHOT', 'FOOTAGE_READY', 'EDITING', 'INTERNAL_REVIEW', 'CLIENT_REVIEW', 'APPROVED', 'DELIVERED']

export default function ReportsPage() {
  const [data, setData] = useState<Report | null>(null)
  const [filter, setFilter] = useState('ALL')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<Report>(`/api/reports/overview${filter !== 'ALL' ? `?serviceType=${filter}` : ''}`).then(setData).catch(e => setError(e.message))
  }, [filter])

  const expectedFilter = filter === 'ALL' ? 'ALL' : filter
  const stale = !data || data.serviceFilter !== expectedFilter

  if (error) return <Alert variant="destructive"><AlertTitle>Failed to load</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><BarChart3 className="h-6 w-6 text-primary" /> Reports</h1>
          <p className="text-muted-foreground text-sm">Combined agency reporting — switch between services.</p>
        </div>
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            <TabsTrigger value="ALL">All services</TabsTrigger>
            <TabsTrigger value="WEBSITE">Website</TabsTrigger>
            <TabsTrigger value="VIDEO_PRODUCTION">Video</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {stale ? (
        <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-48" /></div>
      ) : (
        <>
          {(data.overdueProjects > 0 || data.overdueDeliverables > 0 || data.overdueShoots > 0) && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Overdue work</AlertTitle>
              <AlertDescription>{data.overdueProjects} projects · {data.overdueDeliverables} video deliverables · {data.overdueShoots} shoots past due</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Active clients', value: data.clients },
              { label: 'Active projects', value: data.activeProjects },
              { label: 'Website projects', value: data.websiteProjects },
              { label: 'Video projects', value: data.videoProjects },
            ].map(c => (
              <Card key={c.label}><CardContent className="pt-6"><p className="text-sm text-muted-foreground">{c.label}</p><p className="text-2xl font-bold mt-1">{c.value}</p></CardContent></Card>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Video production pipeline</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div><p className="text-xs text-muted-foreground">Contracted</p><p className="text-xl font-bold">{data.videoDeliverables.contracted}</p></div>
                  <div><p className="text-xs text-muted-foreground">Delivered</p><p className="text-xl font-bold">{data.videoDeliverables.delivered}</p></div>
                  <div><p className="text-xs text-muted-foreground">Completion</p><p className="text-xl font-bold">{data.videoDeliverables.completion !== null ? `${data.videoDeliverables.completion}%` : '—'}</p></div>
                </div>
                {data.videoDeliverables.contracted > 0 && (
                  <div className="space-y-2">
                    {STAGES.map(s => {
                      const count = data.videoDeliverables.stageCounts[s] ?? 0
                      return (
                        <div key={s} className="flex items-center gap-2 text-sm">
                          <span className="w-32 text-xs text-muted-foreground">{s.replaceAll('_', ' ')}</span>
                          <Progress value={(count / Math.max(1, data.videoDeliverables.contracted)) * 100} className="h-2 flex-1" />
                          <span className="w-6 text-right tabular-nums">{count}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground mt-4">Counts distinguish shoot completion from final delivery; stages never sum into a unique-video total.</p>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader><CardTitle className="text-base">Finance</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div><p className="text-xs text-muted-foreground">Invoiced (sent + paid)</p><p className="text-xl font-bold">{fmtMoney(data.finance.invoiced)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Collected (paid)</p><p className="text-xl font-bold">{fmtMoney(data.finance.collected)}</p></div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Projects by status</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {Object.entries(data.projectsByStatus).map(([s, n]) => (
                    <div key={s} className="flex justify-between"><span className="text-muted-foreground">{s.replaceAll('_', ' ')}</span><span className="font-semibold">{n}</span></div>
                  ))}
                  {Object.keys(data.projectsByStatus).length === 0 && <p className="text-muted-foreground">No projects in this filter.</p>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Team</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {Object.entries(data.teamWorkload).map(([r, n]) => (
                    <div key={r} className="flex justify-between"><span className="text-muted-foreground">{r.replaceAll('_', ' ')}</span><span className="font-semibold">{n}</span></div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
