'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api, fmtDateTime } from '@/lib/client'
import { StatusBadge } from '@/components/status-badge'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Film, Info } from 'lucide-react'

interface Asset {
  id: string; kind: string; title: string; fileName: string | null; externalUrl: string | null
  status: string; accessScope: string; createdAt: string
  project: { id: string; name: string; reference: string }
  deliverable: { id: string; title: string } | null
}

export default function MediaLibraryPage() {
  const [assets, setAssets] = useState<Asset[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<{ assets: Asset[] }>('/api/media').then(d => setAssets(d.assets)).catch(e => setError(e.message))
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Film className="h-6 w-6 text-primary" /> Media library</h1>
        <p className="text-muted-foreground text-sm">Metadata & external references for footage, music, exports and client materials.</p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Storage provider not configured</AlertTitle>
        <AlertDescription>
          Binary video upload is intentionally not available in this environment — no fake uploads. Register assets with an external reference
          (e.g. signed URLs from your storage provider) on any <Link href="/app/video/projects" className="underline">video project</Link>.
        </AlertDescription>
      </Alert>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {!error && !assets && <div className="grid gap-4 md:grid-cols-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>}

      {assets && (
        assets.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground"><Film className="h-10 w-10 mx-auto mb-3 opacity-30" /><p className="font-medium">No assets registered yet</p></CardContent></Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {assets.map(a => (
              <Card key={a.id}>
                <CardContent className="pt-5">
                  <p className="font-semibold truncate">{a.title}</p>
                  <p className="text-xs text-muted-foreground">{a.kind.replaceAll('_', ' ')} · {a.project.name}</p>
                  {a.deliverable && <p className="text-xs text-muted-foreground">→ {a.deliverable.title}</p>}
                  <div className="mt-2 flex items-center gap-2">
                    <StatusBadge status={a.status} />
                    {a.accessScope === 'CLIENT' && <span className="text-[10px] uppercase font-semibold border rounded px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border-emerald-200">Client-visible</span>}
                  </div>
                  {a.externalUrl && (
                    <a href={a.externalUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline underline-offset-2 mt-2 block truncate">Open external reference ↗</a>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-2">{fmtDateTime(a.createdAt)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  )
}
