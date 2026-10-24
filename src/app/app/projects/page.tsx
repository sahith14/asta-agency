'use client'

import { useEffect, useState, FormEvent } from 'react'
import Link from 'next/link'
import { api, fmtDate, fmtMoney } from '@/lib/client'
import { StatusBadge, PriorityBadge } from '@/components/status-badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Globe, Plus, Search, Loader2 } from 'lucide-react'

interface ProjectRow {
  id: string; reference: string; name: string; status: string; priority: string
  client: { name: string }; manager: { name: string } | null
  targetDate: string | null; agreedPrice: number | null
  _count: { deliverables: number; shoots: number; tasks: number }
}

export default function WebsiteProjectsPage() {
  const [projects, setProjects] = useState<ProjectRow[] | null>(null)
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([])
  const [managers, setManagers] = useState<Array<{ id: string; name: string; role: string }>>([])
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // form state
  const [name, setName] = useState(''); const [clientId, setClientId] = useState('')
  const [managerId, setManagerId] = useState('none'); const [priority, setPriority] = useState('MEDIUM')
  const [targetDate, setTargetDate] = useState(''); const [price, setPrice] = useState('')
  const [brief, setBrief] = useState(''); const [notes, setNotes] = useState('')

  function loadProjects() {
    api<{ projects: ProjectRow[] }>('/api/projects?serviceType=WEBSITE').then(d => setProjects(d.projects)).catch(e => setError(e.message))
  }

  useEffect(() => {
    loadProjects()
    api<{ clients: Array<{ id: string; name: string }> }>('/api/clients?pageSize=100').then(d => setClients(d.clients)).catch(() => {})
    api<{ employees: Array<{ id: string; name: string; role: string }> }>('/api/team?pageSize=100').then(d => setManagers(d.employees)).catch(() => {})
  }, [])

  const filtered = projects?.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.reference.toLowerCase().includes(search.toLowerCase()) || p.client.name.toLowerCase().includes(search.toLowerCase()))

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setFormError(null); setSubmitting(true)
    try {
      await api('/api/projects', { method: 'POST', body: {
        name, serviceType: 'WEBSITE', clientId,
        managerId: managerId === 'none' ? undefined : managerId,
        priority,
        targetDate: targetDate ? new Date(targetDate).toISOString() : undefined,
        agreedPrice: price ? parseFloat(price) : undefined,
        budget: price ? parseFloat(price) : undefined,
        brief: brief || undefined,
        notes: notes || undefined,
      } })
      setCreateOpen(false); setName(''); setClientId(''); setManagerId('none'); setPriority('MEDIUM')
      setTargetDate(''); setPrice(''); setBrief(''); setNotes('')
      loadProjects()
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
          <h1 className="text-2xl font-bold flex items-center gap-2"><Globe className="h-6 w-6 text-primary" /> Website Projects</h1>
          <p className="text-muted-foreground text-sm">Website builds, redesigns and ongoing client web work.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" />New website project</Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects…" className="pl-8" aria-label="Search website projects" />
      </div>

      {error && <Alert variant="destructive"><AlertTitle>Failed to load</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {!error && !projects && <div className="grid gap-4 md:grid-cols-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32" />)}</div>}

      {filtered && (
        filtered.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <Globe className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No website projects yet</p>
            <p className="text-sm mt-1">Create your first website project to start tracking tasks and deliverables.</p>
            <Button className="mt-4" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" />New website project</Button>
          </CardContent></Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filtered.map(p => (
              <Link key={p.id} href={`/app/projects/${p.id}`}>
                <Card className="hover:border-primary/40 transition-colors h-full">
                  <CardContent className="pt-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.reference} · {p.client.name}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <PriorityBadge priority={p.priority} />
                        <StatusBadge status={p.status} />
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Manager: {p.manager?.name ?? 'Unassigned'}</span>
                      <span>{p.targetDate ? `Due ${fmtDate(p.targetDate)}` : ''} {p.agreedPrice !== null ? `· ${fmtMoney(p.agreedPrice)}` : ''}</span>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {p._count.tasks} task{p._count.tasks !== 1 ? 's' : ''}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New website project</DialogTitle>
            <DialogDescription>Track the build, tasks and delivery for this client&apos;s website work.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreate} className="space-y-4">
            {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}
            <div className="space-y-1.5">
              <Label htmlFor="wp-name">Project name</Label>
              <Input id="wp-name" required maxLength={160} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Anchor Website Rebuild" />
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
                <Label>Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger aria-label="Priority"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Project manager</Label>
                <Select value={managerId} onValueChange={setManagerId}>
                  <SelectTrigger aria-label="Project manager"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {managers.filter(m => ['OWNER', 'CLIENT_MANAGER', 'CREATIVE_DIRECTOR', 'WEB_DEVELOPER'].includes(m.role)).map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wp-date">Delivery deadline</Label>
                <Input id="wp-date" type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wp-price">Agreed price (£)</Label>
              <Input id="wp-price" type="number" min={0} step="0.01" value={price} onChange={e => setPrice(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wp-brief">Brief (optional)</Label>
              <Textarea id="wp-brief" rows={3} maxLength={4000} value={brief} onChange={e => setBrief(e.target.value)} placeholder="Scope, pages, key features…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wp-notes">Internal notes (optional)</Label>
              <Textarea id="wp-notes" rows={2} maxLength={4000} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting || !clientId}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create project
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
