'use client'

import { useEffect, useState } from 'react'
import { api, fmtDate } from '@/lib/client'
import { StatusBadge } from '@/components/status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { MonitorSmartphone, Video, CalendarDays } from 'lucide-react'

interface Project {
  id: string; name: string; reference: string; serviceType: string; status: string
  startDate: string | null; targetDate: string | null; manager: string | null
  video: { agreedVideoCount: number; packageName: string | null; notes: string | null } | null
  deliverables: Array<{ id: string; title: string; status: string; deadline: string | null; platform: string | null; note: string | null }>
  upcomingShoots: Array<{ id: string; title: string; date: string; startTime: string; address: string | null }>
}

export default function PortalProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { api<{ projects: Project[] }>('/api/portal/projects').then(d => setProjects(d.projects)).catch(e => setError(e.message)) }, [])

  if (error) return <Alert variant="destructive"><AlertTitle>Failed to load</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
  if (!projects) return <div className="space-y-4">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-48" />)}</div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My projects</h1>
        <p className="text-muted-foreground text-sm">Progress across website and video work.</p>
      </div>

      {projects.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground"><MonitorSmartphone className="h-10 w-10 mx-auto mb-3 opacity-30" /><p className="font-medium">No projects yet</p></CardContent></Card>
      ) : projects.map(p => (
        <Card key={p.id}>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  {p.serviceType === 'VIDEO_PRODUCTION' ? <Video className="h-5 w-5 text-primary" /> : <MonitorSmartphone className="h-5 w-5 text-muted-foreground" />}
                  {p.name}
                </CardTitle>
                <p className="text-sm text-muted-foreground">{p.reference} · Account manager: {p.manager ?? '—'}{p.targetDate ? ` · target ${fmtDate(p.targetDate)}` : ''}</p>
              </div>
              <StatusBadge status={p.status} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {p.video && (
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <p><strong>{p.video.agreedVideoCount}</strong> contracted videos{p.video.packageName ? ` · ${p.video.packageName}` : ''}</p>
                {p.video.notes && <p className="text-muted-foreground mt-1">{p.video.notes}</p>}
              </div>
            )}
            {p.upcomingShoots.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />Filming days</p>
                {p.upcomingShoots.map(s => (
                  <p key={s.id} className="text-sm"> <strong>{s.title}</strong> — {fmtDate(s.date)} from {s.startTime}{s.address ? `, ${s.address}` : ''}</p>
                ))}
              </div>
            )}
            {p.deliverables.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Videos in this project</p>
                {p.deliverables.map(d => (
                  <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{d.title}{d.platform ? <span className="text-muted-foreground"> · {d.platform}</span> : ''}</p>
                      {d.note && <p className="text-xs text-muted-foreground">{d.note}</p>}
                    </div>
                    <StatusBadge status={d.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
