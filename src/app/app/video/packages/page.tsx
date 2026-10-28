'use client'

import { useEffect, useState, FormEvent } from 'react'
import { api, fmtMoney } from '@/lib/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Package, Plus, Loader2 } from 'lucide-react'

interface Pkg {
  id: string; name: string; description: string | null; businessCategory: string; videoCount: number
  shootSessions: number; revisionRounds: number; price: number | null; isActive: boolean
  deliverableFormats: string | null; turnaroundDays: number | null; licensingTerms: string | null; additionalWorkTerms: string | null
}

export default function PackagesPage() {
  const [packages, setPackages] = useState<Pkg[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [canManage, setCanManage] = useState(true)

  const load = () => api<{ packages: Pkg[] }>('/api/video/packages?includeArchived=true').then(d => setPackages(d.packages)).catch(e => setError(e.message))
  useEffect(() => { load() }, [])

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setBusy(true)
    try {
      await api('/api/video/packages', { method: 'POST', body: {
        name: String(fd.get('name')), description: String(fd.get('description')) || undefined,
        businessCategory: String(fd.get('category')),
        videoCount: parseInt(String(fd.get('videoCount'))) || 0,
        shootSessions: parseInt(String(fd.get('shoots'))) || 1,
        revisionRounds: parseInt(String(fd.get('revisions'))) || 1,
        price: fd.get('price') ? parseFloat(String(fd.get('price'))) : undefined,
        deliverableFormats: String(fd.get('formats')) || undefined,
        turnaroundDays: fd.get('turnaround') ? parseInt(String(fd.get('turnaround'))) : undefined,
        licensingTerms: String(fd.get('licensing')) || undefined,
        additionalWorkTerms: String(fd.get('extra')) || undefined,
      } })
      setBusy(false); load()
    } catch (err) {
      setBusy(false)
      if (err instanceof Error && err.message.includes('permission')) setCanManage(false)
    }
  }

  async function toggleActive(pkg: Pkg) {
    await api(`/api/video/packages/${pkg.id}`, { method: 'PATCH', body: { isActive: !pkg.isActive } }).catch(() => {})
    load()
  }

  if (error) return <Alert variant="destructive"><AlertTitle>Failed to load</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Package className="h-6 w-6 text-primary" /> Video packages</h1>
          <p className="text-muted-foreground text-sm">Reusable commercial packages. Client contracts snapshot the package at creation — later edits never rewrite agreements.</p>
        </div>
        <Dialog>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />New package</Button></DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Create video package</DialogTitle></DialogHeader>
            <form onSubmit={onCreate} className="space-y-4">
              <div className="space-y-1.5"><Label htmlFor="p-name">Package name</Label><Input id="p-name" name="name" required maxLength={160} placeholder="e.g. Restaurant Monthly Reels — 6 Videos" /></div>
              <div className="space-y-1.5"><Label htmlFor="p-desc">Description</Label><Textarea id="p-desc" name="description" rows={2} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5"><Label htmlFor="p-count">Included videos</Label><Input id="p-count" name="videoCount" type="number" min={0} max={500} defaultValue={6} /></div>
                <div className="space-y-1.5"><Label htmlFor="p-shoots">Shoot sessions</Label><Input id="p-shoots" name="shoots" type="number" min={0} max={100} defaultValue={1} /></div>
                <div className="space-y-1.5"><Label htmlFor="p-rev">Revision rounds</Label><Input id="p-rev" name="revisions" type="number" min={0} max={20} defaultValue={2} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label htmlFor="p-price">Price (£)</Label><Input id="p-price" name="price" type="number" min={0} step="0.01" /></div>
                <div className="space-y-1.5"><Label htmlFor="p-turn">Turnaround (days)</Label><Input id="p-turn" name="turnaround" type="number" min={0} max={365} /></div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="p-formats">Deliverable formats</Label><Input id="p-formats" name="formats" placeholder="9:16 vertical, 1080x1920" /></div>
              <div className="space-y-1.5"><Label htmlFor="p-lic">Licensing terms</Label><Input id="p-lic" name="licensing" /></div>
              <div className="space-y-1.5"><Label htmlFor="p-extra">Additional-work pricing rules</Label><Input id="p-extra" name="extra" placeholder="Extra reel £95 each" /></div>
              <DialogFooter><Button type="submit" disabled={busy || !canManage}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create package</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {!packages && <div className="grid gap-4 md:grid-cols-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-40" />)}</div>}
      {packages && (
        packages.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground"><Package className="h-10 w-10 mx-auto mb-3 opacity-30" /><p className="font-medium">No packages defined yet</p></CardContent></Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {packages.map(p => (
              <Card key={p.id} className={p.isActive ? '' : 'opacity-60'}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{p.name}</CardTitle>
                      <CardDescription>{p.description}</CardDescription>
                    </div>
                    <Badge variant="outline" className={p.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-zinc-100 text-zinc-500'}>{p.isActive ? 'Active' : 'Archived'}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  <p><strong>{p.videoCount}</strong> videos · <strong>{p.shootSessions}</strong> shoot session{p.shootSessions !== 1 ? 's' : ''} · <strong>{p.revisionRounds}</strong> revision round{p.revisionRounds !== 1 ? 's' : ''}</p>
                  <p className="text-muted-foreground">{p.businessCategory}{p.deliverableFormats ? ` · ${p.deliverableFormats}` : ''}{p.turnaroundDays ? ` · ${p.turnaroundDays}-day turnaround` : ''}</p>
                  <p className="text-muted-foreground">{p.licensingTerms ?? 'Licensing TBC'}</p>
                  <div className="flex items-center justify-between pt-2">
                    <span className="font-bold">{p.price !== null ? fmtMoney(p.price) : 'Custom'}</span>
                    <Button size="sm" variant="outline" onClick={() => toggleActive(p)}>{p.isActive ? 'Archive' : 'Restore'}</Button>
                  </div>
                  {p.additionalWorkTerms && <p className="text-xs text-muted-foreground pt-1 border-t">Extras: {p.additionalWorkTerms}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  )
}
