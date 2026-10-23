'use client'

import { useEffect, useState } from 'react'
import { api, fmtDateTime } from '@/lib/client'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ScrollText } from 'lucide-react'

interface Log { id: string; actorType: string; actorName: string; action: string; entityType: string; entityId: string | null; summary: string; createdAt: string }

export default function AuditPage() {
  const [logs, setLogs] = useState<Log[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<{ logs: Log[] }>('/api/audit?pageSize=100').then(d => setLogs(d.logs)).catch(e => setError(e.message))
  }, [])

  if (error) return <Alert variant="destructive"><AlertTitle>Failed to load</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
  if (!logs) return <div className="space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><ScrollText className="h-6 w-6 text-primary" /> Audit log</h1>
        <p className="text-muted-foreground text-sm">Record of security-relevant and permission-sensitive actions.</p>
      </div>
      <Card>
        <CardContent className="pt-2">
          <div className="divide-y max-h-[70vh] overflow-y-auto">
            {logs.map(l => (
              <div key={l.id} className="py-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-xs text-muted-foreground w-36 shrink-0">{fmtDateTime(l.createdAt)}</span>
                <span className="text-xs font-mono font-semibold bg-muted px-1.5 py-0.5 rounded">{l.action}</span>
                <span className="text-sm flex-1 min-w-52">{l.summary}</span>
                <span className="text-xs text-muted-foreground">{l.actorName}</span>
              </div>
            ))}
            {logs.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No audit entries yet.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
