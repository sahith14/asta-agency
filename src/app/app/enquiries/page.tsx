'use client'

import { useCallback, useEffect, useState, FormEvent } from 'react'
import Link from 'next/link'
import { api, fmtDate, fmtDateTime } from '@/lib/client'
import { site } from '@/lib/site-content'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Inbox, Loader2, Mail, Phone, Building2, UserRoundCheck, RefreshCw,
  Search, CalendarClock, PhoneCall, Building, ExternalLink,
} from 'lucide-react'
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
  status: 'NEW' | 'IN_PROGRESS' | 'FOLLOW_UP' | 'QUALIFIED' | 'CONVERTED' | 'CLOSED'
  convertedContactId: string | null
  handledById: string | null
  notes: string | null
  lastContactedAt: string | null
  nextFollowUpAt: string | null
  createdAt: string
}

interface TeamMember { id: string; name: string; role: string }
interface ContactRecord { id: string; name: string; email: string | null; phone: string | null; company: string | null; clientId: string | null }

const STATUS_BADGE: Record<string, string> = {
  NEW: 'bg-amber-50 text-amber-700 border-amber-200',
  IN_PROGRESS: 'bg-sky-50 text-sky-700 border-sky-200',
  FOLLOW_UP: 'bg-violet-50 text-violet-700 border-violet-200',
  QUALIFIED: 'bg-teal-50 text-teal-700 border-teal-200',
  CONVERTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CLOSED: 'bg-zinc-100 text-zinc-600 border-zinc-200',
}

const FILTERS = ['ALL', 'NEW', 'IN_PROGRESS', 'FOLLOW_UP', 'QUALIFIED', 'CONVERTED', 'CLOSED'] as const

const CATEGORIES = ['Restaurant', 'Cafe / Coffee Shop', 'Food and Beverage', 'Real Estate / Property', 'Retail', 'Hospitality', 'Corporate', 'Events', 'Personal Brand', 'Automotive', 'Healthcare / Professional Services', 'Other']

const SERVICES = site.contact.services as unknown as string[]

export default function EnquiriesPage() {
  const [enquiries, setEnquiries] = useState<Enquiry[] | null>(null)
  const [total, setTotal] = useState(0)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('ALL')
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Enquiry | null>(null)
  const [notesDraft, setNotesDraft] = useState('')

  // Filters — service / assignee / date / free-text search
  const [searchDraft, setSearchDraft] = useState('')
  const [q, setQ] = useState('')
  const [service, setService] = useState('all')
  const [assignedTo, setAssignedTo] = useState('any')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const [team, setTeam] = useState<TeamMember[]>([])
  // Converted contact record (fetched when a converted enquiry is opened)
  const [contact, setContact] = useState<ContactRecord | null>(null)
  const [clientFormOpen, setClientFormOpen] = useState(false)
  const [clientName, setClientName] = useState('')
  const [clientCategory, setClientCategory] = useState('Other')
  const [clientBusy, setClientBusy] = useState(false)
  const [clientError, setClientError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<Enquiry[]> => {
    setError(null)
    try {
      const params = new URLSearchParams('pageSize=100')
      if (filter !== 'ALL') params.set('status', filter)
      if (q) params.set('q', q)
      if (service !== 'all') params.set('service', service)
      if (assignedTo !== 'any') params.set('assignedTo', assignedTo)
      if (fromDate) params.set('from', fromDate)
      if (toDate) params.set('to', toDate)
      const d = await api<{ enquiries: Enquiry[]; total: number }>(`/api/enquiries?${params.toString()}`)
      setEnquiries(d.enquiries)
      setTotal(d.total)
      return d.enquiries
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load enquiries')
      setEnquiries([])
      return []
    }
  }, [filter, q, service, assignedTo, fromDate, toDate])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    api<{ employees: TeamMember[] }>('/api/team?pageSize=100').then(d => setTeam(d.employees)).catch(() => {})
  }, [])

  // Fetch the converted contact (to check whether a client already exists)
  useEffect(() => {
    setContact(null); setClientFormOpen(false); setClientError(null)
    if (selected?.convertedContactId) {
      api<{ contact: ContactRecord }>(`/api/contacts/${selected.convertedContactId}`)
        .then(d => setContact(d.contact))
        .catch(() => {})
    }
  }, [selected?.convertedContactId])

  async function patch(e: Enquiry, body: Record<string, unknown>, okTitle: string, okDesc: string, opts: { close?: boolean } = {}) {
    setBusyId(e.id)
    try {
      const d = await api<{ enquiry: Partial<Enquiry> }>(`/api/enquiries/${e.id}`, { method: 'PATCH', body })
      toast({ title: okTitle, description: okDesc })
      await load()
      if (opts.close) {
        setSelected(null)
      } else {
        // Keep the triage dialog open and merge the server response into it so
        // staff can perform several triage actions without it snapping shut.
        setSelected(prev => (prev && prev.id === e.id ? { ...prev, ...d.enquiry } : prev))
      }
    } catch (err) {
      toast({ title: 'Update failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  async function saveNotes(e: Enquiry) {
    await patch(e, { notes: notesDraft }, 'Notes saved', e.reference)
  }

  async function convertToContact(e: Enquiry) {
    setBusyId(e.id)
    try {
      const d = await api<{ contact: { id: string; name: string }; matched: boolean }>(`/api/enquiries/${e.id}/convert`, { method: 'POST' })
      toast({
        title: d.matched ? 'Linked to existing contact' : 'Converted to contact',
        description: d.matched
          ? `Matched ${e.reference} to the existing CRM contact "${d.contact.name}" — no duplicate created.`
          : `Contact created from ${e.reference}. Add the client record below, then create their project.`,
      })
      const fresh = await load()
      const updated = fresh.find(x => x.id === e.id)
      if (updated) setSelected(updated)
    } catch (err) {
      toast({ title: 'Conversion failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  async function addAsClient(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    if (!selected?.convertedContactId || !contact) return
    setClientBusy(true); setClientError(null)
    try {
      const d = await api<{ client: { id: string; name: string } }>('/api/clients', {
        method: 'POST',
        body: { name: clientName, businessCategory: clientCategory },
      })
      await api(`/api/contacts/${selected.convertedContactId}`, { method: 'PATCH', body: { clientId: d.client.id } })
      setContact({ ...contact, clientId: d.client.id })
      setClientFormOpen(false)
      toast({ title: 'Client created', description: `${d.client.name} added — you can now create their project.` })
    } catch (err) {
      setClientError(err instanceof Error ? err.message : 'Failed to create client')
    } finally {
      setClientBusy(false)
    }
  }

  const newCount = enquiries?.filter(e => e.status === 'NEW').length ?? 0
  const overdueFollowUps = enquiries?.filter(e => e.nextFollowUpAt && new Date(e.nextFollowUpAt) < new Date() && e.status !== 'CONVERTED' && e.status !== 'CLOSED').length ?? 0

  function employeeName(id: string | null): string | null {
    if (!id) return null
    return team.find(t => t.id === id)?.name ?? 'Staff member'
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Inbox className="h-6 w-6 text-primary" /> Website Enquiries</h1>
          <p className="text-sm text-muted-foreground">Enquiries from the public site. Review → follow up → qualify → convert to a contact, then create their client record and project.</p>
        </div>
        <Button variant="outline" onClick={() => load()} aria-label="Refresh enquiries">
          <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
        </Button>
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <form
              className="flex gap-2 sm:col-span-2"
              onSubmit={ev => { ev.preventDefault(); setQ(searchDraft.trim()) }}
              role="search" aria-label="Search enquiries"
            >
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  value={searchDraft}
                  onChange={ev => setSearchDraft(ev.target.value)}
                  placeholder="Search name, email, company, reference…"
                  className="pl-8"
                  aria-label="Search enquiries"
                />
              </div>
              <Button type="submit" variant="outline" size="sm" className="self-stretch">Search</Button>
            </form>
            <Select value={service} onValueChange={setService}>
              <SelectTrigger aria-label="Filter by service"><SelectValue placeholder="All services" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All services</SelectItem>
                {SERVICES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger aria-label="Filter by assigned staff"><SelectValue placeholder="Anyone" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Anyone</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {team.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Input type="date" value={fromDate} onChange={ev => setFromDate(ev.target.value)} aria-label="From date" className="w-full" />
              <span className="text-xs text-muted-foreground shrink-0">to</span>
              <Input type="date" value={toDate} onChange={ev => setToDate(ev.target.value)} aria-label="To date" className="w-full" />
            </div>
          </div>
          {(q || service !== 'all' || assignedTo !== 'any' || fromDate || toDate) && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost" size="sm"
                onClick={() => { setQ(''); setSearchDraft(''); setService('all'); setAssignedTo('any'); setFromDate(''); setToDate('') }}
              >
                Clear all filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

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
            {f === 'FOLLOW_UP' && overdueFollowUps > 0 && enquiries && (
              <Badge className="ml-1.5 h-5 min-w-5 rounded-full px-1 text-[10px]">{overdueFollowUps}</Badge>
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
          <p className="font-medium">No enquiries match the current filters</p>
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
                    {employeeName(e.handledById) && <span>Owner: <span className="font-medium text-foreground/80">{employeeName(e.handledById)}</span></span>}
                    {e.nextFollowUpAt && (
                      <span className={`inline-flex items-center gap-1 ${new Date(e.nextFollowUpAt) < new Date() && e.status !== 'CONVERTED' && e.status !== 'CLOSED' ? 'font-semibold text-amber-700' : ''}`}>
                        <CalendarClock className="h-3 w-3" /> Follow up: {fmtDate(e.nextFollowUpAt)}
                      </span>
                    )}
                    {e.lastContactedAt && <span>Last contacted: {fmtDate(e.lastContactedAt)}</span>}
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
                    <Button size="sm" variant="secondary" disabled={busyId === e.id} onClick={() => patch(e, { status: 'IN_PROGRESS' }, 'Enquiry updated', `${e.reference} → in review`)}>
                      {busyId === e.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Start review'}
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

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="enq-owner">Assigned to</Label>
                  <Select
                    value={selected.handledById ?? 'unassigned'}
                    onValueChange={v => patch(selected, { assignedTo: v === 'unassigned' ? '' : v }, 'Owner updated', selected.reference)}
                  >
                    <SelectTrigger id="enq-owner" className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {team.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="enq-followup">Next follow-up</Label>
                  <div className="mt-1.5 flex gap-2">
                    <Input
                      id="enq-followup" type="date"
                      value={selected.nextFollowUpAt ? selected.nextFollowUpAt.slice(0, 10) : ''}
                      onChange={ev => patch(selected, { nextFollowUpAt: ev.target.value || null }, 'Follow-up saved', selected.reference)}
                    />
                    {selected.nextFollowUpAt && (
                      <Button variant="ghost" size="sm" disabled={busyId === selected.id}
                        onClick={() => patch(selected, { nextFollowUpAt: null }, 'Follow-up cleared', selected.reference)}>
                        Clear
                      </Button>
                    )}
                  </div>
                  {selected.lastContactedAt && (
                    <p className="mt-1 text-xs text-muted-foreground">Last contacted {fmtDateTime(selected.lastContactedAt)}</p>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="enq-notes">Internal notes</Label>
                <Textarea id="enq-notes" value={notesDraft} onChange={ev => setNotesDraft(ev.target.value)} rows={4} maxLength={4000} className="mt-1.5" placeholder="Add triage notes for the team…" />
                <p className="mt-1 text-xs text-muted-foreground">Visible to staff only — never shown to the enquirer.</p>
              </div>

              {selected.convertedContactId && contact && (
                <>
                  <Separator />
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                    <div className="flex items-start gap-2">
                      <UserRoundCheck className="h-4 w-4 mt-0.5 text-emerald-600" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">Converted to CRM contact: {contact.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {contact.clientId
                            ? 'Linked to a client record — ready for project creation.'
                            : 'Next step: create the client record, then create their project.'}
                        </p>
                      </div>
                    </div>

                    {contact.clientId ? (
                      <div className="flex flex-wrap gap-2">
                        <Button asChild size="sm">
                          <Link href={`/app/projects?clientId=${contact.clientId}`}>
                            <Building className="h-4 w-4 mr-1" /> Create project
                          </Link>
                        </Button>
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/app/clients/${contact.clientId}`}>
                            <ExternalLink className="h-4 w-4 mr-1" /> Open client
                          </Link>
                        </Button>
                      </div>
                    ) : clientFormOpen ? (
                      <form onSubmit={addAsClient} className="space-y-3" aria-label="Create client from enquiry">
                        {clientError && <Alert variant="destructive"><AlertDescription>{clientError}</AlertDescription></Alert>}
                        <div>
                          <Label htmlFor="enq-client-name">Client (business) name</Label>
                          <Input id="enq-client-name" value={clientName} onChange={ev => setClientName(ev.target.value)} required minLength={2} maxLength={160} className="mt-1.5" />
                        </div>
                        <div>
                          <Label htmlFor="enq-client-cat">Business category</Label>
                          <Select value={clientCategory} onValueChange={setClientCategory}>
                            <SelectTrigger id="enq-client-cat" className="mt-1.5"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button type="submit" size="sm" disabled={clientBusy || clientName.trim().length < 2}>
                            {clientBusy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Create client
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setClientFormOpen(false)}>Cancel</Button>
                        </div>
                      </form>
                    ) : (
                      <Button
                        size="sm" variant="secondary"
                        onClick={() => {
                          setClientName(contact.company || selected.companyName || selected.name)
                          setClientCategory('Other')
                          setClientFormOpen(true)
                        }}
                      >
                        <Building className="h-4 w-4 mr-1" /> Add as client
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          <DialogFooter className="flex flex-wrap gap-2 sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {selected && selected.status !== 'IN_PROGRESS' && selected.status !== 'CONVERTED' && selected.status !== 'CLOSED' && (
                <Button variant="secondary" size="sm" disabled={busyId === selected.id} onClick={() => patch(selected, { status: 'IN_PROGRESS' }, 'Enquiry updated', `${selected.reference} → in review`)}>Mark in review</Button>
              )}
              {selected && selected.status !== 'FOLLOW_UP' && selected.status !== 'CONVERTED' && selected.status !== 'CLOSED' && (
                <Button variant="secondary" size="sm" disabled={busyId === selected.id} onClick={() => patch(selected, { status: 'FOLLOW_UP' }, 'Enquiry updated', `${selected.reference} → follow up`)}>Follow up</Button>
              )}
              {selected && selected.status !== 'QUALIFIED' && selected.status !== 'CONVERTED' && selected.status !== 'CLOSED' && (
                <Button variant="secondary" size="sm" disabled={busyId === selected.id} onClick={() => patch(selected, { status: 'QUALIFIED' }, 'Enquiry updated', `${selected.reference} → qualified`)}>Mark qualified</Button>
              )}
              {selected && !selected.convertedContactId && selected.status !== 'CLOSED' && (
                <Button size="sm" disabled={busyId === selected.id} onClick={() => convertToContact(selected)}>
                  <UserRoundCheck className="h-4 w-4 mr-1" /> Convert to contact
                </Button>
              )}
              {selected && selected.status !== 'CLOSED' && (
                <Button variant="outline" size="sm" disabled={busyId === selected.id} onClick={() => patch(selected, { status: 'CLOSED' }, 'Enquiry updated', `${selected.reference} → closed`, { close: true })}>Close</Button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={busyId === selected?.id}
                onClick={() => selected && patch(selected, { recordContact: true }, 'Contact attempt recorded', selected.reference)}>
                <PhoneCall className="h-4 w-4 mr-1" /> Record contact attempt
              </Button>
              <Button size="sm" disabled={busyId === selected?.id} onClick={() => selected && saveNotes(selected)}>
                {busyId === selected?.id && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save notes
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
