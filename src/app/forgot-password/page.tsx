'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, KeyRound } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      setMessage(data.message ?? data.error ?? 'Request submitted')
    } catch {
      setMessage('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center bg-gradient-to-b from-[color:oklch(0.95_0.025_150)] to-background px-4 py-10">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <KeyRound className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Reset your password</h1>
        </div>
        <Card>
          <form onSubmit={onSubmit}>
            <CardContent className="space-y-4 pt-6">
              {message && (
                <Alert>
                  <AlertDescription>{message}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Account email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <p className="text-xs text-muted-foreground">
                Note: email delivery is not connected in this deployment, so reset links cannot be emailed. The Founder
                can reset your password from Team &amp; Users.
              </p>
            </CardContent>
            <CardFooter className="flex-col gap-3 pt-2">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Request reset
              </Button>
              <Link href="/login" className="text-sm underline underline-offset-2 text-muted-foreground">
                Back to sign in
              </Link>
            </CardFooter>
          </form>
        </Card>
      </div>
    </main>
  )
}
