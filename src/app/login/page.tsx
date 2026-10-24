'use client'

import { useState, useEffect, FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { setStoredToken } from '@/lib/client'
import { Clapperboard, FlaskConical, Loader2 } from 'lucide-react'

interface TestAccount {
  email: string
  password: string
  name: string
  role: string
  userType: 'EMPLOYEE' | 'CLIENT_USER'
  clientName: string | null
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Owner',
  CLIENT_MANAGER: 'Client Manager',
  WEB_DEVELOPER: 'Web Developer',
  SUPPORT_FINANCE: 'Support & Finance',
  VIDEOGRAPHER: 'Videographer',
  VIDEO_EDITOR: 'Video Editor',
  CREATIVE_DIRECTOR: 'Creative Director',
  CLIENT: 'Client',
}

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [accounts, setAccounts] = useState<TestAccount[] | null | undefined>(undefined)
  const [activeEmail, setActiveEmail] = useState<string | null>(null)
  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotBusy, setForgotBusy] = useState(false)
  const [forgotDone, setForgotDone] = useState(false)
  const [forgotError, setForgotError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/test-accounts', { credentials: 'same-origin' })
      .then(async res => {
        if (!res.ok) return null
        const data = await res.json()
        return Array.isArray(data?.accounts) ? (data.accounts as TestAccount[]) : null
      })
      .then(list => {
        if (!cancelled) setAccounts(list)
      })
      .catch(() => {
        if (!cancelled) setAccounts(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function signIn(emailValue: string, passwordValue: string) {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailValue, password: passwordValue }),
        credentials: 'same-origin',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Sign-in failed')
      // Store Bearer fallback for embedded contexts where Lax cookies are withheld
      if (typeof data.sessionToken === 'string') setStoredToken(data.sessionToken)
      if (data.user.userType === 'CLIENT_USER') router.push('/portal')
      else router.push('/app')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
      setLoading(false)
      setActiveEmail(null)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    signIn(email, password)
  }

  function signInAs(account: TestAccount) {
    setEmail(account.email)
    setPassword(account.password)
    setActiveEmail(account.email)
    signIn(account.email, account.password)
  }

  async function submitForgot(e: FormEvent) {
    e.preventDefault()
    setForgotBusy(true); setForgotError(null)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }), credentials: 'same-origin',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Request failed')
      setForgotDone(true)
    } catch (err) {
      setForgotError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setForgotBusy(false)
    }
  }

  const staff = (accounts ?? []).filter(a => a.userType === 'EMPLOYEE')
  const clients = (accounts ?? []).filter(a => a.userType === 'CLIENT_USER')
  const showPanel = Array.isArray(accounts) && accounts.length > 0
  const isLoadingAccounts = accounts === undefined

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 font-bold text-lg mb-6">
          <span className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
            <Clapperboard className="h-4 w-4" />
          </span>
          AgencyOS
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Team and client portal access</CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-4" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <button type="button" onClick={() => { setForgotOpen(true); setForgotDone(false); setForgotError(null); setForgotEmail(email) }}
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
                    Forgot password?
                  </button>
                </div>
                <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Sign in
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              No account yet? <Link href="/request-access" className="text-primary underline underline-offset-4">Request access</Link>
            </p>
            <p className="mt-2 text-center text-sm">
              <Link href="/" className="text-muted-foreground hover:text-foreground underline underline-offset-4">← Back to home</Link>
            </p>
          </CardContent>
        </Card>

        <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Reset your password</DialogTitle>
              <DialogDescription>
                Email delivery is not configured in this environment. Your request is recorded securely and a one-time reset is completed by the Founder (account manager) — you&apos;ll receive the new temporary password from them directly.
              </DialogDescription>
            </DialogHeader>
            {forgotDone ? (
              <Alert>
                <AlertDescription>
                  Request recorded. If an account exists for <strong>{forgotEmail}</strong>, the Founder has been notified to complete the reset — ask them for your temporary password.
                </AlertDescription>
              </Alert>
            ) : (
              <form onSubmit={submitForgot} className="space-y-4">
                {forgotError && <Alert variant="destructive"><AlertDescription>{forgotError}</AlertDescription></Alert>}
                <div className="space-y-1.5">
                  <Label htmlFor="forgot-email">Work email</Label>
                  <Input id="forgot-email" type="email" required maxLength={200} value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} placeholder="you@company.com" />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setForgotOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={forgotBusy}>
                    {forgotBusy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Request reset
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>

        {isLoadingAccounts && (
          <Card className="mt-6" aria-label="Test accounts loading">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <FlaskConical className="h-4 w-4 text-muted-foreground" /> Test accounts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </CardContent>
          </Card>
        )}

        {showPanel && (
          <Card className="mt-6" aria-label="Test accounts">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FlaskConical className="h-4 w-4 text-muted-foreground" /> Test &amp; demo accounts
              </CardTitle>
              <CardDescription>
                All login details for reviewing the platform — one click signs you in. Hidden automatically when
                <code className="mx-1 rounded bg-muted px-1 py-0.5 text-[11px]">ENABLE_TEST_ACCOUNTS</code> is off.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {staff.length > 0 && (
                <section aria-label="Staff accounts">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Staff — internal workspace</p>
                  <div className="max-h-80 overflow-y-auto scrollbar-slim space-y-2 pr-1">
                    {staff.map(a => (
                      <div key={a.email} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="text-[11px]">{ROLE_LABELS[a.role] ?? a.role}</Badge>
                            <span className="text-sm font-medium truncate">{a.name}</span>
                          </div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">{a.email}</div>
                          <div className="mt-0.5 font-mono text-xs text-foreground/80 select-all">{a.password}</div>
                        </div>
                        <Button size="sm" variant="outline" className="shrink-0" disabled={loading} onClick={() => signInAs(a)}>
                          {activeEmail === a.email && loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign in'}
                        </Button>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {clients.length > 0 && (
                <section aria-label="Client portal accounts">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Client portal</p>
                  <div className="space-y-2">
                    {clients.map(a => (
                      <div key={a.email} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary" className="text-[11px]">{a.clientName ?? 'Client'}</Badge>
                            <span className="text-sm font-medium truncate">{a.name}</span>
                          </div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">{a.email}</div>
                          <div className="mt-0.5 font-mono text-xs text-foreground/80 select-all">{a.password}</div>
                        </div>
                        <Button size="sm" variant="outline" className="shrink-0" disabled={loading} onClick={() => signInAs(a)}>
                          {activeEmail === a.email && loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign in'}
                        </Button>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Credentials live only in gitignored files (<code className="rounded bg-muted px-1">.env</code>,{' '}
                <code className="rounded bg-muted px-1">.seed-credentials</code>) and are served by
                <code className="mx-1 rounded bg-muted px-1">/api/auth/test-accounts</code> while the demo flag is enabled.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
