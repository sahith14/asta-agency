'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from '@/hooks/use-toast'
import { AdminEmptyState } from '@/components/internal/admin-bits'

export type ContactRow = {
  id: string
  name: string
  title: string | null
  email: string | null
  phone: string | null
  notes: string | null
  isPrimary: boolean
  clientId: string
  clientName: string
}

type ClientOption = { id: string; name: string }

export function ContactsClient({
  canManage,
  contacts,
  clients,
}: {
  canManage: boolean
  contacts: ContactRow[]
  clients: ClientOption[]
}) {
  const router = useRouter()
  const [clientFilter, setClientFilter] = useState('ALL')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<ContactRow | 'NEW' | null>(null)
  const [deleting, setDeleting] = useState<ContactRow | null>(null)
  const [busy, setBusy] = useState(false)

  const filtered = useMemo(
    () =>
      contacts.filter(
        (c) =>
          (clientFilter === 'ALL' || c.clientId === clientFilter) &&
          (query.trim() === '' ||
            [c.name, c.title, c.email, c.phone].some((v) => v?.toLowerCase().includes(query.trim().toLowerCase())))
      ),
    [contacts, clientFilter, query]
  )

  async function onDelete() {
    if (!deleting) return
    setBusy(true)
    try {
      const res = await fetch(`/api/contacts/${deleting.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ title: 'Could not delete contact', description: data.error ?? 'Something went wrong', variant: 'destructive' })
        return
      }
      toast({ title: 'Contact deleted', description: `${deleting.name} was removed.` })
      setDeleting(null)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">Contacts</h1>
          <p className="text-sm text-muted-foreground">The people we work with at each client business.</p>
        </div>
        {canManage ? (
          <Button className="min-h-[44px]" onClick={() => setEditing('NEW')}>
            <Plus className="h-4 w-4" /> New contact
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="min-h-[44px] w-[240px]" aria-label="Filter by client">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All clients</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, phone…"
            aria-label="Search contacts"
            className="h-11 w-[240px] pl-9"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {filtered.length} contact{filtered.length === 1 ? '' : 's'}
        </p>
      </div>

      {filtered.length === 0 ? (
        <AdminEmptyState
          title="No contacts found"
          description={canManage ? 'Add the first contact for a client business.' : 'No contacts match the current filters.'}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <Card key={c.id}>
              <CardContent className="space-y-2 pt-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-semibold leading-snug">
                      <span className="truncate">{c.name}</span>
                      {c.isPrimary ? <Badge className="shrink-0 text-[10px]">Primary</Badge> : null}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">{c.clientName}</p>
                  </div>
                  {canManage ? (
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`Delete ${c.name}`} onClick={() => setDeleting(c)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ) : null}
                </div>
                <dl className="space-y-0.5 text-sm">
                  {c.title ? <p className="text-muted-foreground">{c.title}</p> : null}
                  {c.email ? (
                    <p>
                      <a href={`mailto:${c.email}`} className="text-primary hover:underline">
                        {c.email}
                      </a>
                    </p>
                  ) : null}
                  {c.phone ? <p className="text-muted-foreground">{c.phone}</p> : null}
                </dl>
                {c.notes ? <p className="border-t pt-2 text-xs text-muted-foreground">{c.notes}</p> : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editing ? (
        <ContactDialog
          contact={editing === 'NEW' ? null : editing}
          clients={clients}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete contact?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.name} will be permanently removed from the contact book. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-[44px] bg-destructive text-white hover:bg-destructive/90"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                void onDelete()
              }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ContactDialog({ contact, clients, onClose }: { contact: ContactRow | null; clients: ClientOption[]; onClose: () => void }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [clientId, setClientId] = useState(contact?.clientId ?? '')
  const [isPrimary, setIsPrimary] = useState(contact?.isPrimary ?? false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setBusy(true)
    try {
      const payload = {
        clientId,
        name: String(form.get('name') ?? '').trim(),
        title: String(form.get('title') ?? '').trim() || null,
        email: String(form.get('email') ?? '').trim() || null,
        phone: String(form.get('phone') ?? '').trim() || null,
        notes: String(form.get('notes') ?? '').trim() || null,
        isPrimary,
      }
      const res = await fetch(contact ? `/api/contacts/${contact.id}` : '/api/contacts', {
        method: contact ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contact ? { ...payload, clientId: undefined } : payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ title: 'Could not save contact', description: data.error ?? data.issues?.[0]?.message ?? 'Something went wrong', variant: 'destructive' })
        return
      }
      toast({ title: contact ? 'Contact updated' : 'Contact created', description: String(payload.name) })
      onClose()
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{contact ? 'Edit contact' : 'New contact'}</DialogTitle>
          <DialogDescription>People at a client business. Clients never see this directory.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Client *</Label>
            <Select value={clientId} onValueChange={setClientId} disabled={!!contact} required>
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="Select a client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-name">Name *</Label>
            <Input id="c-name" name="name" required maxLength={120} defaultValue={contact?.name ?? ''} className="h-11" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="c-title">Job title</Label>
              <Input id="c-title" name="title" maxLength={120} defaultValue={contact?.title ?? ''} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-email">Email</Label>
              <Input id="c-email" name="email" type="email" maxLength={200} defaultValue={contact?.email ?? ''} className="h-11" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-phone">Phone</Label>
            <Input id="c-phone" name="phone" maxLength={60} defaultValue={contact?.phone ?? ''} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-notes">Internal notes</Label>
            <Textarea id="c-notes" name="notes" rows={3} maxLength={2000} defaultValue={contact?.notes ?? ''} className="min-h-[44px]" />
          </div>
          <label className="flex min-h-[44px] items-center gap-2 text-sm">
            <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} className="h-4 w-4" />{' '}
            Primary contact for this client
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} className="min-h-[44px]">
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !clientId} className="min-h-[44px]">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {contact ? 'Save changes' : 'Create contact'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
