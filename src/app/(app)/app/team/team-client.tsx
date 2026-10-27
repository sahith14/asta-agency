'use client'

import { useCallback, useEffect, useState } from 'react'
import { KeyRound, Plus, ShieldAlert, UserRoundCog } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { AdminEmptyState, AdminSpinner, AdminStatusBadge, adminFetch } from '@/components/internal/admin-bits'
import { formatDate } from '@/lib/format'
import { ROLES, ROLE_LABELS, ALL_ROLES, type Role } from '@/lib/constants'

type TeamUser = {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
  clientId: string | null
  client: { id: string; name: string } | null
  mustChangePassword: boolean
  createdAt: string
}

const ROLE_OPTIONS: Role[] = ALL_ROLES

export function TeamClient({ viewerId }: { viewerId: string }) {
  const { toast } = useToast()
  const [users, setUsers] = useState<TeamUser[] | null>(null)

  // create user
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<string>(ROLES.CLIENT_MANAGER)
  const [clientId, setClientId] = useState('')
  const [tempPassword, setTempPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // one-time password reveal
  const [oneTime, setOneTime] = useState<{ email: string; password: string } | null>(null)
  const [copied, setCopied] = useState(false)

  // clients for the CLIENT role select
  const [clients, setClients] = useState<{ id: string; name: string }[]>([])

  const load = useCallback(async () => {
    setUsers(null)
    try {
      const [team, clientData] = await Promise.all([
        adminFetch<{ users: TeamUser[] }>('/api/team'),
        adminFetch<{ clients: { id: string; name: string }[] }>('/api/tickets/meta'),
      ])
      setUsers(team.users)
      setClients(clientData.clients)
    } catch (err) {
      toast({ title: 'Could not load team', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
      setUsers([])
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  async function createUser() {
    if (!name.trim() || !email.trim()) {
      toast({ title: 'Name and email are required', variant: 'destructive' })
      return
    }
    if (role === ROLES.CLIENT && !clientId) {
      toast({ title: 'CLIENT accounts need a client business', description: 'Select which client business this portal user belongs to.', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    try {
      const data = await adminFetch<{ user: TeamUser; generatedPassword: string | null }>('/api/team', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          role,
          clientId: role === ROLES.CLIENT ? clientId : null,
          tempPassword: tempPassword.trim() ? tempPassword.trim() : undefined,
        }),
      })
      toast({ title: `${data.user.name} created`, description: 'They must change their password at first sign-in.' })
      setCreateOpen(false)
      setName('')
      setEmail('')
      setRole(ROLES.CLIENT_MANAGER)
      setClientId('')
      setTempPassword('')
      if (data.generatedPassword) {
        setCopied(false)
        setOneTime({ email: data.user.email, password: data.generatedPassword })
      } else {
        toast({ title: 'Reminder', description: 'Deliver the password you set to the user out-of-band (email is not connected).' })
      }
      await load()
    } catch (err) {
      toast({ title: 'Could not create user', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  async function changeRole(user: TeamUser, nextRole: string) {
    try {
      await adminFetch(`/api/team/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: nextRole }),
      })
      toast({ title: 'Role updated', description: `${user.name} is now ${ROLE_LABELS[nextRole as Role] ?? nextRole}.` })
      await load()
    } catch (err) {
      toast({ title: 'Could not change role', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    }
  }

  async function setActive(user: TeamUser, isActive: boolean) {
    try {
      await adminFetch(`/api/team/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      })
      toast({
        title: isActive ? `${user.name} reactivated` : `${user.name} deactivated`,
        description: isActive ? undefined : 'All their sessions were revoked immediately.',
      })
      await load()
    } catch (err) {
      toast({ title: 'Could not update user', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    }
  }

  async function resetPassword(user: TeamUser, temp?: string) {
    try {
      const data = await adminFetch<{ generatedPassword: string | null }>(`/api/team/${user.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify(temp && temp.trim() ? { tempPassword: temp.trim() } : {}),
      })
      toast({ title: `Password reset for ${user.name}`, description: 'All their sessions were signed out.' })
      if (data.generatedPassword) {
        setCopied(false)
        setOneTime({ email: user.email, password: data.generatedPassword })
      } else {
        toast({ title: 'Reminder', description: 'Deliver the password you set to the user out-of-band.' })
      }
    } catch (err) {
      toast({ title: 'Could not reset password', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Team &amp; users</h1>
          <p className="text-sm text-muted-foreground">Founder-only management of staff and client portal accounts.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="h-11"><Plus className="h-4 w-4" /> New user</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create a user</DialogTitle>
              <DialogDescription>
                If you don&apos;t set a password, a strong one is generated and shown to you once after creation.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="team-name">Full name</Label>
                <Input id="team-name" value={name} onChange={(e) => setName(e.target.value)} className="h-11" maxLength={120} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="team-email">Email</Label>
                <Input id="team-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" maxLength={180} />
              </div>
              <div className="grid gap-2">
                <Label>Role</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger className="h-11 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {role === ROLES.CLIENT ? (
                <div className="grid gap-2">
                  <Label htmlFor="team-client">Client business (required for CLIENT)</Label>
                  <Select value={clientId} onValueChange={setClientId}>
                    <SelectTrigger id="team-client" className="h-11 w-full">
                      <SelectValue placeholder="Select a client business" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="grid gap-2">
                <Label htmlFor="team-temp">Temporary password (optional)</Label>
                <Input id="team-temp" value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} className="h-11" placeholder="Leave empty to auto-generate" maxLength={200} />
                <p className="text-xs text-muted-foreground">If set, it must be at least 10 characters. The user must change it at first sign-in.</p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => void createUser()} disabled={submitting} className="h-11 w-full sm:w-auto">
                {submitting ? 'Creating…' : 'Create user'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Alert>
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Credential handling</AlertTitle>
        <AlertDescription>
          Email is not connected in this deployment. Generated passwords are shown <strong>once</strong> in this
          interface — deliver them to the user through your usual secure channel. Passwords are never written to
          the audit log. Resetting a password signs the user out of every session immediately.
        </AlertDescription>
      </Alert>

      {users === null ? (
        <AdminSpinner label="Loading users…" />
      ) : users.length === 0 ? (
        <AdminEmptyState title="No users found" />
      ) : (
        <>
          <div className="hidden max-h-96 overflow-y-auto rounded-lg border md:block">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableCaption className="sr-only">Team members and client users</TableCaption>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.name}
                      {u.mustChangePassword ? (
                        <Badge variant="secondary" className="ml-2 text-[10px]">pw change pending</Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={u.role === ROLES.FOUNDER ? 'default' : 'secondary'}>
                        {ROLE_LABELS[u.role as Role] ?? u.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {u.role === ROLES.CLIENT && u.client ? (
                        <span>{u.client.name}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {u.isActive ? <AdminStatusBadge status="ACTIVE" /> : <AdminStatusBadge status="CANCELLED" />}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(u.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <RoleDialog user={u} self={u.id === viewerId} onSave={(r) => void changeRole(u, r)} />
                        <ResetPasswordDialog user={u} onConfirm={(temp) => void resetPassword(u, temp)} />
                        {u.role !== ROLES.FOUNDER && u.id !== viewerId ? (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="outline" className="h-11 px-3 text-xs">
                                {u.isActive ? 'Deactivate' : 'Reactivate'}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  {u.isActive ? `Deactivate ${u.name}?` : `Reactivate ${u.name}?`}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  {u.isActive
                                    ? 'They will be signed out everywhere and will no longer be able to sign in.'
                                    : 'They will be able to sign in again.'}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => void setActive(u, !u.isActive)}>
                                  {u.isActive ? 'Deactivate' : 'Reactivate'}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-3 md:hidden">
            {users.map((u) => (
              <Card key={u.id}>
                <CardContent className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{u.name}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                    {u.isActive ? <AdminStatusBadge status="ACTIVE" /> : <AdminStatusBadge status="CANCELLED" />}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {ROLE_LABELS[u.role as Role]}
                    {u.client ? ` · ${u.client.name}` : ''}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <RoleDialog user={u} self={u.id === viewerId} onSave={(r) => void changeRole(u, r)} />
                    <ResetPasswordDialog user={u} onConfirm={(temp) => void resetPassword(u, temp)} />
                    {u.role !== ROLES.FOUNDER && u.id !== viewerId ? (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="outline" className="h-11 px-3 text-xs">
                            {u.isActive ? 'Deactivate' : 'Reactivate'}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{u.isActive ? `Deactivate ${u.name}?` : `Reactivate ${u.name}?`}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {u.isActive
                                ? 'They will be signed out everywhere and will no longer be able to sign in.'
                                : 'They will be able to sign in again.'}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => void setActive(u, !u.isActive)}>
                              {u.isActive ? 'Deactivate' : 'Reactivate'}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* One-time password dialog */}
      <Dialog open={oneTime !== null} onOpenChange={(open) => !open && setOneTime(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>One-time password</DialogTitle>
            <DialogDescription>
              The password for <span className="font-medium">{oneTime?.email}</span>. Store it now — it is not shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/40 p-3">
            <p className="break-all font-mono text-sm font-semibold">{oneTime?.password}</p>
          </div>
          <DialogFooter className="items-center gap-2">
            <Button
              variant="outline"
              className="h-11"
              onClick={async () => {
                if (oneTime) await navigator.clipboard.writeText(oneTime.password)
                setCopied(true)
              }}
            >
              <KeyRound className="h-4 w-4" /> {copied ? 'Copied' : 'Copy password'}
            </Button>
          </DialogFooter>
          <p className="text-xs text-muted-foreground">
            Deliver these credentials out-of-band (email is not connected). The user must change this password at
            first sign-in.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function RoleDialog({
  user,
  self,
  onSave,
}: {
  user: TeamUser
  self: boolean
  onSave: (role: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [nextRole, setNextRole] = useState(user.role)
  const locked = user.role === ROLES.FOUNDER

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setNextRole(user.role) }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-11 px-3 text-xs">
          <UserRoundCog className="h-3.5 w-3.5" /> Role
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Change role — {user.name}</DialogTitle>
          <DialogDescription>
            {locked
              ? 'The founder account role cannot be changed.'
              : self
                ? 'You cannot change your own role (self-demotion is blocked).'
                : 'Role changes are audited.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 py-2">
          <Label>Role</Label>
          <Select value={nextRole} onValueChange={setNextRole} disabled={locked || self}>
            <SelectTrigger className="h-11 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((r) => (
                <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              setOpen(false)
              if (nextRole !== user.role) onSave(nextRole)
            }}
            disabled={locked || self || nextRole === user.role}
            className="h-11 w-full sm:w-auto"
          >
            Save role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ResetPasswordDialog({
  user,
  onConfirm,
}: {
  user: TeamUser
  onConfirm: (temp?: string) => void
}) {
  const [temp, setTemp] = useState('')
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-11 px-3 text-xs">
          <KeyRound className="h-3.5 w-3.5" /> Reset pw
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset password for {user.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            A new temporary password will be generated and shown to you once. All of their sessions are signed out
            immediately and they must change the password at next sign-in. You can also set the temporary password
            yourself below.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-2 py-1">
          <Label htmlFor={`temp-${user.id}`}>Temporary password (optional, min 10 chars)</Label>
          <Input id={`temp-${user.id}`} value={temp} onChange={(e) => setTemp(e.target.value)} maxLength={200} placeholder="Leave empty to auto-generate" />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => onConfirm(temp)}>{temp.trim() ? 'Set password' : 'Generate & reset'}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
