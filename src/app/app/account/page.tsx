'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { api, setStoredToken } from '@/lib/client'
import { useMe } from '@/components/app-shell'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { KeyRound, Loader2 } from 'lucide-react'

export default function AccountPage() {
  const { me } = useMe()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setError(null); setBusy(true)
    try {
      await api('/api/auth/password', { method: 'POST', body: { currentPassword: String(fd.get('current')), newPassword: String(fd.get('next')) } })
      setDone(true)
      // all sessions revoked — back to login
      setStoredToken(null)
      setTimeout(() => { router.push('/login') }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password')
      setBusy(false)
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><KeyRound className="h-6 w-6 text-primary" /> Account</h1>
        <p className="text-muted-foreground text-sm">{me?.name} · {me?.email} · {me?.role.replaceAll('_', ' ')}</p>
      </div>

      {me?.mustChangePassword && (
        <Alert><AlertTitle>Temporary password in use</AlertTitle><AlertDescription>Please set a new password now.</AlertDescription></Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change password</CardTitle>
          <CardDescription>Changing your password revokes all other sessions for security.</CardDescription>
        </CardHeader>
        <CardContent>
          {done ? (
            <Alert><AlertDescription>Password changed. All sessions were revoked — redirecting you to sign in again…</AlertDescription></Alert>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
              <div className="space-y-1.5"><Label htmlFor="cur">Current password</Label><Input id="cur" name="current" type="password" required autoComplete="current-password" /></div>
              <div className="space-y-1.5"><Label htmlFor="next">New password (min 10 characters)</Label><Input id="next" name="next" type="password" required minLength={10} autoComplete="new-password" /></div>
              <Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Update password</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
