'use client'

import { useEffect, useState, FormEvent } from 'react'
import { api, fmtDate, ROLE_LABELS } from '@/lib/client'
import { useMe } from '@/components/app-shell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useToast } from '@/hooks/use-toast'
import { UserPlus, KeyRound, Loader2, Copy } from 'lucide-react'

const ROLES = ['OWNER', 'CLIENT_MANAGER', 'WEB_DEVELOPER', 'SUPPORT_FINANCE', 'VIDEOGRAPHER', 'VIDEO_EDITOR', 'CREATIVE_DIRECTOR']

export default function TeamPage() {
  const { me } = useMe()
  const { toast } = useToast()
  const [staff, setStaff] = useState<Array<{ id: string; name: string; email: string; role: string; title: string | null; isActive: boolean; mustChangePassword: boolean; createdAt: string }> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<{ employees: typeof staff }>('/api/team?pageSize=100').then(d => setStaff(d.employees)).catch(e => setError(e.message))
  }, [])

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setBusy(true)
    try {
      const res = await api<{ temporaryPassword: string }>('/api/team', { method: 'POST', body: {
        name: String(fd.get('name')), email: String(fd.get('email')), role: String(fd.get('role')),
        title: String(fd.get('title')) || undefined,
      } })
      setBusy(false)
      toast({ title: 'Team member created', description: `Temporary password: ${res.temporaryPassword} (copy it now — shown once)` })
      api<{ employees: typeof staff }>('/api/team?pageSize=100').then(d => setStaff(d.employees)).catch(() => {})
    } catch (err) {
      setBusy(false)
      toast({ title: 'Failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' })
    }
  }

  async function resetPassword(id: string) {
    setBusy(true)
    try {
      const res = await api<{ temporaryPassword: string }>(`/api/team/${id}/reset-password`, { method: 'POST', body: {} })
      setBusy(false)
      toast({ title: 'Password reset', description: `Temporary password: ${res.temporaryPassword} (copy it now — shown once)` })
    } catch (err) {
      setBusy(false)
      toast({ title: 'Failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' })
    }
  }

  if (error) return <Alert variant="destructive"><AlertTitle>Failed to load</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
  const isOwner = me?.role === 'OWNER'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Team</h1>
          <p className="text-muted-foreground text-sm">Staff accounts and role-based access.</p>
        </div>
        {isOwner && (
          <Dialog>
            <DialogTrigger asChild><Button><UserPlus className="h-4 w-4 mr-1" />Add team member</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add team member</DialogTitle>
                <DialogDescription>A random temporary password is generated — the member must change it at first sign-in.</DialogDescription></DialogHeader>
              <form onSubmit={onCreate} className="space-y-4">
                <div className="space-y-1.5"><Label htmlFor="t-name">Full name</Label><Input id="t-name" name="name" required maxLength={120} /></div>
                <div className="space-y-1.5"><Label htmlFor="t-email">Work email</Label><Input id="t-email" name="email" type="email" required /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Role</Label>
                    <Select name="role" defaultValue="VIDEO_EDITOR"><SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent></Select>
                  </div>
                  <div className="space-y-1.5"><Label htmlFor="t-title">Job title</Label><Input id="t-title" name="title" maxLength={120} /></div>
                </div>
                <DialogFooter><Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create account</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {!staff && <Skeleton className="h-64" />}
      {staff && (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead className="hidden sm:table-cell">Email</TableHead><TableHead className="hidden md:table-cell">Joined</TableHead>{isOwner && <TableHead></TableHead>}</TableRow></TableHeader>
              <TableBody>
                {staff.map(s => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <p className="font-medium">{s.name}</p>
                      {s.title && <p className="text-xs text-muted-foreground">{s.title}</p>}
                    </TableCell>
                    <TableCell><Badge variant="outline">{ROLE_LABELS[s.role] ?? s.role}</Badge>{s.mustChangePassword && <Badge className="ml-1 bg-amber-100 text-amber-800" variant="outline">temp password</Badge>}</TableCell>
                    <TableCell className="hidden sm:table-cell">{s.email}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">{fmtDate(s.createdAt)}</TableCell>
                    {isOwner && (
                      <TableCell>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => resetPassword(s.id)}><KeyRound className="h-3.5 w-3.5 mr-1" />Reset</Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
