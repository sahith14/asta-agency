'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ArrowLeft, CheckCircle2, Loader2, Briefcase } from 'lucide-react'

/**
 * Public "Request access" form (corporate sign-up). Requests go to the
 * agency's review queue — the Founder provisions accounts, so nothing here
 * creates credentials or grants access directly.
 */
export function SignupForm() {
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/public/signup-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.get('name'),
          email: form.get('email'),
          company: form.get('company'),
          message: form.get('message') || null,
          // Honeypot — real users leave this untouched.
          website: form.get('website') || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Could not send your request — please check the form and try again.')
        return
      }
      setDone(true)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-center space-y-2">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Briefcase className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">AgencyOS</h1>
        <p className="text-sm text-muted-foreground">Work with us — request your client portal account</p>
      </div>

      <Card>
        {done ? (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" /> Request received
              </CardTitle>
              <CardDescription>
                Thank you — our team reviews new requests within one business day. If approved, you&apos;ll receive
                your sign-in details from your account manager.
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Button asChild variant="outline" className="min-h-[44px] w-full">
                <Link href="/login">
                  <ArrowLeft className="h-4 w-4" /> Back to sign in
                </Link>
              </Button>
            </CardFooter>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Request access</CardTitle>
              <CardDescription>
                Tell us a little about your business. We review every request personally — accounts are issued by our
                team, not automatically.
              </CardDescription>
            </CardHeader>
            <form onSubmit={onSubmit}>
              <CardContent className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="su-name">Your name *</Label>
                    <Input id="su-name" name="name" required maxLength={120} autoComplete="name" className="h-11" placeholder="Jane Smith" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="su-company">Business name *</Label>
                    <Input id="su-company" name="company" required maxLength={160} autoComplete="organization" className="h-11" placeholder="Smith &amp; Co Ltd" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-email">Work email *</Label>
                  <Input id="su-email" name="email" type="email" required maxLength={200} autoComplete="email" className="h-11" placeholder="jane@smithandco.co.uk" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-message">What do you need help with? (optional)</Label>
                  <Textarea id="su-message" name="message" rows={3} maxLength={2000} className="min-h-[44px]" placeholder="A new website, online booking, ongoing maintenance…" />
                </div>
                {/* Honeypot — hidden from humans */}
                <div className="hidden" aria-hidden="true">
                  <Label htmlFor="su-website">Website</Label>
                  <Input id="su-website" name="website" tabIndex={-1} autoComplete="off" />
                </div>
              </CardContent>
              <CardFooter className="flex-col gap-3 pt-2">
                <Button type="submit" className="min-h-[44px] w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send request
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Already have an account?{' '}
                  <Link className="underline underline-offset-2" href="/login">
                    Sign in
                  </Link>
                </p>
              </CardFooter>
            </form>
          </>
        )}
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        We only use these details to review your request — see our support team for our privacy notice.
      </p>
    </div>
  )
}
