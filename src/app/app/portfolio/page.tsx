'use client'

import { useCallback, useEffect, useState, FormEvent } from 'react'
import Image from 'next/image'
import { api } from '@/lib/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Images, Plus, Pencil, Trash2, Loader2, Eye, EyeOff, Star, ImageIcon } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { categoryLabel, PORTFOLIO_CATEGORIES } from '@/lib/site-content'

interface PortfolioItem {
  id: string
  title: string
  category: string
  division: 'WEB' | 'VIDEO'
  summary: string
  description: string | null
  thumbnailUrl: string | null
  mediaUrl: string | null
  projectUrl: string | null
  featured: boolean
  published: boolean
  isDemo: boolean
  sortOrder: number
}

// Sample imagery available under /public/images/site for one-click thumbnails
const SAMPLE_IMAGES = [
  '/images/site/work-website.jpg',
  '/images/site/work-restaurant-reel.jpg',
  '/images/site/work-realestate.jpg',
  '/images/site/work-product.jpg',
  '/images/site/hero-studio.jpg',
  '/images/site/service-web.jpg',
  '/images/site/service-video.jpg',
  '/images/site/about-studio.jpg',
]

const EMPTY_FORM = {
  title: '', category: 'WEBSITE', division: 'WEB' as 'WEB' | 'VIDEO', summary: '', description: '',
  thumbnailUrl: '', mediaUrl: '', projectUrl: '', featured: false, published: false, isDemo: true, sortOrder: 10,
}

function Thumb({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted" aria-hidden="true">
        <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
      </div>
    )
  }
  return (
    <Image src={src} alt={alt} fill sizes="200px" className="object-cover" onError={() => setFailed(true)} unoptimized />
  )
}

export default function PortfolioManagerPage() {
  const [items, setItems] = useState<PortfolioItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<PortfolioItem | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const d = await api<{ items: PortfolioItem[] }>('/api/portfolio')
      setItems(d.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load portfolio items')
      setItems([])
    }
  }, [])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setEditingId(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEdit(item: PortfolioItem) {
    setEditingId(item.id)
    setForm({
      title: item.title,
      category: item.category,
      division: item.division,
      summary: item.summary,
      description: item.description ?? '',
      thumbnailUrl: item.thumbnailUrl ?? '',
      mediaUrl: item.mediaUrl ?? '',
      projectUrl: item.projectUrl ?? '',
      featured: item.featured,
      published: item.published,
      isDemo: item.isDemo,
      sortOrder: item.sortOrder,
    })
    setDialogOpen(true)
  }

  async function onSave(e: FormEvent) {
    e.preventDefault()
    if (form.title.trim().length < 2 || form.summary.trim().length < 10) {
      toast({ title: 'Missing details', description: 'Title (2+ chars) and summary (10+ chars) are required.', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const body = {
        ...form,
        title: form.title.trim(),
        summary: form.summary.trim(),
        description: form.description.trim() || undefined,
        thumbnailUrl: form.thumbnailUrl.trim() || undefined,
        mediaUrl: form.mediaUrl.trim() || undefined,
        projectUrl: form.projectUrl.trim() || undefined,
      }
      if (editingId) {
        await api(`/api/portfolio/${editingId}`, { method: 'PATCH', body })
        toast({ title: 'Portfolio item updated', description: form.title })
      } else {
        await api('/api/portfolio', { method: 'POST', body })
        toast({ title: 'Portfolio item created', description: form.title })
      }
      setDialogOpen(false)
      await load()
    } catch (err) {
      toast({ title: 'Save failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  async function toggle(item: PortfolioItem, patch: Partial<Pick<PortfolioItem, 'published' | 'featured'>>) {
    setBusyId(item.id)
    try {
      await api(`/api/portfolio/${item.id}`, { method: 'PATCH', body: patch })
      await load()
    } catch (err) {
      toast({ title: 'Update failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  async function onDelete() {
    if (!deleteTarget) return
    setBusyId(deleteTarget.id)
    try {
      await api(`/api/portfolio/${deleteTarget.id}`, { method: 'DELETE' })
      toast({ title: 'Portfolio item deleted', description: deleteTarget.title })
      setDeleteTarget(null)
      await load()
    } catch (err) {
      toast({ title: 'Delete failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Images className="h-6 w-6 text-primary" /> Site Portfolio</h1>
          <p className="text-sm text-muted-foreground">Manage the work shown on the public website portfolio. Published sample items are always labelled &ldquo;Sample&rdquo; for visitors.</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" /> New portfolio item</Button>
      </div>

      {error && <Alert variant="destructive"><AlertTitle>Failed to load</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {!error && !items && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-64" />)}</div>}

      {items && items.length === 0 && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Images className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No portfolio items yet</p>
          <p className="mt-1 text-sm">Create one and publish it to show it on the public site.</p>
        </CardContent></Card>
      )}

      {items && items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(item => (
            <Card key={item.id} className="overflow-hidden">
              <div className="relative aspect-[16/10]">
                <Thumb src={item.thumbnailUrl} alt={item.title} />
                <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
                  {item.published ? <Badge className="border-transparent bg-emerald-600 text-white">Published</Badge> : <Badge variant="secondary">Draft</Badge>}
                  {item.featured && <Badge className="border-transparent bg-amber-500 text-white"><Star className="mr-0.5 h-3 w-3" />Featured</Badge>}
                  {item.isDemo && <Badge variant="outline" className="bg-background/90">Sample</Badge>}
                </div>
              </div>
              <CardContent className="space-y-2 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{categoryLabel(item.category)} · {item.division === 'VIDEO' ? 'Video' : 'Web'}</p>
                <h3 className="font-semibold leading-snug">{item.title}</h3>
                <p className="line-clamp-2 text-sm text-muted-foreground">{item.summary}</p>
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(item)}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Button>
                  <Button size="sm" variant={item.published ? 'secondary' : 'default'} disabled={busyId === item.id} onClick={() => toggle(item, { published: !item.published })}>
                    {busyId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : item.published ? <><EyeOff className="h-3.5 w-3.5 mr-1" /> Unpublish</> : <><Eye className="h-3.5 w-3.5 mr-1" /> Publish</>}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busyId === item.id} onClick={() => toggle(item, { featured: !item.featured })} aria-label={item.featured ? 'Remove featured status' : 'Mark as featured'}>
                    <Star className={`h-3.5 w-3.5 ${item.featured ? 'fill-amber-400 text-amber-500' : ''}`} />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(item)} aria-label={`Delete ${item.title}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit portfolio item' : 'New portfolio item'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pf-title">Title *</Label>
                <Input id="pf-title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required maxLength={120} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-cat">Category *</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger id="pf-cat"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[...PORTFOLIO_CATEGORIES, { value: 'OTHER', label: 'Other work' }].map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pf-div">Division</Label>
                <Select value={form.division} onValueChange={v => setForm(f => ({ ...f, division: v as 'WEB' | 'VIDEO' }))}>
                  <SelectTrigger id="pf-div"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WEB">Web</SelectItem>
                    <SelectItem value="VIDEO">Video</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-sort">Sort order</Label>
                <Input id="pf-sort" type="number" min={0} max={9999} value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) || 0 }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-summary">Summary * <span className="text-muted-foreground">(shown on cards, 10–300 chars)</span></Label>
              <Textarea id="pf-summary" value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))} required rows={2} maxLength={300} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-desc">Longer description <span className="text-muted-foreground">(optional)</span></Label>
              <Textarea id="pf-desc" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} maxLength={4000} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-thumb">Thumbnail path/URL</Label>
              <Input id="pf-thumb" list="pf-sample-images" value={form.thumbnailUrl} onChange={e => setForm(f => ({ ...f, thumbnailUrl: e.target.value }))} placeholder="/images/site/work-website.jpg" maxLength={300} />
              <datalist id="pf-sample-images">
                {SAMPLE_IMAGES.map(p => <option key={p} value={p} />)}
              </datalist>
              <p className="text-xs text-muted-foreground">Use a path under /images/… or a full https URL. Missing images show a placeholder.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pf-media">Media link <span className="text-muted-foreground">(video URL)</span></Label>
                <Input id="pf-media" value={form.mediaUrl} onChange={e => setForm(f => ({ ...f, mediaUrl: e.target.value }))} placeholder="https://…" maxLength={300} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-url">Project link</Label>
                <Input id="pf-url" value={form.projectUrl} onChange={e => setForm(f => ({ ...f, projectUrl: e.target.value }))} placeholder="https://…" maxLength={300} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex items-center gap-2">
                <Checkbox id="pf-pub" checked={form.published} onCheckedChange={v => setForm(f => ({ ...f, published: v === true }))} />
                <Label htmlFor="pf-pub" className="text-sm font-normal">Published (public)</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="pf-feat" checked={form.featured} onCheckedChange={v => setForm(f => ({ ...f, featured: v === true }))} />
                <Label htmlFor="pf-feat" className="text-sm font-normal">Featured</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="pf-demo" checked={form.isDemo} onCheckedChange={v => setForm(f => ({ ...f, isDemo: v === true }))} />
                <Label htmlFor="pf-demo" className="text-sm font-normal">Sample work</Label>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Untick &ldquo;Sample work&rdquo; only for genuine client projects. Sample items are always labelled publicly.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingId ? 'Save changes' : 'Create item'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete portfolio item?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deleteTarget?.title}&rdquo; will be removed permanently. If it is published, it disappears from the public site immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={e => { e.preventDefault(); onDelete() }}>
              {busyId === deleteTarget?.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
