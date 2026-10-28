'use client'

import { useEffect, useState, useCallback, FormEvent } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { api, fmtDate, fmtDateTime, fmtMoney } from '@/lib/client'
import { StatusBadge, PriorityBadge } from '@/components/status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, Plus, ArrowLeft, Film, ListChecks, CalendarDays, Wallet, PackageCheck, FolderOpen } from 'lucide-react'

interface Detail {
  id: string; reference: string; name: string; serviceType: string; status: string; priority: string
  brief: string | null; notes: string | null; startDate: string | null; targetDate: string | null
  agreedPrice: number | null; budget: number | null; managerId: string | null
  client: { id: string; name: string; businessCategory: string; contactName: string | null }
  manager: { id: string; name: string } | null
  videoProject: {
    id: string; businessCategory: string; campaignObjective: string | null; targetAudience: string | null
    distributionPlatforms: string | null; targetFormats: string | null; shootLocations: string | null
    packageNameSnapshot: string | null; agreedVideoCount: number; revisionAllowance: number; contractNotes: string | null; clientVisibleNotes: string | null
    scopeChanges: Array<{ id: string; type: string; description: string; addedVideoCount: number; priceImpact: number; status: string; createdAt: string }>
  } | null
  deliverables: Array<{ id: string; reference: string; title: string; status: string; priority: string; deadline: string | null; videographer: { name: string } | null; editor: { name: string } | null; revisionCount: number; revisionAllowance: number }>
  shoots: Array<{ id: string; reference: string; title: string; date: string; startTime: string; endTime: string; status: string }>
  tasks: Array<{ id: string; title: string; status: string; priority: string; dueDate: string | null; assignee: { name: string } | null }>
  expenses: Array<{ id: string; category: string; description: string; amount: number; incurredAt: string }>
  invoices: Array<{ id: string; number: string; amount: number; status: string; issuedAt: string | null; dueDate: string | null; paidAt: string | null }>
  mediaAssets: Array<{ id: string; kind: string; title: string; status: string; accessScope: string; externalUrl: string | null; createdAt: string }>
}

const DELIVERABLE_CATEGORIES = ['FOOD_SOCIAL_REEL', 'RESTAURANT_PROMO', 'BUSINESS_PROMO', 'PROPERTY_WALKTHROUGH', 'PRODUCT_AD', 'CORPORATE_BRAND_FILM', 'EVENT_COVERAGE', 'PERSONAL_BRAND', 'TESTIMONIAL', 'OTHER']

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [data, setData] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [team, setTeam] = useState<Array<{ id: string; name: string; role: string }>>([])

  const load = useCallback(() => {
    api<{ project: Detail }>(`/api/projects/${id}`).then(d => setData(d.project)).catch(e => setError(e.message))
  }, [id])

  useEffect(() => { load() }, [load])
  useEffect(() => { api<{ employees: Array<{ id: string; name: string; role: string }> }>('/api/team?pageSize=100').then(d => setTeam(d.employees)).catch(() => {}) }, [])

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Cannot open project</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => router.back()}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
      </Alert>
    )
  }
  if (!data) return <div className="space-y-4"><Skeleton className="h-8 w-80" /><Skeleton className="h-24" /><Skeleton className="h-96" /></div>

  const isVideo = data.serviceType === 'VIDEO_PRODUCTION'
  const budget = data.budget ?? data.agreedPrice ?? 0
  const actual = data.expenses.reduce((s, e) => s + e.amount, 0)
  const delivered = data.deliverables.filter(d => d.status === 'DELIVERED').length

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => router.push(isVideo ? '/app/video/projects' : '/app/projects')}>
          <ArrowLeft className="h-4 w-4 mr-1" />{isVideo ? 'Video projects' : 'Website projects'}
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              {isVideo && <Film className="h-6 w-6 text-primary" />}{data.name}
            </h1>
            <p className="text-sm text-muted-foreground">{data.reference} · {data.client.name} · Manager: {data.manager?.name ?? 'Unassigned'}</p>
          </div>
          <div className="flex items-center gap-2">
            <PriorityBadge priority={data.priority} />
            <StatusBadge status={data.status} />
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {isVideo && <TabsTrigger value="deliverables">Deliverables ({data.deliverables.length})</TabsTrigger>}
          {isVideo && <TabsTrigger value="shoots">Shoots ({data.shoots.length})</TabsTrigger>}
          <TabsTrigger value="tasks">Tasks ({data.tasks.length})</TabsTrigger>
          {isVideo && <TabsTrigger value="media">Media</TabsTrigger>}
          <TabsTrigger value="finance">Finance</TabsTrigger>
          {isVideo && data.videoProject && <TabsTrigger value="scope">Scope changes</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Timeline</p><p className="font-semibold mt-1">{fmtDate(data.startDate)} → {fmtDate(data.targetDate)}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Budget</p><p className="font-semibold mt-1">{fmtMoney(budget)}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Actual expenses</p><p className="font-semibold mt-1">{fmtMoney(actual)}</p></CardContent></Card>
            {isVideo ? (
              <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Delivered</p><p className="font-semibold mt-1">{delivered} / {data.videoProject?.agreedVideoCount ?? 0} videos</p></CardContent></Card>
            ) : (
              <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Tasks done</p><p className="font-semibold mt-1">{data.tasks.filter(t => t.status === 'DONE').length} / {data.tasks.length}</p></CardContent></Card>
            )}
          </div>
          {data.brief && (
            <Card>
              <CardHeader><CardTitle className="text-base">Brief</CardTitle></CardHeader>
              <CardContent><p className="text-sm whitespace-pre-wrap text-muted-foreground">{data.brief}</p></CardContent>
            </Card>
          )}
          {isVideo && data.videoProject && (
            <Card>
              <CardHeader><CardTitle className="text-base">Video contract snapshot</CardTitle></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
                <div><span className="text-muted-foreground">Package: </span><strong>{data.videoProject.packageNameSnapshot ?? 'Custom scope'}</strong></div>
                <div><span className="text-muted-foreground">Agreed quantity: </span><strong>{data.videoProject.agreedVideoCount} videos</strong></div>
                <div><span className="text-muted-foreground">Revision allowance: </span><strong>{data.videoProject.revisionAllowance} rounds per video</strong></div>
                <div><span className="text-muted-foreground">Category: </span><strong>{data.videoProject.businessCategory}</strong></div>
                {data.videoProject.campaignObjective && <div className="sm:col-span-2"><span className="text-muted-foreground">Objective: </span>{data.videoProject.campaignObjective}</div>}
                {data.videoProject.distributionPlatforms && <div><span className="text-muted-foreground">Platforms: </span>{data.videoProject.distributionPlatforms}</div>}
                {data.videoProject.shootLocations && <div><span className="text-muted-foreground">Locations: </span>{data.videoProject.shootLocations}</div>}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {isVideo && (
          <TabsContent value="deliverables" className="mt-4">
            <DeliverablesTab projectId={id} deliverables={data.deliverables} team={team} revisionAllowance={data.videoProject?.revisionAllowance ?? 1} onChanged={load} />
          </TabsContent>
        )}

        {isVideo && (
          <TabsContent value="shoots" className="mt-4">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4" />Shoot sessions</CardTitle>
                <Button size="sm" variant="outline" asChild><Link href={`/app/video/shoots?projectId=${id}`}>Schedule in calendar</Link></Button>
              </CardHeader>
              <CardContent>
                {data.shoots.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">No shoots scheduled yet.</p> : (
                  <div className="space-y-2">
                    {data.shoots.map(s => (
                      <Link key={s.id} href={`/app/video/shoots/${s.id}`} className="flex items-center gap-3 rounded-lg border p-3 hover:border-primary/40">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{s.title}</p>
                          <p className="text-xs text-muted-foreground">{s.reference} · {fmtDate(s.date)} · {s.startTime}–{s.endTime}</p>
                        </div>
                        <StatusBadge status={s.status} />
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="tasks" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {data.tasks.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">No tasks on this project.</p> : (
                <div className="space-y-2">
                  {data.tasks.map(t => (
                    <div key={t.id} className="flex items-center gap-3 rounded-lg border p-3">
                      <ListChecks className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{t.title}</p>
                        <p className="text-xs text-muted-foreground">{t.assignee?.name ?? 'Unassigned'}{t.dueDate ? ` · due ${fmtDate(t.dueDate)}` : ''}</p>
                      </div>
                      <PriorityBadge priority={t.priority} />
                      <StatusBadge status={t.status} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {isVideo && (
          <TabsContent value="media" className="mt-4">
            <MediaTab projectId={id} assets={data.mediaAssets} onChanged={load} />
          </TabsContent>
        )}

        <TabsContent value="finance" className="mt-4 space-y-4">
          <ExpensesTab projectId={id} expenses={data.expenses} onChanged={load} />
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4" />Invoices</CardTitle></CardHeader>
            <CardContent>
              {data.invoices.length === 0 ? <p className="text-sm text-muted-foreground py-4 text-center">No invoices yet.</p> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Amount</TableHead><TableHead>Issued</TableHead><TableHead>Due</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.invoices.map(inv => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{inv.number}</TableCell>
                        <TableCell>{fmtMoney(inv.amount)}</TableCell>
                        <TableCell>{fmtDate(inv.issuedAt)}</TableCell>
                        <TableCell>{fmtDate(inv.dueDate)}</TableCell>
                        <TableCell><StatusBadge status={inv.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {isVideo && data.videoProject && (
          <TabsContent value="scope" className="mt-4">
            <ScopeTab videoProjectId={data.videoProject.id} changes={data.videoProject.scopeChanges} agreedCount={data.videoProject.agreedVideoCount} onChanged={load} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

function DeliverablesTab({ projectId, deliverables, team, revisionAllowance, onChanged }: {
  projectId: string
  deliverables: Detail['deliverables']
  team: Array<{ id: string; name: string; role: string }>
  revisionAllowance: number
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const videographers = team.filter(t => ['VIDEOGRAPHER', 'OWNER', 'CREATIVE_DIRECTOR'].includes(t.role))
  const editors = team.filter(t => ['VIDEO_EDITOR', 'OWNER', 'CREATIVE_DIRECTOR'].includes(t.role))

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setFormError(null); setSubmitting(true)
    try {
      await api('/api/video/deliverables', { method: 'POST', body: {
        projectId, title: String(fd.get('title')), category: String(fd.get('category')),
        targetPlatform: String(fd.get('platform')) || undefined,
        aspectRatio: String(fd.get('aspect')) || undefined,
        targetDurationSec: fd.get('duration') ? parseInt(String(fd.get('duration'))) : undefined,
        videographerId: String(fd.get('videographer')) !== 'none' ? String(fd.get('videographer')) : undefined,
        editorId: String(fd.get('editor')) !== 'none' ? String(fd.get('editor')) : undefined,
        deadline: fd.get('deadline') ? new Date(String(fd.get('deadline'))).toISOString() : undefined,
        revisionAllowance,
      } })
      setOpen(false); onChanged()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create deliverable')
    } finally { setSubmitting(false) }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2"><PackageCheck className="h-4 w-4" />Individual deliverables</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Add deliverable</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add deliverable</DialogTitle></DialogHeader>
            <form onSubmit={onCreate} className="space-y-4">
              {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}
              <div className="space-y-1.5"><Label htmlFor="d-title">Title</Label><Input id="d-title" name="title" required maxLength={160} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Category</Label>
                  <Select name="category" defaultValue="FOOD_SOCIAL_REEL"><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{DELIVERABLE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.replaceAll('_', ' ')}</SelectItem>)}</SelectContent></Select>
                </div>
                <div className="space-y-1.5"><Label htmlFor="d-platform">Platform</Label><Input id="d-platform" name="platform" placeholder="Instagram" /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5"><Label htmlFor="d-aspect">Aspect</Label><Input id="d-aspect" name="aspect" placeholder="9:16" /></div>
                <div className="space-y-1.5"><Label htmlFor="d-duration">Duration (s)</Label><Input id="d-duration" name="duration" type="number" min={1} max={3600} /></div>
                <div className="space-y-1.5"><Label htmlFor="d-deadline">Deadline</Label><Input id="d-deadline" name="deadline" type="date" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Videographer</Label>
                  <Select name="videographer" defaultValue="none"><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="none">Unassigned</SelectItem>{videographers.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent></Select>
                </div>
                <div className="space-y-1.5"><Label>Editor</Label>
                  <Select name="editor" defaultValue="none"><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="none">Unassigned</SelectItem>{editors.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent></Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={submitting}>{submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Add</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {deliverables.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">No deliverables yet.</p> : (
          <div className="space-y-2">
            {deliverables.map(d => (
              <Link key={d.id} href={`/app/video/deliverables/${d.id}`} className="flex items-center gap-3 rounded-lg border p-3 hover:border-primary/40">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{d.title}</p>
                  <p className="text-xs text-muted-foreground">{d.reference} · {d.videographer?.name ?? 'No videographer'} → {d.editor?.name ?? 'No editor'}{d.deadline ? ` · due ${fmtDate(d.deadline)}` : ''}</p>
                </div>
                <span className="hidden sm:inline text-xs text-muted-foreground">rev {d.revisionCount}/{d.revisionAllowance}</span>
                <StatusBadge status={d.status} />
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function MediaTab({ projectId, assets, onChanged }: { projectId: string; assets: Detail['mediaAssets']; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setFormError(null); setSubmitting(true)
    try {
      await api('/api/media', { method: 'POST', body: {
        projectId, kind: String(fd.get('kind')), title: String(fd.get('title')),
        externalUrl: String(fd.get('url')) || undefined,
        accessScope: String(fd.get('scope')),
        fileName: String(fd.get('fileName')) || undefined,
      } })
      setOpen(false); onChanged()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to register asset')
    } finally { setSubmitting(false) }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Media & assets</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" />Register asset</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Register media asset</DialogTitle>
            </DialogHeader>
            <Alert>
              <AlertTitle>Storage not configured</AlertTitle>
              <AlertDescription>Binary uploads are disabled in this environment. Register metadata and an external reference (e.g. a signed URL from your storage provider). No files are stored or faked.</AlertDescription>
            </Alert>
            <form onSubmit={onCreate} className="space-y-4">
              {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}
              <div className="space-y-1.5"><Label htmlFor="m-title">Title</Label><Input id="m-title" name="title" required maxLength={160} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Kind</Label>
                  <Select name="kind" defaultValue="ORIGINAL_FOOTAGE"><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{['ORIGINAL_FOOTAGE', 'PROXY', 'MUSIC', 'IMAGE', 'SCRIPT', 'PREVIEW_EXPORT', 'FINAL_EXPORT', 'CLIENT_REFERENCE'].map(k => <SelectItem key={k} value={k}>{k.replaceAll('_', ' ')}</SelectItem>)}</SelectContent></Select>
                </div>
                <div className="space-y-1.5"><Label>Access scope</Label>
                  <Select name="scope" defaultValue="INTERNAL"><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="INTERNAL">Internal only</SelectItem><SelectItem value="CLIENT">Client-visible</SelectItem></SelectContent></Select>
                </div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="m-url">External reference URL</Label><Input id="m-url" name="url" type="url" placeholder="https://…" /></div>
              <div className="space-y-1.5"><Label htmlFor="m-file">File name (metadata)</Label><Input id="m-file" name="fileName" /></div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={submitting}>{submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Register</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {assets.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No assets registered yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {assets.map(a => (
              <div key={a.id} className="flex items-center gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{a.title}</p>
                  <p className="text-xs text-muted-foreground">{a.kind.replaceAll('_', ' ')} · {fmtDateTime(a.createdAt)}{a.externalUrl ? ' · external ref' : ''}</p>
                </div>
                {a.accessScope === 'CLIENT' && <StatusBadge status="CLIENT" />}
                <StatusBadge status={a.status} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ExpensesTab({ projectId, expenses, onChanged }: { projectId: string; expenses: Detail['expenses']; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const total = expenses.reduce((s, e) => s + e.amount, 0)

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setFormError(null); setSubmitting(true)
    try {
      await api('/api/expenses', { method: 'POST', body: {
        projectId, category: String(fd.get('category')), description: String(fd.get('description')),
        amount: parseFloat(String(fd.get('amount'))),
      } })
      setOpen(false); onChanged()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to record expense')
    } finally { setSubmitting(false) }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Production expenses <span className="text-muted-foreground font-normal text-sm">({fmtMoney(total)} total)</span></CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" />Record expense</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Record production expense</DialogTitle></DialogHeader>
            <form onSubmit={onCreate} className="space-y-4">
              {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Category</Label>
                  <Select name="category" defaultValue="OTHER"><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{['VIDEOGRAPHER', 'EDITOR_FREELANCER', 'TRAVEL_FUEL', 'EQUIPMENT_RENTAL', 'LOCATION_FEE', 'MUSIC_LICENCE', 'OTHER'].map(c => <SelectItem key={c} value={c}>{c.replaceAll('_', ' ')}</SelectItem>)}</SelectContent></Select>
                </div>
                <div className="space-y-1.5"><Label htmlFor="e-amount">Amount (£)</Label><Input id="e-amount" name="amount" type="number" min={0.01} step="0.01" required /></div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="e-desc">Description</Label><Input id="e-desc" name="description" required maxLength={500} /></div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={submitting}>{submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Record</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {expenses.length === 0 ? <p className="text-sm text-muted-foreground py-4 text-center">No expenses recorded.</p> : (
          <Table>
            <TableHeader><TableRow><TableHead>Category</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
            <TableBody>
              {expenses.map(e => (
                <TableRow key={e.id}>
                  <TableCell><StatusBadge status={e.category} /></TableCell>
                  <TableCell>{e.description}</TableCell>
                  <TableCell className="text-right font-medium">{fmtMoney(e.amount)}</TableCell>
                  <TableCell>{fmtDate(e.incurredAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function ScopeTab({ videoProjectId, changes, agreedCount, onChanged }: {
  videoProjectId: string
  changes: Array<{ id: string; type: string; description: string; addedVideoCount: number; priceImpact: number; status: string; createdAt: string }>
  agreedCount: number
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function onPropose(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setFormError(null); setSubmitting(true)
    try {
      await api('/api/video/scope-changes', { method: 'POST', body: {
        videoProjectId, type: String(fd.get('type')), description: String(fd.get('description')),
        addedVideoCount: parseInt(String(fd.get('added'))) || 0,
        priceImpact: parseFloat(String(fd.get('price'))) || 0,
      } })
      setOpen(false); onChanged()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to propose change')
    } finally { setSubmitting(false) }
  }

  async function decide(changeId: string, decision: 'APPROVED' | 'REJECTED') {
    await api(`/api/video/scope-changes/${changeId}`, { method: 'PATCH', body: { decision } }).catch(() => {})
    onChanged()
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Scope changes <span className="text-muted-foreground font-normal text-sm">(contracted: {agreedCount})</span></CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" />Propose change</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Propose scope change</DialogTitle>
              <DialogDescription>Approval creates the additional deliverables atomically and records the price impact.</DialogDescription></DialogHeader>
            <form onSubmit={onPropose} className="space-y-4">
              {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Type</Label>
                  <Select name="type" defaultValue="ADDITIONAL_DELIVERABLES"><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="ADDITIONAL_DELIVERABLES">Additional deliverables</SelectItem><SelectItem value="PACKAGE_CHANGE">Package change</SelectItem><SelectItem value="OTHER">Other</SelectItem></SelectContent></Select>
                </div>
                <div className="space-y-1.5"><Label htmlFor="sc-added">Additional videos</Label><Input id="sc-added" name="added" type="number" min={0} max={100} defaultValue={0} /></div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="sc-price">Price impact (£)</Label><Input id="sc-price" name="price" type="number" min={0} step="0.01" defaultValue={0} /></div>
              <div className="space-y-1.5"><Label htmlFor="sc-desc">Description</Label><Textarea id="sc-desc" name="description" rows={3} required maxLength={2000} /></div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={submitting}>{submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Propose</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {changes.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">No scope changes recorded.</p> : (
          <div className="space-y-2">
            {changes.map(c => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{c.type.replaceAll('_', ' ')} · +{c.addedVideoCount} videos · {fmtMoney(c.priceImpact)}</p>
                  <p className="text-xs text-muted-foreground">{c.description}</p>
                </div>
                {c.status === 'PROPOSED' ? (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => decide(c.id, 'APPROVED')}>Approve</Button>
                    <Button size="sm" variant="outline" onClick={() => decide(c.id, 'REJECTED')}>Reject</Button>
                  </div>
                ) : <StatusBadge status={c.status} />}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
