'use client'

import { useState, FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Clapperboard, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'same-origin',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Sign-in failed')
      if (data.user.userType === 'CLIENT_USER') router.push('/portal')
      else router.push('/app')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4">
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
                <Label htmlFor="password">Password</Label>
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
      </div>
    </div>
  )
}
