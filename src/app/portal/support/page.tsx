'use client'

import { useEffect, useState, FormEvent } from 'react'
import { api, fmtDateTime } from '@/lib/client'
import { StatusBadge } from '@/components/status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useToast } from '@/hooks/use-toast'
import { LifeBuoy, Plus, Loader2, Send } from 'lucide-react'

interface Reply { id: string; authorName: string; body: string; createdAt: string }
interface Ticket { id: string; reference: string; subject: string; body: string; status: string; priority: string; createdAt: string; updatedAt: string; project: { name: string; reference: string } | null; replies: Reply[] }

export default function PortalSupportPage() {
  const { toast } = useToast()
  const [tickets, setTickets] = useState<Ticket[] | null>(null)
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [replyFor, setReplyFor] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')

  const load = () => api<{ tickets: Ticket[] }>('/api/portal/tickets').then(d => setTickets(d.tickets)).catch(e => setError(e.message))
  useEffect(() => {
    load()
    api<{ projects: Array<{ id: string; name: string }> }>('/api/portal/projects').then(d => setProjects(d.projects)).catch(() => {})
  }, [])

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setBusy(true)
    try {
      await api('/api/portal/tickets', { method: 'POST', body: {
        subject: String(fd.get('subject')), body: String(fd.get('body')),
        projectId: String(fd.get('projectId')) !== 'none' ? String(fd.get('projectId')) : undefined,
        priority: String(fd.get('priority')),
      } })
      setBusy(false); load()
      toast({ title: 'Support request submitted', description: 'Our team has been notified.' })
    } catch (err) {
      setBusy(false)
      toast({ title: 'Failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' })
    }
  }

  async function sendReply() {
    if (!replyFor || !replyBody.trim()) return
    setBusy(true)
    try {
      await api('/api/portal/tickets', { method: 'PUT', body: { ticketId: replyFor, body: replyBody.trim() } })
      setReplyFor(null); setReplyBody(''); setBusy(false); load()
    } catch (err) {
      setBusy(false)
      toast({ title: 'Failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' })
    }
  }

  if (error) return <Alert variant="destructive"><AlertTitle>Failed to load</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><LifeBuoy className="h-6 w-6 text-primary" /> Support</h1>
          <p className="text-muted-foreground text-sm">Raise a request or continue an existing conversation.</p>
        </div>
        <Dialog>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />New request</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New support request</DialogTitle></DialogHeader>
            <form onSubmit={onCreate} className="space-y-4">
              <div className="space-y-1.5"><Label htmlFor="tk-subject">Subject</Label><Input id="tk-subject" name="subject" required maxLength={200} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Related project</Label>
                  <Select name="projectId" defaultValue="none"><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="none">—</SelectItem>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>
                </div>
                <div className="space-y-1.5"><Label>Priority</Label>
                  <Select name="priority" defaultValue="MEDIUM"><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select>
                </div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="tk-body">Describe the issue</Label><Textarea id="tk-body" name="body" rows={4} required maxLength={8000} /></div>
              <DialogFooter><Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Submit request</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {!tickets && <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>}
      {tickets && (
        tickets.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground"><LifeBuoy className="h-10 w-10 mx-auto mb-3 opacity-30" /><p className="font-medium">No support requests</p><p className="text-sm mt-1">We&apos;re here when you need us.</p></CardContent></Card>
        ) : (
          <div className="space-y-4">
            {tickets.map(t => (
              <Card key={t.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{t.subject}</CardTitle>
                      <p className="text-xs text-muted-foreground">{t.reference} · raised {fmtDateTime(t.createdAt)}{t.project ? ` · ${t.project.name}` : ''}</p>
                    </div>
                    <StatusBadge status={t.status} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm whitespace-pre-wrap">{t.body}</p>
                  {t.replies.map(r => (
                    <div key={r.id} className={`rounded-lg px-3 py-2 text-sm ${r.authorName === 'You' ? 'bg-primary/5' : 'bg-muted'}`}>
                      <p className="text-xs font-semibold mb-0.5">{r.authorName} · {fmtDateTime(r.createdAt)}</p>
                      {r.body}
                    </div>
                  ))}
                  {t.status !== 'CLOSED' && (
                    <div className="pt-2 space-y-2">
                      {replyFor === t.id ? (
                        <>
                          <Textarea value={replyBody} onChange={e => setReplyBody(e.target.value)} rows={2} placeholder="Write your reply…" maxLength={4000} aria-label="Reply" />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={sendReply} disabled={busy || !replyBody.trim()}><Send className="h-3.5 w-3.5 mr-1.5" />Send reply</Button>
                            <Button size="sm" variant="ghost" onClick={() => { setReplyFor(null); setReplyBody('') }}>Cancel</Button>
                          </div>
                        </>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setReplyFor(t.id)}>Reply</Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  )
}
