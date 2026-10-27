'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, BadgePoundSterling, CircleDollarSign, FileText, Plus, RefreshCw, Repeat } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'
import {
  AdminEmptyState,
  AdminSpinner,
  AdminStatCard,
  AdminStatusBadge,
  adminFetch,
  poundsToCents,
} from '@/components/internal/admin-bits'
import { formatGBP, formatDate, formatDateTime, humanizeStatus } from '@/lib/format'
import { cn } from '@/lib/utils'
import { INVOICE_STATUSES, ROLES, SUBSCRIPTION_STATUSES, type Role } from '@/lib/constants'

type ClientOption = { id: string; name: string }

type InvoicePayment = {
  id: string
  amountCents: number
  method: string
  status: string
  createdAt: string
}

type Invoice = {
  id: string
  number: string
  description: string
  amountCents: number
  currency: string
  status: string
  issuedAt: string | null
  dueDate: string | null
  paidAt: string | null
  createdAt: string
  client: { id: string; name: string }
  payments: InvoicePayment[]
}

type Payment = {
  id: string
  invoiceId: string
  amountCents: number
  method: string
  reference: string | null
  status: string
  evidenceNote: string | null
  verifiedAt: string | null
  createdAt: string
  invoice: { id: string; number: string; status: string; amountCents: number; client: { id: string; name: string } }
  verifiedBy: { id: string; name: string } | null
}

type Subscription = {
  id: string
  clientId: string
  planName: string
  scopeJson: string | null
  monthlyPriceCents: number
  status: string
  renewalDate: string | null
  client: { id: string; name: string }
}

type BillingQuestion = {
  id: string
  subject: string
  message: string
  type: string
  status: string
  response: string | null
  createdAt: string
  resolvedAt: string | null
  client: { id: string; name: string }
  invoice: { id: string; number: string } | null
  raisedBy: { id: string; name: string }
}

type Overview = {
  outstanding: { count: number; amountCents: number }
  paidThisMonth: { count: number; amountCents: number; month: string }
  pendingVerifications: { count: number; amountCents: number }
  subscriptionsActive: number
  openBillingQuestions: number
  recentInvoices: Invoice[]
}

export function FinanceClient({ role, clients }: { role: Role; clients: ClientOption[] }) {
  const { toast } = useToast()
  const [overview, setOverview] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const loadOverview = useCallback(async () => {
    try {
      const data = await adminFetch<Overview>('/api/finance/overview')
      setOverview(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load overview')
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount
    void loadOverview()
  }, [loadOverview, reloadKey])

  function bump() {
    setReloadKey((k) => k + 1)
    void loadOverview()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Finance</h1>
          <p className="text-sm text-muted-foreground">
            Invoicing, payments, subscriptions and billing queries. Money only counts once it is verified with evidence.
          </p>
        </div>
        <Button variant="outline" className="h-11" onClick={() => bump()} aria-label="Refresh finance data">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Could not load finance overview</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : overview === null ? (
        <AdminSpinner label="Loading finance overview…" />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <AdminStatCard
            label="Outstanding"
            value={formatGBP(overview.outstanding.amountCents)}
            hint={`${overview.outstanding.count} issued/overdue invoice${overview.outstanding.count === 1 ? '' : 's'}`}
            tone={overview.outstanding.amountCents > 0 ? 'warning' : 'default'}
          />
          <AdminStatCard
            label="Paid this month"
            value={formatGBP(overview.paidThisMonth.amountCents)}
            hint={`${overview.paidThisMonth.count} verified payment${overview.paidThisMonth.count === 1 ? '' : 's'}`}
          />
          <AdminStatCard
            label="Pending verification"
            value={formatGBP(overview.pendingVerifications.amountCents)}
            hint={`${overview.pendingVerifications.count} payment${overview.pendingVerifications.count === 1 ? '' : 's'} awaiting evidence`}
            tone={overview.pendingVerifications.count > 0 ? 'warning' : 'default'}
          />
          <AdminStatCard
            label="Active subscriptions"
            value={String(overview.subscriptionsActive)}
            hint="Care plans currently active"
          />
          <AdminStatCard
            label="Open billing questions"
            value={String(overview.openBillingQuestions)}
            hint="Awaiting a response"
            tone={overview.openBillingQuestions > 0 ? 'warning' : 'default'}
          />
        </div>
      )}

      <Tabs defaultValue="invoices">
        <TabsList className="flex-wrap">
          <TabsTrigger value="invoices"><FileText className="h-4 w-4 md:mr-1" /> Invoices</TabsTrigger>
          <TabsTrigger value="payments"><CircleDollarSign className="h-4 w-4 md:mr-1" /> Payments</TabsTrigger>
          <TabsTrigger value="subscriptions"><Repeat className="h-4 w-4 md:mr-1" /> Subscriptions</TabsTrigger>
          <TabsTrigger value="questions"><BadgePoundSterling className="h-4 w-4 md:mr-1" /> Billing questions</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="mt-4">
          <InvoicesTab clients={clients} onChanged={bump} />
        </TabsContent>
        <TabsContent value="payments" className="mt-4">
          <PaymentsTab role={role} onChanged={bump} />
        </TabsContent>
        <TabsContent value="subscriptions" className="mt-4">
          <SubscriptionsTab onChanged={bump} />
        </TabsContent>
        <TabsContent value="questions" className="mt-4">
          <BillingQuestionsTab onChanged={bump} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

function InvoicesTab({ clients, onChanged }: { clients: ClientOption[]; onChanged: () => void }) {
  const { toast } = useToast()
  const [invoices, setInvoices] = useState<Invoice[] | null>(null)
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [clientFilter, setClientFilter] = useState('ALL')
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [clientId, setClientId] = useState('')
  const [subscriptionId, setSubscriptionId] = useState('none')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [status, setStatus] = useState('ISSUED')

  const load = useCallback(async () => {
    setInvoices(null)
    const params = new URLSearchParams()
    if (statusFilter !== 'ALL') params.set('status', statusFilter)
    if (clientFilter !== 'ALL') params.set('clientId', clientFilter)
    try {
      const [inv, subs] = await Promise.all([
        adminFetch<{ invoices: Invoice[] }>(`/api/finance/invoices?${params.toString()}`),
        adminFetch<{ subscriptions: Subscription[] }>('/api/finance/subscriptions'),
      ])
      setInvoices(inv.invoices)
      setSubscriptions(subs.subscriptions)
    } catch (err) {
      toast({ title: 'Could not load invoices', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
      setInvoices([])
    }
  }, [statusFilter, clientFilter, toast])

  useEffect(() => {
    void load()
  }, [load])

  async function createInvoice() {
    const cents = poundsToCents(amount)
    if (!clientId || !description.trim() || cents === null) {
      toast({ title: 'Missing or invalid fields', description: 'Client, description and a valid amount in pounds (£) are required.', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    try {
      const data = await adminFetch<{ invoice: Invoice }>('/api/finance/invoices', {
        method: 'POST',
        body: JSON.stringify({
          clientId,
          subscriptionId: subscriptionId === 'none' ? null : subscriptionId,
          description: description.trim(),
          amountCents: cents,
          dueDate: dueDate || null,
          status,
        }),
      })
      toast({
        title: `Invoice ${data.invoice.number} created`,
        description: data.invoice.status === 'ISSUED' ? 'Issued — the client has been notified.' : `Saved with status ${humanizeStatus(data.invoice.status)}.`,
      })
      setCreateOpen(false)
      setClientId('')
      setSubscriptionId('none')
      setDescription('')
      setAmount('')
      setDueDate('')
      setStatus('ISSUED')
      await load()
      onChanged()
    } catch (err) {
      toast({ title: 'Could not create invoice', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  async function setInvoiceStatus(invoice: Invoice, nextStatus: string) {
    try {
      await adminFetch(`/api/finance/invoices/${invoice.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      })
      toast({ title: `Invoice ${invoice.number} → ${humanizeStatus(nextStatus)}` })
      await load()
      onChanged()
    } catch (err) {
      toast({ title: 'Could not update invoice', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    }
  }

  const clientSubscriptions = subscriptions.filter((s) => s.clientId === clientId)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-11 w-44" aria-label="Filter invoices by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {INVOICE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{humanizeStatus(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="h-11 w-52" aria-label="Filter invoices by client">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All clients</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="ml-auto h-11"><Plus className="h-4 w-4" /> New invoice</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>New invoice</DialogTitle>
              <DialogDescription>
                Enter the amount in pounds (£) — it is stored in pence. Issuing notifies the client.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="inv-client">Client</Label>
                <Select value={clientId} onValueChange={(v) => { setClientId(v); setSubscriptionId('none') }}>
                  <SelectTrigger id="inv-client" className="h-11 w-full">
                    <SelectValue placeholder="Select a client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="inv-subscription">Subscription (optional)</Label>
                <Select value={subscriptionId} onValueChange={setSubscriptionId} disabled={!clientId}>
                  <SelectTrigger id="inv-subscription" className="h-11 w-full">
                    <SelectValue placeholder={clientId ? 'Not linked to a subscription' : 'Select a client first'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not linked to a subscription</SelectItem>
                    {clientSubscriptions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.planName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="inv-description">Description</Label>
                <Input id="inv-description" value={description} onChange={(e) => setDescription(e.target.value)} className="h-11" maxLength={300} />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="inv-amount">Amount (£)</Label>
                  <Input id="inv-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="490.00" className="h-11" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="inv-due">Due date</Label>
                  <Input id="inv-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-11" />
                </div>
                <div className="grid gap-2">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="h-11 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ISSUED">Issued</SelectItem>
                      <SelectItem value="DRAFT">Draft</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {amount ? (
                <p className="text-xs text-muted-foreground">
                  Stored as {poundsToCents(amount) === null ? 'invalid amount' : `${poundsToCents(amount)} pence`} ({formatGBP(poundsToCents(amount) ?? 0)}).
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button onClick={() => void createInvoice()} disabled={submitting} className="h-11 w-full sm:w-auto">
                {submitting ? 'Creating…' : 'Create invoice'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {invoices === null ? (
        <AdminSpinner label="Loading invoices…" />
      ) : invoices.length === 0 ? (
        <AdminEmptyState title="No invoices found" description="Create an invoice or clear the filters." />
      ) : (
        <>
          <div className="hidden max-h-96 overflow-y-auto rounded-lg border md:block">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableCaption className="sr-only">Invoices</TableCaption>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="whitespace-nowrap font-mono text-xs font-medium">{inv.number}</TableCell>
                    <TableCell>{inv.client.name}</TableCell>
                    <TableCell className="max-w-64 truncate">{inv.description}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatGBP(inv.amountCents, inv.currency)}</TableCell>
                    <TableCell><AdminStatusBadge status={inv.status} /></TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(inv.dueDate)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {inv.status === 'DRAFT' ? (
                          <StatusAction label="Mark issued" onConfirm={() => void setInvoiceStatus(inv, 'ISSUED')} />
                        ) : null}
                        {['ISSUED', 'OVERDUE'].includes(inv.status) ? (
                          <>
                            <StatusAction label="Mark paid" onConfirm={() => void setInvoiceStatus(inv, 'PAID')} />
                            <StatusAction label="Cancel invoice" description="Cancelled invoices cannot be un-cancelled. The client is not notified of cancellations." onConfirm={() => void setInvoiceStatus(inv, 'CANCELLED')} />
                          </>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-3 md:hidden">
            {invoices.map((inv) => (
              <Card key={inv.id}>
                <CardContent className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-xs font-semibold">{inv.number}</p>
                    <AdminStatusBadge status={inv.status} />
                  </div>
                  <p className="mt-1 text-sm font-medium">{formatGBP(inv.amountCents, inv.currency)}</p>
                  <p className="text-xs text-muted-foreground">{inv.client.name} · {inv.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Due {formatDate(inv.dueDate)}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {inv.status === 'DRAFT' ? <StatusAction label="Mark issued" onConfirm={() => void setInvoiceStatus(inv, 'ISSUED')} /> : null}
                    {['ISSUED', 'OVERDUE'].includes(inv.status) ? (
                      <>
                        <StatusAction label="Mark paid" onConfirm={() => void setInvoiceStatus(inv, 'PAID')} />
                        <StatusAction label="Cancel invoice" onConfirm={() => void setInvoiceStatus(inv, 'CANCELLED')} />
                      </>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function StatusAction({
  label,
  description,
  onConfirm,
}: {
  label: string
  description?: string
  onConfirm: () => void
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-11 px-3 text-xs">{label}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{label}?</AlertDialogTitle>
          <AlertDialogDescription>
            {description ?? 'This changes the invoice status and is recorded in the audit log.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{label}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

function PaymentsTab({ role, onChanged }: { role: Role; onChanged: () => void }) {
  const { toast } = useToast()
  const [payments, setPayments] = useState<Payment[] | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [recordOpen, setRecordOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // record payment form
  const [invoiceId, setInvoiceId] = useState('')
  const [method, setMethod] = useState('BANK_TRANSFER')
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')

  // verify / reject / refund state
  const [verifyTarget, setVerifyTarget] = useState<Payment | null>(null)
  const [evidence, setEvidence] = useState('')
  const [markPaid, setMarkPaid] = useState(false)
  const [rejectTarget, setRejectTarget] = useState<Payment | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [refundTarget, setRefundTarget] = useState<Payment | null>(null)
  const [refundAmount, setRefundAmount] = useState('')
  const [refundReason, setRefundReason] = useState('')

  const load = useCallback(async () => {
    setPayments(null)
    try {
      const [pay, inv] = await Promise.all([
        adminFetch<{ payments: Payment[] }>('/api/finance/payments'),
        adminFetch<{ invoices: Invoice[] }>('/api/finance/invoices'),
      ])
      setPayments(pay.payments)
      setInvoices(inv.invoices)
    } catch (err) {
      toast({ title: 'Could not load payments', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
      setPayments([])
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  const billableInvoices = invoices.filter((i) => ['ISSUED', 'OVERDUE'].includes(i.status))
  const selectedInvoice = billableInvoices.find((i) => i.id === invoiceId)

  async function recordPayment() {
    const cents = poundsToCents(amount)
    if (!invoiceId || cents === null) {
      toast({ title: 'Missing or invalid fields', description: 'Pick an invoice and enter the amount in pounds (£).', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    try {
      const data = await adminFetch<{ payment: Payment; invoiceFullyCovered: boolean; hint?: string }>('/api/finance/payments', {
        method: 'POST',
        body: JSON.stringify({
          invoiceId,
          amountCents: cents,
          method,
          reference: reference.trim() || null,
        }),
      })
      toast({
        title: 'Payment recorded (pending)',
        description: data.hint ?? 'Verify it with evidence once the money is confirmed on the bank statement.',
      })
      setRecordOpen(false)
      setInvoiceId('')
      setAmount('')
      setReference('')
      await load()
      onChanged()
    } catch (err) {
      toast({ title: 'Could not record payment', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  async function verifyPayment() {
    if (!verifyTarget) return
    if (evidence.trim().length < 10) {
      toast({
        title: 'Evidence required',
        description: 'An evidence note of at least 10 characters is required — never mark money received without proof.',
        variant: 'destructive',
      })
      return
    }
    setSubmitting(true)
    try {
      await adminFetch(`/api/finance/payments/${verifyTarget.id}/verify`, {
        method: 'POST',
        body: JSON.stringify({ evidenceNote: evidence.trim(), markInvoicePaid: markPaid }),
      })
      toast({
        title: 'Payment verified',
        description: markPaid ? 'The invoice was also marked as paid and the client has been notified.' : 'The client has been notified that the payment was confirmed.',
      })
      setVerifyTarget(null)
      setEvidence('')
      setMarkPaid(false)
      await load()
      onChanged()
    } catch (err) {
      toast({ title: 'Could not verify payment', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  async function rejectPayment() {
    if (!rejectTarget) return
    if (rejectReason.trim().length < 3) {
      toast({ title: 'A reason is required to reject a payment', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    try {
      await adminFetch(`/api/finance/payments/${rejectTarget.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: rejectReason.trim() }),
      })
      toast({ title: 'Payment rejected' })
      setRejectTarget(null)
      setRejectReason('')
      await load()
      onChanged()
    } catch (err) {
      toast({ title: 'Could not reject payment', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  async function refundPayment() {
    if (!refundTarget) return
    if (refundReason.trim().length < 10) {
      toast({ title: 'A reason of at least 10 characters is required to issue a refund', variant: 'destructive' })
      return
    }
    let cents = refundTarget.amountCents
    if (refundAmount.trim()) {
      const parsed = poundsToCents(refundAmount)
      if (parsed === null) {
        toast({ title: 'Invalid refund amount', description: 'Enter the amount in pounds (£) or leave empty for a full refund.', variant: 'destructive' })
        return
      }
      cents = parsed
    }
    setSubmitting(true)
    try {
      await adminFetch(`/api/finance/payments/${refundTarget.id}/refund`, {
        method: 'POST',
        body: JSON.stringify({ amountCents: cents, reason: refundReason.trim() }),
      })
      toast({ title: 'Refund issued', description: 'Finance and the client manager have been notified.' })
      setRefundTarget(null)
      setRefundAmount('')
      setRefundReason('')
      await load()
      onChanged()
    } catch (err) {
      toast({ title: 'Could not issue refund', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Pending payments are highlighted. Verification requires written evidence (min 10 characters).
        </p>
        <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
          <DialogTrigger asChild>
            <Button className="h-11 shrink-0"><Plus className="h-4 w-4" /> Record payment</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Record a payment</DialogTitle>
              <DialogDescription>
                The payment starts as pending — money only counts as received once verified with evidence.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="pay-invoice">Invoice (issued/overdue)</Label>
                <Select
                  value={invoiceId}
                  onValueChange={(v) => {
                    setInvoiceId(v)
                    const inv = billableInvoices.find((i) => i.id === v)
                    if (inv) setAmount((inv.amountCents / 100).toFixed(2))
                  }}
                >
                  <SelectTrigger id="pay-invoice" className="h-11 w-full">
                    <SelectValue placeholder="Select an invoice" />
                  </SelectTrigger>
                  <SelectContent>
                    {billableInvoices.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.number} — {i.client.name} ({formatGBP(i.amountCents, i.currency)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedInvoice ? (
                  <p className="text-xs text-muted-foreground">
                    {selectedInvoice.description} · due {formatDate(selectedInvoice.dueDate)}
                  </p>
                ) : null}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="pay-amount">Amount (£)</Label>
                  <Input id="pay-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-11" />
                </div>
                <div className="grid gap-2">
                  <Label>Method</Label>
                  <Select value={method} onValueChange={setMethod}>
                    <SelectTrigger className="h-11 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BANK_TRANSFER">Bank transfer</SelectItem>
                      <SelectItem value="CARD_ONLINE">Card (online)</SelectItem>
                      <SelectItem value="MANUAL_CREDIT">Manual credit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pay-reference">Reference (optional)</Label>
                <Input id="pay-reference" value={reference} onChange={(e) => setReference(e.target.value)} className="h-11" maxLength={120} placeholder="e.g. bank statement line FP-88213" />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => void recordPayment()} disabled={submitting} className="h-11 w-full sm:w-auto">
                {submitting ? 'Recording…' : 'Record payment'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {payments === null ? (
        <AdminSpinner label="Loading payments…" />
      ) : payments.length === 0 ? (
        <AdminEmptyState title="No payments recorded" description="Record a payment against an issued invoice." />
      ) : (
        <>
          <div className="hidden max-h-96 overflow-y-auto rounded-lg border md:block">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableCaption className="sr-only">Payments</TableCaption>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id} className={cn(p.status === 'PENDING' && 'bg-amber-500/10 dark:bg-amber-400/10')}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(p.createdAt)}</TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs">{p.invoice.number}</TableCell>
                    <TableCell>{p.invoice.client.name}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatGBP(p.amountCents)}</TableCell>
                    <TableCell className="text-xs">{humanizeStatus(p.method)}</TableCell>
                    <TableCell>
                      <AdminStatusBadge status={p.status} />
                      {p.evidenceNote ? (
                        <p className="mt-1 max-w-56 truncate text-[11px] text-muted-foreground" title={p.evidenceNote}>“{p.evidenceNote}”</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {p.status === 'PENDING' ? (
                          <>
                            <Button
                              size="sm"
                              className="h-11 px-3 text-xs"
                              onClick={() => {
                                setVerifyTarget(p)
                                setEvidence('')
                                setMarkPaid(p.invoice.amountCents <= p.amountCents)
                              }}
                            >
                              Verify
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-11 px-3 text-xs"
                              onClick={() => {
                                setRejectTarget(p)
                                setRejectReason('')
                              }}
                            >
                              Reject
                            </Button>
                          </>
                        ) : null}
                        {p.status === 'VERIFIED' && role === ROLES.FOUNDER ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-11 px-3 text-xs"
                            onClick={() => {
                              setRefundTarget(p)
                              setRefundAmount((p.amountCents / 100).toFixed(2))
                              setRefundReason('')
                            }}
                          >
                            Refund
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-3 md:hidden">
            {payments.map((p) => (
              <Card key={p.id} className={cn(p.status === 'PENDING' && 'border-amber-600/40 bg-amber-500/10 dark:bg-amber-400/10')}>
                <CardContent className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-xs font-semibold">{p.invoice.number}</p>
                    <AdminStatusBadge status={p.status} />
                  </div>
                  <p className="mt-1 text-sm font-medium">{formatGBP(p.amountCents)}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.invoice.client.name} · {humanizeStatus(p.method)}{p.reference ? ` · ${p.reference}` : ''}
                  </p>
                  {p.evidenceNote ? <p className="mt-1 text-xs italic text-muted-foreground">“{p.evidenceNote}”</p> : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {p.status === 'PENDING' ? (
                      <>
                        <Button size="sm" className="h-11 px-3 text-xs" onClick={() => { setVerifyTarget(p); setEvidence(''); setMarkPaid(p.invoice.amountCents <= p.amountCents) }}>Verify</Button>
                        <Button size="sm" variant="outline" className="h-11 px-3 text-xs" onClick={() => { setRejectTarget(p); setRejectReason('') }}>Reject</Button>
                      </>
                    ) : null}
                    {p.status === 'VERIFIED' && role === ROLES.FOUNDER ? (
                      <Button size="sm" variant="outline" className="h-11 px-3 text-xs" onClick={() => { setRefundTarget(p); setRefundAmount((p.amountCents / 100).toFixed(2)); setRefundReason('') }}>Refund</Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Verify dialog */}
      <Dialog open={verifyTarget !== null} onOpenChange={(open) => !open && setVerifyTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Verify payment</DialogTitle>
            <DialogDescription>
              {verifyTarget ? `${formatGBP(verifyTarget.amountCents)} against ${verifyTarget.invoice.number} (${verifyTarget.invoice.client.name}).` : ''}
              {' '}Record the evidence you checked — payments must never be marked received without it.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="evidence-note">Evidence note (min 10 characters)</Label>
              <Textarea
                id="evidence-note"
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                rows={3}
                placeholder="e.g. Matched to bank statement 14 Feb, ref FP-88213, amount confirmed."
              />
              <p className={cn('text-xs', evidence.trim().length >= 10 ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-400')}>
                {evidence.trim().length}/10 characters minimum
              </p>
            </div>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <Checkbox checked={markPaid} onCheckedChange={(v) => setMarkPaid(v === true)} aria-label="Also mark invoice paid" />
              Also mark the invoice as paid
            </label>
          </div>
          <DialogFooter>
            <Button onClick={() => void verifyPayment()} disabled={submitting || evidence.trim().length < 10} className="h-11 w-full sm:w-auto">
              {submitting ? 'Verifying…' : 'Confirm verification'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <AlertDialog open={rejectTarget !== null} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject payment?</AlertDialogTitle>
            <AlertDialogDescription>
              {rejectTarget ? `${formatGBP(rejectTarget.amountCents)} against ${rejectTarget.invoice.number} will be marked as rejected.` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2 py-1">
            <Label htmlFor="reject-reason">Reason</Label>
            <Textarea id="reject-reason" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={2} placeholder="e.g. No matching transaction on the statement." />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void rejectPayment()} disabled={submitting || rejectReason.trim().length < 3}>
              Reject payment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Refund dialog (founder only) */}
      <Dialog open={refundTarget !== null} onOpenChange={(open) => !open && setRefundTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Issue refund (founder only)</DialogTitle>
            <DialogDescription>
              {refundTarget ? `Refund against ${refundTarget.invoice.number} (${formatGBP(refundTarget.amountCents)} original payment).` : ''}
              {' '}The refund is recorded as a separate REFUND payment; the invoice keeps its status.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="refund-amount">Refund amount (£, empty = full refund)</Label>
              <Input id="refund-amount" inputMode="decimal" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} className="h-11" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="refund-reason">Reason (min 10 characters)</Label>
              <Textarea id="refund-reason" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} rows={3} placeholder="e.g. Duplicate payment received on 12 Feb — refunding the second transfer." />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => void refundPayment()}
              disabled={submitting || refundReason.trim().length < 10}
              variant="destructive"
              className="h-11 w-full sm:w-auto"
            >
              {submitting ? 'Issuing…' : 'Issue refund'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

function SubscriptionsTab({ onChanged }: { onChanged: () => void }) {
  const { toast } = useToast()
  const [subscriptions, setSubscriptions] = useState<Subscription[] | null>(null)
  const [editTarget, setEditTarget] = useState<Subscription | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [planName, setPlanName] = useState('')
  const [price, setPrice] = useState('')
  const [renewalDate, setRenewalDate] = useState('')
  const [status, setStatus] = useState('ACTIVE')
  const [scopeText, setScopeText] = useState('')

  const load = useCallback(async () => {
    setSubscriptions(null)
    try {
      const data = await adminFetch<{ subscriptions: Subscription[] }>('/api/finance/subscriptions')
      setSubscriptions(data.subscriptions)
    } catch (err) {
      toast({ title: 'Could not load subscriptions', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
      setSubscriptions([])
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  function openEdit(sub: Subscription) {
    setEditTarget(sub)
    setPlanName(sub.planName)
    setPrice((sub.monthlyPriceCents / 100).toFixed(2))
    setRenewalDate(sub.renewalDate ? sub.renewalDate.slice(0, 10) : '')
    setStatus(sub.status)
    let items: string[] = []
    try {
      const parsed: unknown = sub.scopeJson ? JSON.parse(sub.scopeJson) : []
      if (Array.isArray(parsed)) items = parsed.map(String)
    } catch {
      items = []
    }
    setScopeText(items.join('\n'))
  }

  async function saveEdit() {
    if (!editTarget) return
    const cents = poundsToCents(price)
    if (!planName.trim() || cents === null) {
      toast({ title: 'Missing or invalid fields', description: 'Plan name and a valid price in pounds (£) are required.', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    try {
      await adminFetch(`/api/finance/subscriptions/${editTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          planName: planName.trim(),
          monthlyPriceCents: cents,
          status,
          renewalDate: renewalDate || null,
          scopeItems: scopeText
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      })
      toast({ title: 'Subscription updated', description: 'Plan changes have been recorded and the client notified.' })
      setEditTarget(null)
      await load()
      onChanged()
    } catch (err) {
      toast({ title: 'Could not update subscription', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      {subscriptions === null ? (
        <AdminSpinner label="Loading subscriptions…" />
      ) : subscriptions.length === 0 ? (
        <AdminEmptyState title="No subscriptions yet" description="Care plans created for clients will appear here." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {subscriptions.map((sub) => {
            let scope: string[] = []
            try {
              const parsed: unknown = sub.scopeJson ? JSON.parse(sub.scopeJson) : []
              if (Array.isArray(parsed)) scope = parsed.map(String)
            } catch {
              scope = []
            }
            return (
              <Card key={sub.id}>
                <CardContent className="px-4 py-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{sub.planName}</p>
                      <p className="text-xs text-muted-foreground">{sub.client.name}</p>
                    </div>
                    <AdminStatusBadge status={sub.status} />
                  </div>
                  <p className="mt-2 text-lg font-bold tabular-nums">
                    {formatGBP(sub.monthlyPriceCents)}<span className="text-xs font-normal text-muted-foreground">/month</span>
                  </p>
                  <p className="text-xs text-muted-foreground">Renews {formatDate(sub.renewalDate)}</p>
                  {scope.length > 0 ? (
                    <ul className="mt-3 max-h-32 list-inside list-disc space-y-1 overflow-y-auto text-xs text-muted-foreground">
                      {scope.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                  <Button size="sm" variant="outline" className="mt-3 h-11 w-full sm:w-auto" onClick={() => openEdit(sub)}>
                    Edit plan
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={editTarget !== null} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit subscription</DialogTitle>
            <DialogDescription>
              Plan, price and scope changes notify the client; every change is audited.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="sub-plan">Plan name</Label>
              <Input id="sub-plan" value={planName} onChange={(e) => setPlanName(e.target.value)} className="h-11" maxLength={120} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="sub-price">Price (£/month)</Label>
                <Input id="sub-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="h-11" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sub-renewal">Renewal date</Label>
                <Input id="sub-renewal" type="date" value={renewalDate} onChange={(e) => setRenewalDate(e.target.value)} className="h-11" />
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-11 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SUBSCRIPTION_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{humanizeStatus(s)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sub-scope">Agreed scope items (one per line)</Label>
              <Textarea id="sub-scope" value={scopeText} onChange={(e) => setScopeText(e.target.value)} rows={4} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => void saveEdit()} disabled={submitting} className="h-11 w-full sm:w-auto">
              {submitting ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Billing questions
// ---------------------------------------------------------------------------

function BillingQuestionsTab({ onChanged }: { onChanged: () => void }) {
  const { toast } = useToast()
  const [questions, setQuestions] = useState<BillingQuestion[] | null>(null)
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [respondTarget, setRespondTarget] = useState<BillingQuestion | null>(null)
  const [respondStatus, setRespondStatus] = useState('IN_REVIEW')
  const [respondText, setRespondText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setQuestions(null)
    const params = statusFilter === 'ALL' ? '' : `?status=${statusFilter}`
    try {
      const data = await adminFetch<{ questions: BillingQuestion[] }>(`/api/finance/billing-questions${params}`)
      setQuestions(data.questions)
    } catch (err) {
      toast({ title: 'Could not load billing questions', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
      setQuestions([])
    }
  }, [statusFilter, toast])

  useEffect(() => {
    void load()
  }, [load])

  async function respond() {
    if (!respondTarget) return
    setSubmitting(true)
    try {
      await adminFetch(`/api/finance/billing-questions/${respondTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: respondStatus,
          response: respondText.trim() || undefined,
        }),
      })
      toast({
        title: 'Billing query updated',
        description: ['RESOLVED', 'REJECTED', 'ACCEPTED'].includes(respondStatus)
          ? 'The client has been notified with your response.'
          : 'The query is now marked in review.',
      })
      setRespondTarget(null)
      setRespondText('')
      await load()
      onChanged()
    } catch (err) {
      toast({ title: 'Could not update billing query', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-11 w-44" aria-label="Filter billing questions by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED', 'ACCEPTED'].map((s) => (
              <SelectItem key={s} value={s}>{humanizeStatus(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Cancellation requests are flagged in amber.</p>
      </div>

      {questions === null ? (
        <AdminSpinner label="Loading billing questions…" />
      ) : questions.length === 0 ? (
        <AdminEmptyState title="No billing questions" description="Client-raised billing queries (from the portal) will appear here." />
      ) : (
        <div className="grid max-h-96 gap-3 overflow-y-auto pr-1 lg:grid-cols-2">
          {questions.map((q) => (
            <Card key={q.id} className={cn(q.type === 'CANCELLATION_REQUEST' && q.status === 'OPEN' && 'border-amber-600/40 bg-amber-500/10 dark:bg-amber-400/10')}>
              <CardContent className="px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{q.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      {q.client.name} · raised by {q.raisedBy.name} · {formatDateTime(q.createdAt)}
                      {q.invoice ? ` · invoice ${q.invoice.number}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {q.type === 'CANCELLATION_REQUEST' ? (
                      <Badge className="bg-amber-600 text-white">Cancellation request</Badge>
                    ) : null}
                    <AdminStatusBadge status={q.status} />
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{q.message}</p>
                {q.response ? (
                  <p className="mt-2 rounded-md bg-muted/50 p-2 text-sm">
                    <span className="font-medium">Our response:</span> {q.response}
                  </p>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 h-11"
                  onClick={() => {
                    setRespondTarget(q)
                    setRespondStatus(q.status === 'OPEN' ? 'IN_REVIEW' : q.status === 'IN_REVIEW' ? 'RESOLVED' : q.status)
                    setRespondText(q.response ?? '')
                  }}
                >
                  Respond
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={respondTarget !== null} onOpenChange={(open) => !open && setRespondTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Respond to billing query</DialogTitle>
            <DialogDescription>
              {respondTarget ? respondTarget.subject : ''}
              {' '}Resolving/rejecting/accepting notifies the client with your written response.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={respondStatus} onValueChange={setRespondStatus}>
                <SelectTrigger className="h-11 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="IN_REVIEW">In review</SelectItem>
                  <SelectItem value="RESOLVED">Resolved</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                  <SelectItem value="ACCEPTED">Accepted</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bq-response">Response to the client</Label>
              <Textarea id="bq-response" value={respondText} onChange={(e) => setRespondText(e.target.value)} rows={3} maxLength={5000} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => void respond()} disabled={submitting} className="h-11 w-full sm:w-auto">
              {submitting ? 'Saving…' : 'Save response'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
