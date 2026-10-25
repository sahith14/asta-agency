'use client'

import { useEffect, useState, FormEvent } from 'react'
import Link from 'next/link'
import { api, fmtDate, fmtMoney } from '@/lib/client'
import { roleCan } from '@/lib/rbac'
import { useMe } from '@/components/app-shell'
import { StatusBadge, PriorityBadge } from '@/components/status-badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { Film, Plus, Search, Loader2 } from 'lucide-react'

interface ProjectRow {
  id: string; reference: string; name: string; status: string; priority: string
  client: { name: string }; manager: { name: string } | null
  targetDate: string | null; agreedPrice: number | null
  videoProject: { agreedVideoCount: number; packageNameSnapshot: string | null } | null
  _count: { deliverables: number; shoots: number; tasks: number }
}

const CATEGORIES = ['Restaurant', 'Cafe / Coffee Shop', 'Food and Beverage', 'Real Estate / Property', 'Retail', 'Hospitality', 'Corporate', 'Events', 'Personal Brand', 'Automotive', 'Healthcare / Professional Services', 'Other']

export default function VideoProjectsPage() {
  const { me } = useMe()
  const canManageProjects = me ? roleCan(me.role, 'projects.manage') : false
  const [projects, setProjects] = useState<ProjectRow[] | null>(null)
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([])
  const [packages, setPackages] = useState<Array<{ id: string; name: string; videoCount: number; revisionRounds: number; price: number | null }>>([])
  const [managers, setManagers] = useState<Array<{ id: string; name: string; role: string }>>([])
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // form state
  const [name, setName] = useState(''); const [clientId, setClientId] = useState(''); const [managerId, setManagerId] = useState('none')
  const [packageId, setPackageId] = useState('none'); const [agreedCount, setAgreedCount] = useState('')
  const [category, setCategory] = useState('Restaurant'); const [objective, setObjective] = useState('')
  const [platforms, setPlatforms] = useState(''); const [locations, setLocations] = useState('')
  const [targetDate, setTargetDate] = useState(''); const [price, setPrice] = useState('')

  useEffect(() => {
    api<{ projects: ProjectRow[] }>('/api/projects?serviceType=VIDEO_PRODUCTION').then(d => setProjects(d.projects)).catch(e => setError(e.message))
  }, [])

  // Create-dialog data (client directory, packages, managers) is restricted to
  // projects-manage roles by the API — fetch lazily, only when the dialog opens.
  useEffect(() => {
    if (!createOpen) return
    api<{ clients: Array<{ id: string; name: string }> }>('/api/clients?pageSize=100').then(d => setClients(d.clients)).catch(() => {})
    api<{ packages: Array<{ id: string; name: string; videoCount: number; revisionRounds: number; price: number | null }> }>('/api/video/packages').then(d => setPackages(d.packages)).catch(() => {})
    api<{ employees: Array<{ id: string; name: string; role: string }> }>('/api/team?pageSize=100').then(d => setManagers(d.employees)).catch(() => {})
  }, [createOpen])

  const filtered = projects?.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.reference.toLowerCase().includes(search.toLowerCase()) || p.client.name.toLowerCase().includes(search.toLowerCase()))

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setFormError(null); setSubmitting(true)
    try {
      const pkg = packages.find(p => p.id === packageId)
      const count = agreedCount ? parseInt(agreedCount) : pkg?.videoCount ?? 1
      await api('/api/projects', { method: 'POST', body: {
        name, serviceType: 'VIDEO_PRODUCTION', clientId,
        managerId: managerId === 'none' ? undefined : managerId,
        priority: 'MEDIUM',
        targetDate: targetDate ? new Date(targetDate).toISOString() : undefined,
        agreedPrice: price ? parseFloat(price) : pkg?.price ?? undefined,
        budget: price ? parseFloat(price) : pkg?.price ?? undefined,
        video: {
          businessCategory: category, campaignObjective: objective || undefined,
          distributionPlatforms: platforms || undefined, shootLocations: locations || undefined,
          packageId: packageId === 'none' ? undefined : packageId,
          agreedVideoCount: count, revisionAllowance: pkg?.revisionRounds ?? 1,
          createDeliverables: true,
        },
      } })
      setCreateOpen(false); setName(''); setClientId(''); setPackageId('none'); setAgreedCount(''); setObjective(''); setPlatforms(''); setLocations(''); setTargetDate(''); setPrice('')
      api<{ projects: ProjectRow[] }>('/api/projects?serviceType=VIDEO_PRODUCTION').then(d => setProjects(d.projects)).catch(() => {})
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create project')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Film className="h-6 w-6 text-primary" /> Video Projects</h1>
          <p className="text-muted-foreground text-sm">Commercial shoots, reels packages, brand films and property videos.</p>
        </div>
        {canManageProjects && <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" />New video project</Button>}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects…" className="pl-8" aria-label="Search video projects" />
      </div>

      {error && <Alert variant="destructive"><AlertTitle>Failed to load</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {!error && !projects && <div className="grid gap-4 md:grid-cols-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32" />)}</div>}

      {filtered && (
        filtered.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <Film className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No video projects yet</p>
            <p className="text-sm mt-1">Create your first video project to start tracking deliverables.</p>
            {canManageProjects && <Button className="mt-4" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" />New video project</Button>}
          </CardContent></Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filtered.map(p => {
              const contracted = p.videoProject?.agreedVideoCount ?? 0
              return (
                <Link key={p.id} href={`/app/projects/${p.id}`}>
                  <Card className="hover:border-primary/40 transition-colors h-full">
                    <CardContent className="pt-5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{p.reference} · {p.client.name}</p>
                        </div>
                        <StatusBadge status={p.status} />
                      </div>
                      {contracted > 0 && (
                        <div className="mt-4 space-y-1">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{p._count.deliverables} deliverable{p._count.deliverables !== 1 ? 's' : ''} of {contracted} contracted</span>
                            <span>{p._count.shoots} shoot{p._count.shoots !== 1 ? 's' : ''}</span>
                          </div>
                          <Progress value={Math.min(100, (p._count.deliverables / Math.max(1, contracted)) * 100)} className="h-2" aria-label={`${p._count.deliverables} of ${contracted} deliverables created`} />
                        </div>
                      )}
                      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                        <span>Manager: {p.manager?.name ?? 'Unassigned'}</span>
                        <span>{p.targetDate ? `Due ${fmtDate(p.targetDate)}` : ''} {p.agreedPrice !== null ? `· ${fmtMoney(p.agreedPrice)}` : ''}</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        )
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New video project</DialogTitle>
            <DialogDescription>The package snapshot is recorded at creation — later package edits never rewrite this contract.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreate} className="space-y-4">
            {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}
            <div className="space-y-1.5">
              <Label htmlFor="vp-name">Project name</Label>
              <Input id="vp-name" required maxLength={160} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Anchor October Reels" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Client</Label>
                <Select value={clientId || undefined} onValueChange={setClientId} required>
                  <SelectTrigger aria-label="Client"><SelectValue placeholder="Select client" /></SelectTrigger>
                  <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Business category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger aria-label="Business category"><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Package (optional)</Label>
                <Select value={packageId} onValueChange={v => {
                  setPackageId(v)
                  const pkg = packages.find(p => p.id === v)
                  if (pkg) { setAgreedCount(String(pkg.videoCount)); if (pkg.price) setPrice(String(pkg.price)) }
                }}>
                  <SelectTrigger aria-label="Package"><SelectValue placeholder="Custom scope" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Custom scope</SelectItem>
                    {packages.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.videoCount} videos)</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vp-count">Agreed video quantity</Label>
                <Input id="vp-count" type="number" min={1} max={500} required value={agreedCount} onChange={e => setAgreedCount(e.target.value)} placeholder="Confirm quantity" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="vp-price">Agreed price (£)</Label>
                <Input id="vp-price" type="number" min={0} step="0.01" value={price} onChange={e => setPrice(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vp-date">Delivery deadline</Label>
                <Input id="vp-date" type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Project manager</Label>
                <Select value={managerId} onValueChange={setManagerId}>
                  <SelectTrigger aria-label="Project manager"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {managers.filter(m => ['OWNER', 'CLIENT_MANAGER', 'CREATIVE_DIRECTOR'].includes(m.role)).map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vp-platforms">Distribution platforms</Label>
                <Input id="vp-platforms" maxLength={500} value={platforms} onChange={e => setPlatforms(e.target.value)} placeholder="Instagram, TikTok…" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vp-objective">Campaign objective</Label>
              <Textarea id="vp-objective" rows={2} maxLength={2000} value={objective} onChange={e => setObjective(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vp-locations">Shoot locations</Label>
              <Input id="vp-locations" maxLength={1000} value={locations} onChange={e => setLocations(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting || !clientId || !agreedCount}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create project
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
