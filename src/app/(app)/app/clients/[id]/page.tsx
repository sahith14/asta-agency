import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requirePageRole } from '../../_lib'
import { formatGBP, formatDate } from '@/lib/format'
import { InternalStatusBadge } from '@/components/internal/InternalStatusBadge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ROLE_LABELS } from '@/lib/constants'

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageRole(['CLIENT_MANAGER', 'SUPPORT_FINANCE'])
  const { id } = await params

  const client = await db.client.findUnique({
    where: { id },
    include: {
      projects: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          status: true,
          packageType: true,
          targetLaunchDate: true,
          assignedTo: { select: { name: true } },
        },
      },
      users: {
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true, email: true, name: true, role: true },
      },
      subscriptions: { orderBy: { createdAt: 'desc' } },
    },
  })
  if (!client) notFound()

  const [invoiceCount, outstandingAgg, tickets, openTicketCount] = await Promise.all([
    db.invoice.count({ where: { clientId: id } }),
    db.invoice.aggregate({ _sum: { amountCents: true }, where: { clientId: id, status: { in: ['ISSUED', 'OVERDUE'] } } }),
    db.supportTicket.findMany({
      where: { clientId: id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, subject: true, status: true, createdAt: true },
    }),
    db.supportTicket.count({ where: { clientId: id, status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_ON_CLIENT'] } } }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <Link href="/app/clients" className="text-sm text-muted-foreground hover:underline">
          ← Clients
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">{client.name}</h1>
          <InternalStatusBadge status={client.status} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Client information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Contact:</span> {client.contactName}
            </p>
            <p>
              <span className="text-muted-foreground">Email:</span> {client.email}
            </p>
            <p>
              <span className="text-muted-foreground">Phone:</span> {client.phone ?? '—'}
            </p>
            <p>
              <span className="text-muted-foreground">Address:</span> {client.address ?? '—'}
            </p>
            <p>
              <span className="text-muted-foreground">Industry:</span> {client.industry ?? '—'}
            </p>
            <p>
              <span className="text-muted-foreground">Client since:</span> {formatDate(client.createdAt)}
            </p>
          </CardContent>
        </Card>

        {/* Internal notes (staff-only by design — never exposed via portal APIs) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Internal notes</CardTitle>
          </CardHeader>
          <CardContent>
            {client.internalNotes ? (
              <p className="whitespace-pre-wrap text-sm">{client.internalNotes}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No internal notes recorded.</p>
            )}
          </CardContent>
        </Card>

        {/* Projects */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Projects ({client.projects.length})</CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 space-y-3 overflow-y-auto">
            {client.projects.length === 0 ? <p className="text-sm text-muted-foreground">No projects yet.</p> : null}
            {client.projects.map((p) => (
              <div key={p.id} className="text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/app/projects/${p.id}`} className="font-medium hover:underline">
                    {p.name}
                  </Link>
                  <InternalStatusBadge status={p.status} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {p.packageType ?? 'No package'}
                  {p.assignedTo ? ` · ${p.assignedTo.name}` : ''} · target launch {formatDate(p.targetLaunchDate)}
                </p>
                <Separator className="mt-3" />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Portal users */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Portal users ({client.users.length})</CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 space-y-3 overflow-y-auto">
            {client.users.length === 0 ? <p className="text-sm text-muted-foreground">No portal users.</p> : null}
            {client.users.map((u) => (
              <div key={u.id} className="text-sm">
                <p className="font-medium">{u.name}</p>
                <p className="text-xs text-muted-foreground">
                  {u.email} · {ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] ?? u.role}
                </p>
                <Separator className="mt-3" />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Subscriptions + invoices */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Subscriptions & invoices</CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 space-y-3 overflow-y-auto">
            {client.subscriptions.length === 0 ? <p className="text-sm text-muted-foreground">No subscriptions.</p> : null}
            {client.subscriptions.map((s) => (
              <div key={s.id} className="text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{s.planName}</span>
                  <InternalStatusBadge status={s.status} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatGBP(s.monthlyPriceCents)}/month · renews {formatDate(s.renewalDate)}
                </p>
                <Separator className="mt-3" />
              </div>
            ))}
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium">Invoices: {invoiceCount}</p>
              <p className="text-xs text-muted-foreground">
                Outstanding: <span className="font-semibold text-foreground">{formatGBP(outstandingAgg._sum.amountCents ?? 0)}</span> (issued + overdue)
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Tickets */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Support tickets</CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 space-y-3 overflow-y-auto">
            <p className="text-sm text-muted-foreground">
              {openTicketCount} open · recent:
            </p>
            {tickets.length === 0 ? <p className="text-sm text-muted-foreground">No tickets yet.</p> : null}
            {tickets.map((t) => (
              <div key={t.id} className="text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{t.subject}</span>
                  <InternalStatusBadge status={t.status} />
                </div>
                <p className="text-xs text-muted-foreground">Raised {formatDate(t.createdAt)}</p>
                <Separator className="mt-3" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
