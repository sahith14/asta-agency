'use client'

import { useEffect, useState, FormEvent } from 'react'
import { api } from '@/lib/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { UserCircle, Plus, Search, Loader2, Mail, Phone } from 'lucide-react'

interface Contact { id: string; name: string; email: string | null; phone: string | null; company: string | null; jobTitle: string | null; client: { id: string; name: string } | null }

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[] | null>(null)
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([])
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<{ contacts: Contact[] }>('/api/contacts').then(d => setContacts(d.contacts)).catch(e => setError(e.message))
    api<{ clients: Array<{ id: string; name: string }> }>('/api/clients?pageSize=100').then(d => setClients(d.clients)).catch(() => {})
  }, [])

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setBusy(true)
    try {
      await api('/api/contacts', { method: 'POST', body: {
        name: String(fd.get('name')), email: String(fd.get('email')) || undefined,
        phone: String(fd.get('phone')) || undefined, company: String(fd.get('company')) || undefined,
        jobTitle: String(fd.get('jobTitle')) || undefined,
        clientId: String(fd.get('clientId')) !== 'none' ? String(fd.get('clientId')) : undefined,
      } })
      setBusy(false)
      api<{ contacts: Contact[] }>('/api/contacts').then(d => setContacts(d.contacts)).catch(() => {})
    } catch { setBusy(false) }
  }

  const filtered = contacts?.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.company?.toLowerCase().includes(search.toLowerCase()) || c.email?.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><UserCircle className="h-6 w-6 text-primary" /> Contacts</h1>
          <p className="text-muted-foreground text-sm">People directory across clients and prospects.</p>
        </div>
        <Dialog>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />New contact</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New contact</DialogTitle></DialogHeader>
            <form onSubmit={onCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label htmlFor="ct-name">Name</Label><Input id="ct-name" name="name" required maxLength={120} /></div>
                <div className="space-y-1.5"><Label htmlFor="ct-job">Job title</Label><Input id="ct-job" name="jobTitle" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label htmlFor="ct-email">Email</Label><Input id="ct-email" name="email" type="email" /></div>
                <div className="space-y-1.5"><Label htmlFor="ct-phone">Phone</Label><Input id="ct-phone" name="phone" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label htmlFor="ct-company">Company</Label><Input id="ct-company" name="company" /></div>
                <div className="space-y-1.5"><Label>Linked client</Label>
                  <Select name="clientId" defaultValue="none"><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="none">—</SelectItem>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
                </div>
              </div>
              <DialogFooter><Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Add contact</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts…" className="pl-8" aria-label="Search contacts" />
      </div>

      {error && <Alert variant="destructive"><AlertTitle>Failed to load</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {!error && !contacts && <div className="grid gap-4 md:grid-cols-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>}

      {filtered && (
        filtered.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground"><UserCircle className="h-10 w-10 mx-auto mb-3 opacity-30" /><p className="font-medium">No contacts found</p></CardContent></Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(c => (
              <Card key={c.id}>
                <CardContent className="pt-5">
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.jobTitle ? `${c.jobTitle} · ` : ''}{c.company ?? c.client?.name ?? '—'}</p>
                  <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                    {c.email && <p className="flex items-center gap-1.5"><Mail className="h-3 w-3" />{c.email}</p>}
                    {c.phone && <p className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{c.phone}</p>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  )
}
