import Link from 'next/link'
import { db } from '@/lib/db'
import { requirePageRole, canManageClients } from '../_lib'
import { formatDate } from '@/lib/format'
import { InternalStatusBadge } from '@/components/internal/InternalStatusBadge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NewClientDialog } from './new-client-dialog'

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ query?: string }> }) {
  const user = await requirePageRole(['CLIENT_MANAGER', 'SUPPORT_FINANCE'])
  const { query } = await searchParams
  const q = query?.trim().slice(0, 120) ?? ''

  const clients = await db.client.findMany({
    where: q ? { OR: [{ name: { contains: q } }, { contactName: { contains: q } }, { email: { contains: q } }] } : undefined,
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      contactName: true,
      email: true,
      status: true,
      industry: true,
      createdAt: true,
      _count: { select: { projects: true } },
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">Clients</h1>
          <p className="text-sm text-muted-foreground">Client businesses, contacts and engagement status.</p>
        </div>
        {canManageClients(user) ? <NewClientDialog /> : null}
      </div>

      <form action="/app/clients" method="get" className="flex w-full max-w-sm items-center gap-2">
        <Input name="query" defaultValue={q} placeholder="Search name, contact or email…" aria-label="Search clients" className="h-10" />
        <Button type="submit" variant="outline" className="h-10">
          Search
        </Button>
      </form>

      {clients.length === 0 ? (
        <p className="text-sm text-muted-foreground">{q ? `No clients match “${q}”.` : 'No clients yet.'}</p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Industry</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Projects</th>
                  <th className="px-4 py-3 font-medium">Since</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-accent/40">
                    <td className="px-4 py-3">
                      <Link href={`/app/clients/${c.id}`} className="font-medium hover:underline">
                        {c.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{c.email}</p>
                    </td>
                    <td className="px-4 py-3">{c.contactName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.industry ?? '—'}</td>
                    <td className="px-4 py-3">
                      <InternalStatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{c._count.projects}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="space-y-3 md:hidden">
            {clients.map((c) => (
              <Link key={c.id} href={`/app/clients/${c.id}`} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Card className="transition-colors hover:border-primary/40">
                  <CardContent className="space-y-1.5 pt-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold">{c.name}</p>
                      <InternalStatusBadge status={c.status} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {c.contactName} · {c.email}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.industry ?? '—'} · {c._count.projects} project{c._count.projects === 1 ? '' : 's'} · since {formatDate(c.createdAt)}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
