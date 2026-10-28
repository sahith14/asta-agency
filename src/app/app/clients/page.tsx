'use client'

import { useEffect, useState, FormEvent } from 'react'
import Link from 'next/link'
import { api, fmtDate } from '@/lib/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Users, Plus, Search, Loader2 } from 'lucide-react'

const CATEGORIES = ['Restaurant', 'Cafe / Coffee Shop', 'Food and Beverage', 'Real Estate / Property', 'Retail', 'Hospitality', 'Corporate', 'Events', 'Personal Brand', 'Automotive', 'Healthcare / Professional Services', 'Other']

interface ClientRow {
  id: string; name: string; businessCategory: string; contactName: string | null; contactEmail: string | null; contactPhone: string | null
  _count: { projects: number; invoices: number; portalUsers: number }
}

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    api<{ clients: ClientRow[] }>('/api/clients?pageSize=100').then(d => setClients(d.clients)).catch(e => setError(e.message))
  }, [])

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setFormError(null); setBusy(true)
    try {
      await api('/api/clients', { method: 'POST', body: {
        name: String(fd.get('name')), businessCategory: String(fd.get('category')),
        contactName: String(fd.get('contactName')) || undefined,
        contactEmail: String(fd.get('contactEmail')) || undefined,
        contactPhone: String(fd.get('contactPhone')) || undefined,
        address: String(fd.get('address')) || undefined,
        notes: String(fd.get('notes')) || undefined,
      } })
      setOpen(false)
      api<{ clients: ClientRow[] }>('/api/clients?pageSize=100').then(d => setClients(d.clients)).catch(() => {})
    } catch (err) { setFormError(err instanceof Error ? err.message : 'Failed') } finally { setBusy(false) }
  }

  const filtered = clients?.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.contactName?.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="h-6 w-6 text-primary" /> Clients</h1>
          <p className="text-muted-foreground text-sm">One shared client directory across website and video services.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />New client</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New client</DialogTitle></DialogHeader>
            <form onSubmit={onCreate} className="space-y-4">
              {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}
              <div className="space-y-1.5"><Label htmlFor="c-name">Business name</Label><Input id="c-name" name="name" required maxLength={160} /></div>
              <div className="space-y-1.5"><Label>Business category</Label>
                <Select name="category" defaultValue="Other"><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label htmlFor="c-contact">Contact name</Label><Input id="c-contact" name="contactName" /></div>
                <div className="space-y-1.5"><Label htmlFor="c-email">Contact email</Label><Input id="c-email" name="contactEmail" type="email" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label htmlFor="c-phone">Contact phone</Label><Input id="c-phone" name="contactPhone" /></div>
                <div className="space-y-1.5"><Label htmlFor="c-address">Address</Label><Input id="c-address" name="address" /></div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="c-notes">Notes</Label><Textarea id="c-notes" name="notes" rows={2} /></div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create client</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients…" className="pl-8" aria-label="Search clients" />
      </div>

      {error && <Alert variant="destructive"><AlertTitle>Failed to load</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {!error && !clients && <div className="grid gap-4 md:grid-cols-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}</div>}

      {filtered && (
        filtered.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-3 opacity-30" /><p className="font-medium">No clients yet</p>
            <p className="text-sm mt-1">Add your first client to start building projects.</p>
          </CardContent></Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map(c => (
              <Link key={c.id} href={`/app/clients/${c.id}`}>
                <Card className="hover:border-primary/40 transition-colors h-full">
                  <CardContent className="pt-5">
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.businessCategory}</p>
                    <p className="text-sm mt-3">{c.contactName ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">{c.contactEmail ?? ''} {c.contactPhone ?? ''}</p>
                    <div className="mt-3 flex gap-3 text-xs text-muted-foreground">
                      <span>{c._count.projects} project{c._count.projects !== 1 ? 's' : ''}</span>
                      <span>{c._count.invoices} invoice{c._count.invoices !== 1 ? 's' : ''}</span>
                      <span>{c._count.portalUsers} portal user{c._count.portalUsers !== 1 ? 's' : ''}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )
      )}
    </div>
  )
}
