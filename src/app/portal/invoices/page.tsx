'use client'

import { useEffect, useState } from 'react'
import { api, fmtDate, fmtMoney } from '@/lib/client'
import { StatusBadge } from '@/components/status-badge'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Wallet } from 'lucide-react'

interface Invoice { id: string; number: string; amount: number; status: string; issuedAt: string | null; dueDate: string | null; paidAt: string | null; notes: string | null; project: { name: string; reference: string } | null }

export default function PortalInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { api<{ invoices: Invoice[] }>('/api/portal/invoices').then(d => setInvoices(d.invoices)).catch(e => setError(e.message)) }, [])

  if (error) return <Alert variant="destructive"><AlertTitle>Failed to load</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
  if (!invoices) return <Skeleton className="h-64" />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Invoices</h1>
        <p className="text-muted-foreground text-sm">Your billing history. Payment collection is handled directly with your account manager.</p>
      </div>
      {invoices.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground"><Wallet className="h-10 w-10 mx-auto mb-3 opacity-30" /><p className="font-medium">No invoices yet</p></CardContent></Card>
      ) : (
        <Card><CardContent className="pt-6">
          <Table>
            <TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Project</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Issued</TableHead><TableHead>Due</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {invoices.map(inv => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.number}</TableCell>
                  <TableCell>{inv.project?.name ?? '—'}{inv.notes ? <span className="block text-xs text-muted-foreground">{inv.notes}</span> : null}</TableCell>
                  <TableCell className="text-right font-medium">{fmtMoney(inv.amount)}</TableCell>
                  <TableCell>{fmtDate(inv.issuedAt)}</TableCell>
                  <TableCell>{fmtDate(inv.dueDate)}</TableCell>
                  <TableCell><StatusBadge status={inv.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}
    </div>
  )
}
