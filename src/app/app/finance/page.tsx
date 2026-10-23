'use client'

import { useEffect, useState, FormEvent } from 'react'
import { api, fmtDate, fmtMoney } from '@/lib/client'
import { StatusBadge } from '@/components/status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Wallet, Plus, Loader2, Send, CheckCircle2, Ban } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface Invoice { id: string; number: string; amount: number; status: string; issuedAt: string | null; dueDate: string | null; client: { name: string }; project: { name: string; reference: string } | null }
interface Summary { projects: Array<{ id: string; name: string; serviceType: string; client: string; budget: number; actual: number; contribution: number; marginPct: number | null; invoiced: number; collected: number; outstanding: number }>; totals: { budget: number; actual: number; invoiced: number; collected: number; outstanding: number; contribution: number } }

export default function FinancePage() {
  const { toast } = useToast()
  const [invoices, setInvoices] = useState<Invoice[] | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([])
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [canManage, setCanManage] = useState(false)

  const load = () => {
    api<{ invoices: Invoice[] }>('/api/invoices?pageSize=100').then(d => { setInvoices(d.invoices); setCanManage(true) }).catch(e => setError(e.message))
    api<Summary>('/api/finance/summary').then(setSummary).catch(() => {})
  }
  useEffect(() => {
    load()
    api<{ clients: Array<{ id: string; name: string }> }>('/api/clients?pageSize=100').then(d => setClients(d.clients)).catch(() => {})
    api<{ projects: Array<{ id: string; name: string }> }>('/api/projects?pageSize=100').then(d => setProjects(d.projects)).catch(() => {})
  }, [])

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setBusy(true)
    try {
      await api('/api/invoices', { method: 'POST', body: {
        clientId: String(fd.get('clientId')),
        projectId: String(fd.get('projectId')) !== 'none' ? String(fd.get('projectId')) : undefined,
        amount: parseFloat(String(fd.get('amount'))),
        dueDate: fd.get('dueDate') ? new Date(String(fd.get('dueDate')) + 'T09:00').toISOString() : undefined,
        notes: String(fd.get('notes')) || undefined,
      } })
      setBusy(false); load()
    } catch (err) {
      setBusy(false)
      toast({ title: 'Failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' })
    }
  }

  async function transition(invoiceId: string, action: 'send' | 'markPaid' | 'void') {
    try {
      await api(`/api/invoices/${invoiceId}`, { method: 'POST', body: { action } })
      load()
    } catch (err) {
      toast({ title: 'Failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' })
    }
  }

  if (error) return <Alert variant="destructive"><AlertTitle>Access denied</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Wallet className="h-6 w-6 text-primary" /> Finance</h1>
          <p className="text-muted-foreground text-sm">Invoices and project profitability across both divisions.</p>
        </div>
        <Dialog>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />New invoice</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New invoice</DialogTitle>
              <DialogDescription>Invoices are created as drafts — sending and payment are explicit, audited actions.</DialogDescription></DialogHeader>
            <form onSubmit={onCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Client</Label>
                  <Select name="clientId" required><SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                    <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
                </div>
                <div className="space-y-1.5"><Label>Project</Label>
                  <Select name="projectId" defaultValue="none"><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="none">—</SelectItem>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label htmlFor="inv-amount">Amount (£)</Label><Input id="inv-amount" name="amount" type="number" min={0.01} step="0.01" required /></div>
                <div className="space-y-1.5"><Label htmlFor="inv-due">Due date</Label><Input id="inv-due" name="dueDate" type="date" /></div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="inv-notes">Notes</Label><Input id="inv-notes" name="notes" /></div>
              <DialogFooter><Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create draft</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="invoices">
        <TabsList><TabsTrigger value="invoices">Invoices</TabsTrigger><TabsTrigger value="profitability">Project profitability</TabsTrigger></TabsList>

        <TabsContent value="invoices" className="mt-4">
          {!invoices ? <Skeleton className="h-64" /> : invoices.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground"><Wallet className="h-10 w-10 mx-auto mb-3 opacity-30" /><p className="font-medium">No invoices yet</p></CardContent></Card>
          ) : (
            <Card><CardContent className="pt-6">
              <Table>
                <TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Client</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Issued</TableHead><TableHead>Due</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {invoices.map(inv => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.number}</TableCell>
                      <TableCell>{inv.client.name}{inv.project ? <span className="block text-xs text-muted-foreground">{inv.project.name}</span> : null}</TableCell>
                      <TableCell className="text-right font-medium">{fmtMoney(inv.amount)}</TableCell>
                      <TableCell>{fmtDate(inv.issuedAt)}</TableCell>
                      <TableCell>{fmtDate(inv.dueDate)}</TableCell>
                      <TableCell><StatusBadge status={inv.status} /></TableCell>
                      <TableCell>
                        <div className="flex gap-1.5">
                          {inv.status === 'DRAFT' && <Button size="sm" variant="outline" onClick={() => transition(inv.id, 'send')}><Send className="h-3.5 w-3.5 mr-1" />Send</Button>}
                          {['SENT', 'OVERDUE'].includes(inv.status) && <Button size="sm" variant="outline" onClick={() => transition(inv.id, 'markPaid')}><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Mark paid</Button>}
                          {['DRAFT', 'SENT', 'OVERDUE'].includes(inv.status) && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => transition(inv.id, 'void')}><Ban className="h-3.5 w-3.5" /></Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="profitability" className="mt-4">
          {!summary ? <Skeleton className="h-64" /> : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-4">
                {[
                  { label: 'Budget', value: summary.totals.budget },
                  { label: 'Actual cost', value: summary.totals.actual },
                  { label: 'Invoiced', value: summary.totals.invoiced },
                  { label: 'Collected', value: summary.totals.collected },
                  { label: 'Outstanding', value: summary.totals.outstanding },
                ].map(c => (
                  <Card key={c.label}><CardContent className="pt-5"><p className="text-xs text-muted-foreground">{c.label}</p><p className="text-lg font-bold mt-0.5">{fmtMoney(c.value)}</p></CardContent></Card>
                ))}
              </div>
              <Card><CardContent className="pt-6">
                <Table>
                  <TableHeader><TableRow><TableHead>Project</TableHead><TableHead>Client</TableHead><TableHead className="text-right">Budget</TableHead><TableHead className="text-right">Actual</TableHead><TableHead className="text-right">Contribution</TableHead><TableHead className="text-right">Margin</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {summary.projects.map(p => (
                      <TableRow key={p.id}>
                        <TableCell><p className="font-medium">{p.name}</p><p className="text-xs text-muted-foreground">{p.serviceType === 'VIDEO_PRODUCTION' ? 'Video' : 'Website'}</p></TableCell>
                        <TableCell>{p.client}</TableCell>
                        <TableCell className="text-right">{fmtMoney(p.budget)}</TableCell>
                        <TableCell className="text-right">{fmtMoney(p.actual)}</TableCell>
                        <TableCell className={`text-right font-medium ${p.contribution < 0 ? 'text-rose-600' : ''}`}>{fmtMoney(p.contribution)}</TableCell>
                        <TableCell className="text-right">{p.marginPct !== null ? `${p.marginPct}%` : '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent></Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
