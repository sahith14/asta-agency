'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Copy, Loader2, UserPlus, XCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
} from '@/components/ui/alert-dialog'
import { toast } from '@/hooks/use-toast'
import { AdminEmptyState } from '@/components/internal/admin-bits'
import { formatDateTime, humanizeStatus } from '@/lib/format'

type RequestRow = {
  id: string
  name: string
  email: string
  company: string
  message: string | null
  status: string
  reviewNotes: string | null
  reviewedAt: string | null
  createdAt: string
  createdClientId: string | null
  createdUserId: string | null
  reviewedByName: string | null
}

type ClientOption = { id: string; name: string }

export function SignupRequestsClient({ requests, clients }: { requests: RequestRow[]; clients: ClientOption[] }) {
  const router = useRouter()
  const [approving, setApproving] = useState<RequestRow | null>(null)
  const [rejecting, setRejecting] = useState<RequestRow | null>(null)
  const [issued, setIssued] = useState<{ name: string; email: string; password: string } | null>(null)

  const pending = requests.filter((r) => r.status === 'PENDING')
  const reviewed = requests.filter((r) => r.status !== 'PENDING')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">Access requests</h1>
        <p className="text-sm text-muted-foreground">
          Public sign-up requests from prospective clients. Approving issues a portal account with a one-time temporary
          password — you hand it over securely, and the client sets their own password at first sign-in.
        </p>
      </div>

      {requests.length === 0 ? (
        <AdminEmptyState
          title="No requests"
          description="Requests from the public sign-up form (/signup) will appear here for review."
        />
      ) : (
        <>
          {pending.length > 0 ? (
            <section aria-label="Pending requests" className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Pending ({pending.length})</h2>
              {pending.map((r) => (
                <Card key={r.id}>
                  <CardContent className="space-y-2 pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold leading-snug">
                          {r.name} · {r.company}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">
                          {r.email} · requested {formatDateTime(r.createdAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button size="sm" className="min-h-[44px]" onClick={() => setApproving(r)}>
                          <UserPlus className="h-4 w-4" /> Approve…
                        </Button>
                        <Button size="sm" variant="outline" className="min-h-[44px] text-destructive" onClick={() => setRejecting(r)}>
                          <XCircle className="h-4 w-4" /> Reject
                        </Button>
                      </div>
                    </div>
                    {r.message ? <p className="rounded-md bg-muted/60 p-2 text-sm text-muted-foreground">“{r.message}”</p> : null}
                  </CardContent>
                </Card>
              ))}
            </section>
          ) : null}

          {reviewed.length > 0 ? (
            <section aria-label="Reviewed requests" className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Reviewed</h2>
              {reviewed.map((r) => (
                <Card key={r.id}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {r.name} · {r.company} · {r.email}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {humanizeStatus(r.status)} by {r.reviewedByName ?? '—'}{r.reviewedAt ? ` · ${formatDateTime(r.reviewedAt)}` : ''}
                        {r.reviewNotes ? ` · “${r.reviewNotes}”` : ''}
                      </p>
                    </div>
                    <Badge variant={r.status === 'APPROVED' ? 'default' : 'destructive'}>{humanizeStatus(r.status)}</Badge>
                  </CardContent>
                </Card>
              ))}
            </section>
          ) : null}
        </>
      )}

      {approving ? (
        <ApproveDialog
          request={approving}
          clients={clients}
          onClose={() => setApproving(null)}
          onApproved={(name, email, password) => {
            setApproving(null)
            setIssued({ name, email, password })
            router.refresh()
          }}
        />
      ) : null}

      <AlertDialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject access request?</AlertDialogTitle>
            <AlertDialogDescription>
              {rejecting?.name} ({rejecting?.company}) will not receive an account. They are not notified (email is not
              connected) — contact them directly if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-[44px] bg-destructive text-white hover:bg-destructive/90"
              onClick={async (e) => {
                e.preventDefault()
                const r = rejecting
                setRejecting(null)
                if (!r) return
                const res = await fetch(`/api/signup-requests/${r.id}/reject`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({}),
                })
                if (res.ok) {
                  toast({ title: 'Request rejected' })
                  router.refresh()
                } else {
                  const data = await res.json().catch(() => ({}))
                  toast({ title: 'Could not reject', description: data.error, variant: 'destructive' })
                }
              }}
            >
              Reject request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {issued ? (
        <Dialog open onOpenChange={(o) => !o && setIssued(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" /> Account created
              </DialogTitle>
              <DialogDescription>
                {issued.name} ({issued.email}) now has a portal account. Share the temporary password securely — it is
                shown <strong>only once</strong> and must be changed at first sign-in.
              </DialogDescription>
            </DialogHeader>
            <Alert>
              <AlertDescription>
                <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Temporary password</p>
                <div className="flex items-center gap-2">
                  <code className="select-all rounded bg-muted px-2 py-1 text-sm font-semibold">{issued.password}</code>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(issued.password)
                        toast({ title: 'Copied to clipboard' })
                      } catch {
                        toast({ title: 'Copy failed — select the text manually', variant: 'destructive' })
                      }
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
            <DialogFooter>
              <Button className="min-h-[44px] w-full" onClick={() => setIssued(null)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  )
}

function ApproveDialog({
  request,
  clients,
  onClose,
  onApproved,
}: {
  request: RequestRow
  clients: ClientOption[]
  onClose: () => void
  onApproved: (name: string, email: string, password: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [linkMode, setLinkMode] = useState<'NEW' | string>('NEW')
  const [clientName, setClientName] = useState(request.company)
  const [userName, setUserName] = useState(request.name)

  async function approve() {
    setBusy(true)
    try {
      const res = await fetch(`/api/signup-requests/${request.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: linkMode === 'NEW' ? undefined : linkMode,
          clientName: linkMode === 'NEW' ? clientName : undefined,
          userName,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'Could not approve', description: data.error ?? 'Something went wrong', variant: 'destructive' })
        return
      }
      toast({ title: 'Access approved', description: `${data.user.name} can now sign in to the portal.` })
      onApproved(data.user.name, data.user.email, data.generatedPassword)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Approve — {request.name}</DialogTitle>
          <DialogDescription>
            Link this portal account to an existing client business, or create a new one from the request.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-1.5">
            <Label>Client business</Label>
            <Select value={linkMode} onValueChange={setLinkMode}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NEW">Create new client: {request.company}</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    Link to {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {linkMode === 'NEW' ? (
            <div className="grid gap-1.5">
              <Label htmlFor="ap-client">New client name</Label>
              <Input id="ap-client" value={clientName} onChange={(e) => setClientName(e.target.value)} maxLength={160} className="h-11" />
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="ap-user">Account holder name</Label>
            <Input id="ap-user" value={userName} onChange={(e) => setUserName(e.target.value)} maxLength={120} className="h-11" />
          </div>
          <p className="text-xs text-muted-foreground">
            Email: <strong>{request.email}</strong> · a temporary password is generated and shown once after approval.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="min-h-[44px]">
            Cancel
          </Button>
          <Button onClick={() => void approve()} disabled={busy} className="min-h-[44px]">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Approve &amp; create account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
