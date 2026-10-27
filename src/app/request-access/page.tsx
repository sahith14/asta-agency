'use client'

import { useState, FormEvent } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AuthBackdrop } from '@/components/auth/auth-backdrop'
import { CheckCircle2, Loader2, Clapperboard } from 'lucide-react'

export default function RequestAccessPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [category, setCategory] = useState('Other')
  const [message, setMessage] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setState('loading')
    try {
      const res = await fetch('/api/signup-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, company: company || undefined, message: message ? `[${category}] ${message}` : undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Request failed')
      setState('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
      setState('idle')
    }
  }

  return (
    <div className="site-scope relative flex min-h-screen flex-col overflow-hidden bg-background">
      <AuthBackdrop />
      <header className="relative z-10 border-b border-border/70 bg-background/90">
        <div className="mx-auto max-w-6xl flex h-16 items-center justify-between px-4 lg:px-6">
          <Link href="/" className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Clapperboard className="h-4 w-4" />
            </span>
            AgencyOS
          </Link>
          <Button variant="ghost" asChild><Link href="/login">Sign in</Link></Button>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 items-start justify-center px-4 py-10">
        <div className="w-full max-lg max-w-lg">
          <Card className="border-border shadow-[0_30px_80px_-40px_rgba(61,35,22,0.4)]">
            <CardHeader>
              <CardTitle>Request access</CardTitle>
              <CardDescription>
                Tell us about your business. A real account manager reviews every request and provisions
                your account — you&apos;ll receive your sign-in details directly.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {state === 'done' ? (
                <div className="text-center py-6" role="status">
                  <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 ring-1 ring-inset ring-primary/25">
                    <CheckCircle2 className="h-7 w-7 text-primary" aria-hidden="true" />
                  </span>
                  <h3 className="text-lg font-semibold">Request received</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Thank you. Your request has been received and our team will be in touch.
                  </p>
                  <Button variant="outline" className="mt-5" asChild><Link href="/">Back to home</Link></Button>
                </div>
              ) : (
                <form onSubmit={onSubmit} className="space-y-4">
                  {error && (
                    <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Your name</Label>
                    <Input id="name" required maxLength={120} value={name} onChange={e => setName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Work email</Label>
                    <Input id="email" type="email" required maxLength={200} value={email} onChange={e => setEmail(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="company">Business name</Label>
                    <Input id="company" maxLength={160} value={company} onChange={e => setCompany(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="category">Business category</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger id="category" aria-label="Business category"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['Restaurant', 'Cafe / Coffee Shop', 'Food and Beverage', 'Real Estate / Property', 'Retail', 'Hospitality', 'Corporate', 'Events', 'Personal Brand', 'Automotive', 'Healthcare / Professional Services', 'Other'].map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="message">What do you need?</Label>
                    <Textarea id="message" rows={4} maxLength={4000} value={message} onChange={e => setMessage(e.target.value)} placeholder="e.g. Monthly social reels for our restaurant + a new website" />
                  </div>
                  <Button type="submit" className="w-full" disabled={state === 'loading'}>
                    {state === 'loading' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Submit request
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
          <p className="mt-4 text-center text-sm">
            <Link href="/" className="text-muted-foreground hover:text-foreground underline underline-offset-4">← Back to home</Link>
          </p>
        </div>
      </main>
    </div>
  )
}
