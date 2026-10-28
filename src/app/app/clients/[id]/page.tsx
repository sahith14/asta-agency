'use client'

import { useEffect, useState, useCallback, FormEvent } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { api, fmtDate, fmtMoney } from '@/lib/client'
import { StatusBadge } from '@/components/status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ArrowLeft, UserPlus, KeyRound, Copy, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface ClientDetail {
  id: string; name: string; businessCategory: string; contactName: string | null; contactEmail: string | null
  contactPhone: string | null; address: string | null; notes: string | null
  projects: Array<{ id: string; name: string; reference: string; serviceType: string; status: string; targetDate: string | null }>
  portalUsers: Array<{ id: string; name: string; email: string; isActive: boolean }>
  _count: { invoices: number; tickets: number }
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { toast } = useToast()
  const [client, setClient] = useState<ClientDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api<{ client: ClientDetail }>(`/api/clients/${id}`).then(d => setClient(d.client)).catch(e => setError(e.message))
  }, [id])
  useEffect(() => { load() }, [load])

  async function addPortalUser(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setBusy(true)
    try {
      const res = await api<{ temporaryPassword: string }>(`/api/clients/${id}`, { method: 'POST', body: { name: String(fd.get('name')), email: String(fd.get('email')) } })
      setBusy(false)
      toast({ title: 'Portal user created', description: `Temporary password: ${res.temporaryPassword} (copy it now — shown once)` })
      load()
    } catch (err) {
      setBusy(false)
      toast({ title: 'Failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' })
    }
  }

  async function resetPortalPassword(portalUserId: string) {
    setBusy(true)
    try {
      const res = await api<{ temporaryPassword: string }>(`/api/clients/${id}`, { method: 'PUT', body: { portalUserId } })
      setBusy(false)
      toast({ title: 'Password reset', description: `Temporary password: ${res.temporaryPassword} (copy it now — shown once)` })
    } catch (err) {
      setBusy(false)
      toast({ title: 'Failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' })
    }
  }

  if (error) return <Alert variant="destructive"><AlertTitle>Cannot open client</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
  if (!client) return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-48" /></div>

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="mb-1 -ml-2" asChild><Link href="/app/clients"><ArrowLeft className="h-4 w-4 mr-1" />Clients</Link></Button>
      <div>
        <h1 className="text-2xl font-bold">{client.name}</h1>
        <p className="text-sm text-muted-foreground">{client.businessCategory} · {client.contactName ?? '—'} · {client.contactEmail ?? ''} {client.contactPhone ?? ''}</p>
      </div>

      {client.address && <Card><CardContent className="py-4 text-sm"><span className="text-muted-foreground">Address: </span>{client.address}</CardContent></Card>}
      {client.notes && <Card><CardContent className="py-4 text-sm"><span className="text-muted-foreground">Notes: </span>{client.notes}</CardContent></Card>}

      <Card>
        <CardHeader><CardTitle className="text-base">Projects</CardTitle></CardHeader>
        <CardContent>
          {client.projects.length === 0 ? <p className="text-sm text-muted-foreground py-4 text-center">No projects yet.</p> : (
            <div className="space-y-2">
              {client.projects.map(p => (
                <Link key={p.id} href={`/app/projects/${p.id}`} className="flex items-center gap-3 rounded-lg border p-3 hover:border-primary/40">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.reference} · {p.serviceType === 'VIDEO_PRODUCTION' ? 'Video production' : 'Website'}</p>
                  </div>
                  <StatusBadge status={p.status} />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Portal users</CardTitle>
          <Dialog>
            <DialogTrigger asChild><Button size="sm" variant="outline"><UserPlus className="h-4 w-4 mr-1" />Add portal user</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create client portal login</DialogTitle>
                <DialogDescription>The temporary password is shown once — hand it to the client securely.</DialogDescription></DialogHeader>
              <form onSubmit={addPortalUser} className="space-y-4">
                <div className="space-y-1.5"><Label htmlFor="pu-name">Name</Label><Input id="pu-name" name="name" required maxLength={120} /></div>
                <div className="space-y-1.5"><Label htmlFor="pu-email">Email</Label><Input id="pu-email" name="email" type="email" required /></div>
                <DialogFooter><Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {client.portalUsers.length === 0 ? <p className="text-sm text-muted-foreground py-4 text-center">No portal users yet.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {client.portalUsers.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>{u.isActive ? <StatusBadge status="APPROVE" /> : <StatusBadge status="CLOSED" />}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => resetPortalPassword(u.id)}><KeyRound className="h-3.5 w-3.5 mr-1" />Reset password</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
