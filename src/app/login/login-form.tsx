'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Lock, Info } from 'lucide-react'

export function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Sign in failed')
        return
      }
      if (data.user.mustChangePassword) {
        router.push('/change-password')
        return
      }
      const from = params.get('from')
      const dest = data.user.role === 'CLIENT' ? '/portal' : '/app'
      const safeFrom = from && from.startsWith('/') && !from.startsWith('//') ? from : dest
      router.push(safeFrom)
      router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md space-y-4">
      <div className="text-center space-y-2">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Lock className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">AgencyOS</h1>
        <p className="text-sm text-muted-foreground">Agency operations &amp; client portal sign-in</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Use the credentials issued to you by the agency.</CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.co.uk"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3 pt-2">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign in
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Forgot your password?{' '}
              <a className="underline underline-offset-2" href="/forgot-password">
                Request a reset
              </a>
            </p>
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">New here?</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <Button asChild variant="outline" className="min-h-[44px] w-full">
              <a href="/signup">Request access</a>
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Demo environment — seeded logins are documented in <code>docs/PHASE6-REPORT.md</code>. Staff and client
          accounts are provisioned by the Founder. First sign-in requires setting a new password.
        </AlertDescription>
      </Alert>
    </div>
  )
}
