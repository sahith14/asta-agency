'use client'

import { useEffect, useState, FormEvent } from 'react'
import { api, fmtDate, ROLE_LABELS } from '@/lib/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useToast } from '@/hooks/use-toast'
import { Settings, Check, X, Copy, Loader2 } from 'lucide-react'

interface SignupRequest { id: string; name: string; email: string; company: string | null; message: string | null; status: string; createdAt: string }

export default function SettingsPage() {
  const { toast } = useToast()
  const [settings, setSettings] = useState<Record<string, string> | null>(null)
  const [requests, setRequests] = useState<SignupRequest[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => {
    api<{ settings: Record<string, string> }>('/api/settings').then(d => setSettings(d.settings)).catch(e => setError(e.message))
    api<{ requests: SignupRequest[] }>('/api/signup-requests').then(d => setRequests(d.requests)).catch(() => {})
  }
  useEffect(() => { load() }, [])

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setBusy(true)
    try {
      await api('/api/settings', { method: 'PUT', body: {
        agencyName: String(fd.get('agencyName')) || undefined,
        supportEmail: String(fd.get('supportEmail')) || undefined,
        internalQcChecklist: String(fd.get('qc')) || undefined,
      } })
      setBusy(false); load()
      toast({ title: 'Settings saved' })
    } catch (err) {
      setBusy(false)
      toast({ title: 'Failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' })
    }
  }

  async function decide(req: SignupRequest, decision: 'APPROVED' | 'REJECTED', accountType?: 'CLIENT_PORTAL' | 'STAFF', staffRole?: string) {
    setBusy(true)
    try {
      const res = await api<{ temporaryPassword?: string; accountType?: string }>(`/api/signup-requests/${req.id}`, { method: 'PATCH', body: { decision, accountType, staffRole } })
      setBusy(false); load()
      if (res.temporaryPassword) toast({ title: 'Account created', description: `Temporary password: ${res.temporaryPassword} (copy it now — shown once)` })
      else toast({ title: 'Request rejected' })
    } catch (err) {
      setBusy(false)
      toast({ title: 'Failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' })
    }
  }

  if (error) return <Alert variant="destructive"><AlertTitle>Failed to load</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Settings className="h-6 w-6 text-primary" /> Settings</h1>
        <p className="text-muted-foreground text-sm">Founder-only configuration. Security-sensitive settings are not exposed here by design.</p>
      </div>

      <Tabs defaultValue="general">
        <TabsList><TabsTrigger value="general">General</TabsTrigger><TabsTrigger value="access">Access requests</TabsTrigger></TabsList>

        <TabsContent value="general" className="mt-4">
          {!settings ? <Skeleton className="h-64" /> : (
            <Card>
              <CardHeader><CardTitle className="text-base">Agency settings</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={onSave} className="space-y-4 max-w-xl">
                  <div className="space-y-1.5"><Label htmlFor="s-name">Agency name</Label><Input id="s-name" name="agencyName" defaultValue={settings.agencyName ?? ''} maxLength={120} /></div>
                  <div className="space-y-1.5"><Label htmlFor="s-email">Support email</Label><Input id="s-email" name="supportEmail" type="email" defaultValue={settings.supportEmail ?? ''} /></div>
                  <div className="space-y-1.5"><Label htmlFor="s-qc">Internal QC checklist (one item per line)</Label>
                    <Textarea id="s-qc" name="qc" rows={6} defaultValue={settings.internalQcChecklist ?? ''} /></div>
                  <Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save settings</Button>
                </form>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="access" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Signup / access requests</CardTitle>
              <CardDescription>Corporate-grade onboarding: approve to provision a portal or staff account with a one-time temporary password.</CardDescription></CardHeader>
            <CardContent>
              {!requests ? <Skeleton className="h-40" /> : requests.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No access requests yet.</p>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Business</TableHead><TableHead className="hidden md:table-cell">Message</TableHead><TableHead>Received</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
                  <TableBody>
                    {requests.map(r => (
                      <TableRow key={r.id}>
                        <TableCell><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{r.email}</p></TableCell>
                        <TableCell>{r.company ?? '—'}</TableCell>
                        <TableCell className="hidden md:table-cell max-w-48"><p className="text-xs truncate">{r.message ?? '—'}</p></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtDate(r.createdAt)}</TableCell>
                        <TableCell><Badge variant="outline" className={r.status === 'PENDING' ? 'bg-amber-50 text-amber-700 border-amber-200' : r.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-zinc-100 text-zinc-500'}>{r.status}</Badge></TableCell>
                        <TableCell>
                          {r.status === 'PENDING' && (
                            <div className="flex flex-wrap gap-1.5">
                              <Button size="sm" disabled={busy} onClick={() => decide(r, 'APPROVED', 'CLIENT_PORTAL')}>Portal</Button>
                              <Button size="sm" variant="outline" disabled={busy} onClick={() => decide(r, 'APPROVED', 'STAFF', 'CLIENT_MANAGER')}>Staff</Button>
                              <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={() => decide(r, 'REJECTED')}><X className="h-3.5 w-3.5" /></Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
