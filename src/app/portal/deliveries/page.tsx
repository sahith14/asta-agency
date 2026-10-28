'use client'

import { useEffect, useState } from 'react'
import { api, fmtDateTime } from '@/lib/client'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { PackageCheck, ExternalLink } from 'lucide-react'

interface Delivery { id: string; reference: string; title: string; deliveredAt: string | null; deliveryReference: string | null; platform: string | null; aspectRatio: string | null; project: { name: string; reference: string } }

export default function PortalDeliveriesPage() {
  const [items, setItems] = useState<Delivery[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { api<{ deliveries: Delivery[] }>('/api/portal/deliveries').then(d => setItems(d.deliveries)).catch(e => setError(e.message)) }, [])

  if (error) return <Alert variant="destructive"><AlertTitle>Failed to load</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
  if (!items) return <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20" />)}</div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Final deliveries</h1>
        <p className="text-muted-foreground text-sm">Approved and delivered videos with their delivery references.</p>
      </div>

      {items.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground"><PackageCheck className="h-10 w-10 mx-auto mb-3 opacity-30" /><p className="font-medium">No deliveries yet</p><p className="text-sm mt-1">Final files appear here after approval and hand-off.</p></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {items.map(d => (
            <Card key={d.id}>
              <CardContent className="py-4 flex flex-wrap items-center gap-3">
                <PackageCheck className="h-5 w-5 text-emerald-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{d.title}</p>
                  <p className="text-xs text-muted-foreground">{d.project.name} · {d.platform ?? '—'} {d.aspectRatio ? `· ${d.aspectRatio}` : ''} · delivered {d.deliveredAt ? fmtDateTime(d.deliveredAt) : '—'}</p>
                </div>
                {d.deliveryReference && (
                  d.deliveryReference.startsWith('http') ? (
                    <a href={d.deliveryReference} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary underline underline-offset-2">
                      <ExternalLink className="h-3.5 w-3.5" />Delivery file
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground" title="Your delivery reference — ask your account manager for access">
                      <PackageCheck className="h-3.5 w-3.5" />Ref: {d.deliveryReference}
                    </span>
                  )
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
