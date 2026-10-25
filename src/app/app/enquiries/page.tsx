'use client'

import { useCallback, useEffect, useState } from 'react'
import { api, fmtDateTime } from '@/lib/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Inbox, Loader2, Mail, Phone, Building2, UserRoundCheck, RefreshCw } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

interface Enquiry {
  id: string
  reference: string
  name: string
  email: string | null
  phone: string | null
  companyName: string | null
  service: string
  message: string
  contactMethod: string
  status: 'NEW' | 'IN_PROGRESS' | 'CONVERTED' | 'CLOSED'
  convertedContactId: string | null
  notes: string | null
  createdAt: string
}

const STATUS_BADGE: Record<string, string> = {
  NEW: 'bg-amber-50 text-amber-700 border-amber-200',
  IN_PROGRESS: 'bg-sky-50 text-sky-700 border-sky-200',
  CONVERTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CLOSED: 'bg-zinc-100 text-zinc-600 border-zinc-200',
}

const FILTERS = ['ALL', 'NEW', 'IN_PROGRESS', 'CONVERTED', 'CLOSED'] as const

export default function EnquiriesPage() {
  const [enquiries, setEnquiries] = useState<Enquiry[] | null>(null)
  const [total, setTotal] = useState(0)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('ALL')
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Enquiry | null>(null)
  const [notesDraft, setNotesDraft] = useState('')

  const load = useCallback(async (f: string) => {
    setError(null)
    try {
      const q = f === 'ALL' ? '' : `&status=${f}`
      const d = await api<{ enquiries: Enquiry[]; total: number }>(`/api/enquiries?pageSize=100${q}`)
      setEnquiries(d.enquiries)
      setTotal(d.total)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load enquiries')
      setEnquiries([])
    }
  }, [])

  useEffect(() => { load(filter) }, [filter, load])

  async function updateStatus(e: Enquiry, status: Enquiry['status']) {
    setBusyId(e.id)
    try {
      await api(`/api/enquiries/${e.id}`, { method: 'PATCH', body: { status } })
      toast({ title: 'Enquiry updated', description: `${e.reference} → ${status.replaceAll('_', ' ').toLowerCase()}` })
      await load(filter)
      setSelected(null)
    } catch (err) {
      toast({ title: 'Update failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  async function saveNotes(e: Enquiry) {
    setBusyId(e.id)
    try {
      await api(`/api/enquiries/${e.id}`, { method: 'PATCH', body: { notes: notesDraft } })
      toast({ title: 'Notes saved', description: e.reference })
      setSelected(null)
      await load(filter)
    } catch (err) {
      toast({ title: 'Save failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  async function convertToContact(e: Enquiry) {
    setBusyId(e.id)
    try {
      await api<{ contact: { id: string } }>(`/api/enquiries/${e.id}/convert`, { method: 'POST' })
      toast({ title: 'Converted to contact', description: `Contact created from ${e.reference} — see the Contacts page.` })
      setSelected(null)
      await load(filter)
    } catch (err) {
      toast({ title: 'Conversion failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  const newCount = enquiries?.filter(e => e.status === 'NEW').length ?? 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Inbox className="h-6 w-6 text-primary" /> Website Enquiries</h1>
          <p className="text-sm text-muted-foreground">Enquiries submitted from the public site contact form. Convert them into CRM contacts once qualified.</p>
        </div>
        <Button variant="outline" onClick={() => load(filter)} aria-label="Refresh enquiries">
          <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter enquiries by status">
        {FILTERS.map(f => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${filter === f ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground'}`}
          >
            {f === 'ALL' ? 'All' : f.replaceAll('_', ' ')}
            {f === 'NEW' && newCount > 0 && enquiries && (
              <Badge className="ml-1.5 h-5 min-w-5 rounded-full px-1 text-[10px]">{newCount}</Badge>
            )}
          </button>
        ))}
      </div>

      {error && <Alert variant="destructive"><AlertTitle>Failed to load</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {!error && !enquiries && (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      )}

      {enquiries && enquiries.length === 0 && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Inbox className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No enquiries{filter !== 'ALL' ? ` with status ${filter.replaceAll('_', ' ').toLowerCase()}` : ''}</p>
          <p className="mt-1 text-sm">New enquiries from the public contact form will appear here.</p>
        </CardContent></Card>
      )}

      {enquiries && enquiries.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{total} enquiry{total === 1 ? '' : 's'}</p>
          {enquiries.map(e => (
            <Card key={e.id} className="overflow-hidden">
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{e.reference}</span>
                    <Badge variant="outline" className={STATUS_BADGE[e.status]}>{e.status.replaceAll('_', ' ')}</Badge>
                    <span className="text-xs text-muted-foreground">{fmtDateTime(e.createdAt)}</span>
                  </div>
                  <p className="mt-1.5 font-semibold">
                    {e.name}{e.companyName ? ` — ${e.companyName}` : ''}
                  </p>
                  <p className="text-sm text-muted-foreground">Interested in: <span className="font-medium text-foreground/80">{e.service}</span></p>
                  <p className="mt-1 line-clamp-2 max-w-2xl text-sm text-muted-foreground">{e.message}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {e.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{e.email}</span>}
                    {e.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{e.phone}</span>}
                    <span>Preferred contact: {e.contactMethod.replaceAll('_', ' ').toLowerCase()}</span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-row gap-2 sm:flex-col">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setSelected(e); setNotesDraft(e.notes ?? '') }}
                  >
                    View &amp; triage
                  </Button>
                  {e.status === 'NEW' && (
                    <Button size="sm" variant="secondary" disabled={busyId === e.id} onClick={() => updateStatus(e, 'IN_PROGRESS')}>
                      {busyId === e.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Start follow-up'}
                    </Button>
                  )}
                  {!e.convertedContactId && e.status !== 'CLOSED' && (
                    <Button size="sm" disabled={busyId === e.id} onClick={() => convertToContact(e)}>
                      <UserRoundCheck className="h-4 w-4 mr-1" /> Convert
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null) }}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              {selected?.reference}
              {selected && <Badge variant="outline" className={STATUS_BADGE[selected.status]}>{selected.status.replaceAll('_', ' ')}</Badge>}
            </DialogTitle>
            <DialogDescription>
              Submitted {selected ? fmtDateTime(selected.createdAt) : ''} · {selected?.service}
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold">From</h3>
                <p className="mt-1 text-sm">{selected.name}{selected.companyName ? ` — ${selected.companyName}` : ''}</p>
                <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                  {selected.email && <p className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{selected.email}</p>}
                  {selected.phone && <p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{selected.phone}</p>}
                  {selected.companyName && <p className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" />{selected.companyName}</p>}
                  <p>Preferred contact method: <span className="font-medium text-foreground/80">{selected.contactMethod.replaceAll('_', ' ').toLowerCase()}</span></p>
                </div>
              </div>
              <Separator />
              <div>
                <h3 className="text-sm font-semibold">Project description</h3>
                <p className="mt-1 whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm">{selected.message}</p>
              </div>
              <div>
                <Label htmlFor="enq-notes">Internal notes</Label>
                <Textarea id="enq-notes" value={notesDraft} onChange={ev => setNotesDraft(ev.target.value)} rows={4} maxLength={4000} className="mt-1.5" placeholder="Add triage notes for the team…" />
                <p className="mt-1 text-xs text-muted-foreground">Visible to staff only — never shown to the enquirer.</p>
              </div>
            </div>
          )}

          <DialogFooter className="flex flex-wrap gap-2 sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {selected && selected.status !== 'IN_PROGRESS' && selected.status !== 'CONVERTED' && (
                <Button variant="secondary" size="sm" disabled={busyId === selected.id} onClick={() => updateStatus(selected, 'IN_PROGRESS')}>Mark in progress</Button>
              )}
              {selected && selected.status !== 'CLOSED' && (
                <Button variant="outline" size="sm" disabled={busyId === selected.id} onClick={() => updateStatus(selected, 'CLOSED')}>Close</Button>
              )}
              {selected && !selected.convertedContactId && selected.status !== 'CLOSED' && (
                <Button size="sm" disabled={busyId === selected.id} onClick={() => convertToContact(selected)}>
                  <UserRoundCheck className="h-4 w-4 mr-1" /> Convert to contact
                </Button>
              )}
            </div>
            <Button size="sm" disabled={busyId === selected?.id} onClick={() => selected && saveNotes(selected)}>
              {busyId === selected?.id && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save notes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
