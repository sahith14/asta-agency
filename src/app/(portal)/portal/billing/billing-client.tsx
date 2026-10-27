'use client'

import { useState } from 'react'
import {
  AlertCircle,
  BadgeCheck,
  CreditCard,
  Landmark,
  Loader2,
  MessageCircleQuestion,
  ReceiptText,
  Sparkles,
} from 'lucide-react'
import { ROLES } from '@/lib/constants'
import { formatGBP, formatDate } from '@/lib/format'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { apiSend, errorMessage, withScope } from '@/components/portal/api'
import { FounderScopeGate, FounderViewingBar, useFounderClientId } from '@/components/portal/founder-scope'
import { EmptyState, ErrorBox, friendlyStatus, Spinner, StatusBadge } from '@/components/portal/portal-ui'
import { useApi } from '@/components/portal/use-api'
import { useToast } from '@/hooks/use-toast'

type PaymentRow = {
  id: string
  method: string
  reference: string | null
  status: string
  amountCents: number
  createdAt: string
  verifiedAt: string | null
}

type InvoiceRow = {
  id: string
  number: string
  description: string
  amountCents: number
  currency: string
  status: string
  issuedAt: string | null
  dueDate: string | null
  paidAt: string | null
  payments: PaymentRow[]
}

type SubscriptionRow = {
  id: string
  planName: string
  scope: string[]
  monthlyPriceCents: number
  currency: string
  status: string
  renewalDate: string | null
  currentPeriodEnd: string | null
}

type QuestionRow = {
  id: string
  type: string
  subject: string
  message: string
  status: string
  response: string | null
  createdAt: string
  invoiceNumber: string | null
}

type BillingData = {
  client: { id: string; name: string }
  invoices: InvoiceRow[]
  subscriptions: SubscriptionRow[]
  paymentGateway: { connected: boolean; url?: string; message?: string }
  questions: QuestionRow[]
}

function paymentLine(p: PaymentRow): string {
  const method = friendlyStatus(p.method)
  if (p.status === 'VERIFIED') return `${method} verified ${formatDate(p.verifiedAt ?? p.createdAt)}`
  if (p.status === 'REJECTED') return `${method} rejected — please contact us`
  return `${method} received ${formatDate(p.createdAt)} — awaiting verification`
}

export function BillingClient({ role }: { role: string }) {
  const isFounder = role === ROLES.FOUNDER
  const [clientId] = useFounderClientId()
  const { data, error, loading, refetch } = useApi<BillingData>(
    isFounder && !clientId ? null : withScope('/api/portal/billing', isFounder ? clientId : null),
  )
  const { toast } = useToast()

  const [qOpen, setQOpen] = useState(false)
  const [qType, setQType] = useState<'QUESTION' | 'CANCELLATION_REQUEST'>('QUESTION')
  const [qSubject, setQSubject] = useState('')
  const [qMessage, setQMessage] = useState('')
  const [qInvoice, setQInvoice] = useState<string>('')
  const [qSubmitting, setQSubmitting] = useState(false)

  if (isFounder && !clientId) return <FounderScopeGate />

  const invoices = data?.invoices ?? []
  const outstanding = invoices.filter((i) => i.status === 'ISSUED' || i.status === 'OVERDUE')
  const outstandingTotal = outstanding.reduce((sum, i) => sum + i.amountCents, 0)
  const subscription = data?.subscriptions.find((s) => s.status === 'ACTIVE') ?? data?.subscriptions[0] ?? null

  async function submitQuestion(e: React.FormEvent) {
    e.preventDefault()
    setQSubmitting(true)
    try {
      await apiSend('/api/portal/billing/questions', 'POST', {
        type: qType,
        subject: qSubject,
        message: qMessage,
        invoiceId: qInvoice || undefined,
      })
      toast({ title: 'Sent to our finance team', description: 'We\u2019ll get back to you shortly.' })
      setQOpen(false)
      setQSubject('')
      setQMessage('')
      setQInvoice('')
      refetch()
    } catch (err) {
      toast({ title: 'Could not send', description: errorMessage(err), variant: 'destructive' })
    } finally {
      setQSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {isFounder && clientId ? <FounderViewingBar /> : null}

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
          <p className="mt-1 text-sm text-muted-foreground">Invoices, payments and your care plan — read-only truth.</p>
        </div>
        <Dialog open={qOpen} onOpenChange={setQOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="min-h-11">
              <MessageCircleQuestion className="mr-2 h-4 w-4" aria-hidden />
              Billing question
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Ask the finance team</DialogTitle>
              <DialogDescription>
                Questions about an invoice, or a request to cancel your plan. This never changes your billing records —
                a human reads and replies.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={submitQuestion} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="q-type">What is this?</Label>
                <Select value={qType} onValueChange={(v) => setQType(v as 'QUESTION' | 'CANCELLATION_REQUEST')}>
                  <SelectTrigger id="q-type" className="min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="QUESTION">A question</SelectItem>
                    <SelectItem value="CANCELLATION_REQUEST">Request cancellation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="q-subject">Subject</Label>
                <Input
                  id="q-subject"
                  value={qSubject}
                  onChange={(e) => setQSubject(e.target.value)}
                  placeholder="e.g. Question about invoice INV-2026-0041"
                  required
                  minLength={3}
                  maxLength={150}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="q-invoice">Related invoice (optional)</Label>
                <Select value={qInvoice} onValueChange={(v) => setQInvoice(v)}>
                  <SelectTrigger id="q-invoice" className="min-h-11">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    {invoices.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.number} — {formatGBP(i.amountCents, i.currency)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="q-message">Message</Label>
                <Textarea
                  id="q-message"
                  value={qMessage}
                  onChange={(e) => setQMessage(e.target.value)}
                  placeholder="Tell us what you'd like to know…"
                  rows={5}
                  required
                  minLength={5}
                  maxLength={4000}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" className="min-h-11" onClick={() => setQOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="min-h-11" disabled={qSubmitting}>
                  {qSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
                  Send
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      {error ? <ErrorBox message={error} /> : null}
      {loading ? <Spinner /> : null}

      {data ? (
        <>
          <Alert className="border-amber-300 bg-amber-50 text-amber-900">
            <BadgeCheck className="h-4 w-4" aria-hidden />
            <AlertDescription>
              Payment statuses are maintained by our finance team; records here reflect the agency system of record.
            </AlertDescription>
          </Alert>

          {outstanding.length > 0 ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" aria-hidden />
              <AlertTitle>
                {outstanding.length} invoice{outstanding.length === 1 ? '' : 's'} awaiting payment
              </AlertTitle>
              <AlertDescription>
                Total outstanding: <strong>{formatGBP(outstandingTotal)}</strong>. Please pay by bank transfer, or ask
                us a question using the button above.
              </AlertDescription>
            </Alert>
          ) : null}

          {/* Subscription */}
          {subscription ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4 text-primary" aria-hidden />
                  Your care plan
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-lg font-semibold">{subscription.planName}</span>
                  <StatusBadge status={subscription.status} />
                  <span className="text-sm text-muted-foreground">
                    {formatGBP(subscription.monthlyPriceCents, subscription.currency)} / month
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Renews {formatDate(subscription.renewalDate ?? subscription.currentPeriodEnd)}
                </p>
                {subscription.scope.length > 0 ? (
                  <div>
                    <p className="mb-1 text-sm font-medium">What&apos;s included:</p>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {subscription.scope.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {/* Invoices */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ReceiptText className="h-4 w-4 text-primary" aria-hidden />
                Invoices
              </CardTitle>
              <CardDescription>Newest first, with their payment history.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {invoices.length === 0 ? (
                <EmptyState title="No invoices yet" hint="Invoices appear here as soon as finance issues them." />
              ) : (
                <>
                  {/* md+ table */}
                  <div className="hidden overflow-x-auto md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice</TableHead>
                          <TableHead>Issued</TableHead>
                          <TableHead>Due</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Payments</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoices.map((inv) => (
                          <TableRow key={inv.id}>
                            <TableCell>
                              <span className="font-medium">{inv.number}</span>
                              <span className="block text-xs text-muted-foreground">{inv.description}</span>
                            </TableCell>
                            <TableCell>{formatDate(inv.issuedAt)}</TableCell>
                            <TableCell>{formatDate(inv.dueDate)}</TableCell>
                            <TableCell className="text-right font-semibold">
                              {formatGBP(inv.amountCents, inv.currency)}
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={inv.status} />
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {inv.payments.length === 0 ? (
                                <span>No payments recorded yet</span>
                              ) : (
                                <ul className="space-y-0.5">
                                  {inv.payments.map((p) => (
                                    <li key={p.id}>
                                      {paymentLine(p)}
                                      {p.reference ? ` · ref ${p.reference}` : ''}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* mobile cards */}
                  <ul className="space-y-3 md:hidden">
                    {invoices.map((inv) => (
                      <li key={inv.id} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">{inv.number}</span>
                          <StatusBadge status={inv.status} />
                        </div>
                        <p className="text-xs text-muted-foreground">{inv.description}</p>
                        <p className="mt-1 text-lg font-semibold">{formatGBP(inv.amountCents, inv.currency)}</p>
                        <p className="text-xs text-muted-foreground">
                          Issued {formatDate(inv.issuedAt)} · due {formatDate(inv.dueDate)}
                          {inv.paidAt ? ` · paid ${formatDate(inv.paidAt)}` : ''}
                        </p>
                        {inv.payments.length > 0 ? (
                          <ul className="mt-2 space-y-0.5 border-t pt-2 text-xs text-muted-foreground">
                            {inv.payments.map((p) => (
                              <li key={p.id}>
                                {paymentLine(p)}
                                {p.reference ? ` · ref ${p.reference}` : ''}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>

          {/* Payment options */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard className="h-4 w-4 text-primary" aria-hidden />
                How to pay
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.paymentGateway.connected ? (
                <Button asChild className="min-h-11">
                  <a href={data.paymentGateway.url} target="_blank" rel="noopener noreferrer">
                    <Landmark className="mr-2 h-4 w-4" aria-hidden />
                    Pay online securely
                  </a>
                </Button>
              ) : (
                <Alert>
                  <CreditCard className="h-4 w-4" aria-hidden />
                  <AlertTitle>Online payments not connected</AlertTitle>
                  <AlertDescription>{data.paymentGateway.message}</AlertDescription>
                </Alert>
              )}
              <p className="text-xs text-muted-foreground">
                We never see or store your card details. If online payments aren&apos;t available, bank transfer is
                always fine — our finance team verifies every payment by hand.
              </p>
            </CardContent>
          </Card>

          {/* Submitted questions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageCircleQuestion className="h-4 w-4 text-primary" aria-hidden />
                Your billing questions
              </CardTitle>
              <CardDescription>Questions and cancellation requests you&apos;ve sent us.</CardDescription>
            </CardHeader>
            <CardContent>
              {data.questions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing yet — use the “Billing question” button above.</p>
              ) : (
                <ul className="max-h-96 space-y-3 overflow-y-auto pr-1">
                  {data.questions.map((q) => (
                    <li key={q.id} className="rounded-lg border p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{q.subject}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{friendlyStatus(q.type)}</span>
                          <StatusBadge status={q.status} />
                        </span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{q.message}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Sent {formatDate(q.createdAt)}
                        {q.invoiceNumber ? ` · about ${q.invoiceNumber}` : ''}
                      </p>
                      {q.response ? (
                        <p className="mt-2 rounded-md bg-muted/40 p-2 text-xs">
                          <span className="font-medium">Our response: </span>
                          {q.response}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
