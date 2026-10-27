'use client'

import { CalendarDays, Link as LinkIcon, MapPin, Video } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { apiGet, errorMessage, withScope } from '@/components/portal/api'
import { useApi } from '@/components/portal/use-api'
import { FounderScopeGate, FounderViewingBar, useFounderClientId } from '@/components/portal/founder-scope'
import { EmptyState as PortalEmptyState, Spinner as PortalSpinner } from '@/components/portal/portal-ui'
import { useToast } from '@/hooks/use-toast'
import { ROLES } from '@/lib/constants'
import { formatDateTime, humanizeStatus } from '@/lib/format'

type PortalMeeting = {
  id: string
  title: string
  description: string | null
  startsAt: string
  durationMinutes: number
  location: string | null
  meetingLink: string | null
  status: string
  outcome: string | null
  project: { id: string; name: string } | null
}

export function MeetingsPortalClient({ role }: { role: string }) {
  const isFounder = role === ROLES.FOUNDER
  const [clientId] = useFounderClientId()
  const { data, error, loading } = useApi<{ meetings: PortalMeeting[] }>(
    isFounder && !clientId ? null : withScope('/api/portal/meetings', isFounder ? clientId : null)
  )

  if (isFounder && !clientId) return <FounderScopeGate />

  const meetings = data?.meetings ?? []
  const upcoming = meetings.filter((m) => m.status === 'SCHEDULED').sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const past = meetings.filter((m) => m.status !== 'SCHEDULED')

  return (
    <div className="space-y-6">
      {isFounder && clientId ? <FounderViewingBar /> : null}
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Meetings</h1>
        <p className="text-sm text-muted-foreground">
          Calls and meetings your account manager has scheduled with you. You have a read-only view.
        </p>
      </header>

      {loading ? (
        <PortalSpinner label="Loading meetings…" />
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : meetings.length === 0 ? (
        <PortalEmptyState
          title="No meetings scheduled"
          hint="When we arrange a call or visit, it will appear here with the time and joining details."
        />
      ) : (
        <div className="space-y-6">
          {upcoming.length > 0 ? (
            <section aria-label="Upcoming meetings" className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Upcoming</h2>
              {upcoming.map((m) => (
                <MeetingItem key={m.id} m={m} />
              ))}
            </section>
          ) : null}
          {past.length > 0 ? (
            <section aria-label="Past meetings" className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Past</h2>
              {past.map((m) => (
                <MeetingItem key={m.id} m={m} />
              ))}
            </section>
          ) : null}
        </div>
      )}
    </div>
  )
}

function MeetingItem({ m }: { m: PortalMeeting }) {
  return (
    <Card>
      <CardContent className="space-y-1 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold leading-snug">{m.title}</p>
          <Badge variant={m.status === 'SCHEDULED' ? 'default' : m.status === 'CANCELLED' ? 'destructive' : 'secondary'}>
            {humanizeStatus(m.status)}
          </Badge>
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" /> {formatDateTime(m.startsAt)} · {m.durationMinutes} min
          </span>
          {m.location ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {m.location}
            </span>
          ) : null}
          {m.meetingLink ? (
            <a href={m.meetingLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
              <Video className="h-3.5 w-3.5" /> Join online
            </a>
          ) : null}
          {m.project ? <span>{m.project.name}</span> : null}
        </p>
        {m.description ? <p className="whitespace-pre-wrap text-sm text-muted-foreground">{m.description}</p> : null}
        {m.outcome ? (
          <p className="rounded-md bg-muted/60 p-2 text-sm">
            <span className="font-medium">Outcome: </span>
            {m.outcome}
          </p>
        ) : null}
        {m.meetingLink ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <LinkIcon className="h-3 w-3" /> Online meeting
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
