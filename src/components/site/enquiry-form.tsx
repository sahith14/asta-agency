'use client'

import { useEffect, useRef, useState, FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, CheckCircle2, ShieldQuestion } from 'lucide-react'
import { site } from '@/lib/site-content'

type Status = 'idle' | 'submitting' | 'success' | 'error'

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)

export function EnquiryForm() {
  const mountedAt = useRef(0)
  const [status, setStatus] = useState<Status>('idle')
  const [reference, setReference] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [service, setService] = useState<string>('')
  const [contactMethod, setContactMethod] = useState<'EMAIL' | 'PHONE' | 'NO_PREFERENCE'>('NO_PREFERENCE')
  const [consent, setConsent] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '', companyName: '', message: '' })

  useEffect(() => {
    // Timestamp used server-side as a submit-speed spam trap (client clock only;
    // the server treats implausible values as spam, never as truth).
    mountedAt.current = Date.now()
  }, [])

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm(f => ({ ...f, [key]: value }))
    setFieldErrors(e => ({ ...e, [key]: '' }))
  }

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (form.name.trim().length < 2) errs.name = 'Please enter your name.'
    const hasEmail = form.email.trim().length > 0
    const hasPhone = form.phone.trim().length > 0
    if (!hasEmail && !hasPhone) errs.email = 'Enter an email address or a phone number.'
    if (hasEmail && !isEmail(form.email.trim())) errs.email = 'That email address does not look right.'
    if (hasPhone && form.phone.trim().length < 5) errs.phone = 'That phone number does not look right.'
    if (!service) errs.service = 'Choose the service you are interested in.'
    if (form.message.trim().length < 20) errs.message = 'Please describe your project in at least 20 characters.'
    if (form.message.length > 4000) errs.message = 'Please keep your description under 4,000 characters.'
    if (!consent) errs.consent = 'We need your consent before we can store your enquiry.'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrorMsg(null)
    if (!validate()) return
    setStatus('submitting')
    try {
      const honeypotEl = e.currentTarget.elements.namedItem('website') as HTMLInputElement | null
      const res = await fetch('/api/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          companyName: form.companyName.trim() || undefined,
          service,
          message: form.message.trim(),
          contactMethod,
          consent: true,
          website: honeypotEl?.value ?? '',
          formAgeMs: mountedAt.current ? Date.now() - mountedAt.current : 0,
        }),
        credentials: 'same-origin',
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 429) {
        setStatus('error')
        setErrorMsg(data.error ?? 'Too many enquiries from your connection. Please try again later.')
        return
      }
      if (!res.ok) {
        setStatus('error')
        setErrorMsg(data.error ?? 'Something went wrong while saving your enquiry. Please try again.')
        return
      }
      setReference(data.reference ?? null)
      setStatus('success')
    } catch {
      setStatus('error')
      setErrorMsg('Network error — please check your connection and try again.')
    }
  }

  if (status === 'success') {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 shadow-[0_30px_80px_-45px_rgba(61,35,22,0.45)]" role="status" aria-live="polite">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 ring-1 ring-inset ring-primary/25">
          <CheckCircle2 className="h-6 w-6 text-primary" aria-hidden="true" />
        </span>
        <h2 className="mt-5 text-xl font-bold">Thank you — your enquiry has been saved.</h2>
        {reference && (
          <p className="mt-2 text-sm text-muted-foreground">
            Your reference is <span className="font-mono font-semibold text-foreground">{reference}</span>. Keep it handy if you contact us about this enquiry.
          </p>
        )}
        <p className="mt-3 text-sm text-muted-foreground">{site.contact.successNote}</p>
        <Button
          variant="outline"
          className="mt-6"
          onClick={() => {
            setForm({ name: '', email: '', phone: '', companyName: '', message: '' })
            setService('')
            setContactMethod('NO_PREFERENCE')
            setConsent(false)
            setStatus('idle')
            setReference(null)
            mountedAt.current = Date.now()
          }}
        >
          Submit another enquiry
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="rounded-2xl border border-border bg-card p-6 shadow-[0_30px_80px_-45px_rgba(61,35,22,0.45)] sm:p-8" aria-describedby="enquiry-form-note">
      {/* Honeypot — visually hidden, ignored by humans, attractive to bots */}
      <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
        <label htmlFor="website">Leave this field empty</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {status === 'error' && errorMsg && (
        <Alert variant="destructive" className="mb-5" role="alert">
          <ShieldQuestion className="h-4 w-4" />
          <AlertDescription>{errorMsg}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ef-name">Name *</Label>
          <Input id="ef-name" value={form.name} onChange={e => set('name', e.target.value)} required autoComplete="name" maxLength={120} aria-invalid={!!fieldErrors.name} aria-describedby={fieldErrors.name ? 'ef-name-err' : undefined} />
          {fieldErrors.name && <p id="ef-name-err" className="text-xs text-destructive">{fieldErrors.name}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ef-company">Business name <span className="text-muted-foreground">(optional)</span></Label>
          <Input id="ef-company" value={form.companyName} onChange={e => set('companyName', e.target.value)} autoComplete="organization" maxLength={160} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ef-email">Email *</Label>
          <Input id="ef-email" type="email" value={form.email} onChange={e => set('email', e.target.value)} required autoComplete="email" maxLength={200} aria-invalid={!!fieldErrors.email} aria-describedby={fieldErrors.email ? 'ef-email-err' : undefined} />
          {fieldErrors.email && <p id="ef-email-err" className="text-xs text-destructive">{fieldErrors.email}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ef-phone">Phone <span className="text-muted-foreground">(optional)</span></Label>
          <Input id="ef-phone" type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} autoComplete="tel" maxLength={40} aria-invalid={!!fieldErrors.phone} aria-describedby={fieldErrors.phone ? 'ef-phone-err' : undefined} />
          {fieldErrors.phone && <p id="ef-phone-err" className="text-xs text-destructive">{fieldErrors.phone}</p>}
        </div>
      </div>

      <div className="mt-5 space-y-1.5">
        <Label htmlFor="ef-service">Interested service *</Label>
        <Select value={service} onValueChange={v => { setService(v); setFieldErrors(e => ({ ...e, service: '' })) }}>
          <SelectTrigger id="ef-service" aria-invalid={!!fieldErrors.service} className="w-full">
            <SelectValue placeholder="Choose a service…" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {site.contact.services.map(s => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {fieldErrors.service && <p className="text-xs text-destructive">{fieldErrors.service}</p>}
      </div>

      <div className="mt-5 space-y-1.5">
        <Label htmlFor="ef-message">Project description *</Label>
        <Textarea
          id="ef-message"
          value={form.message}
          onChange={e => set('message', e.target.value)}
          required
          rows={6}
          maxLength={4000}
          placeholder="Tell us about your business, what you need, and any timeline. The more detail, the better our first reply."
          aria-invalid={!!fieldErrors.message}
          aria-describedby={fieldErrors.message ? 'ef-message-err' : 'enquiry-form-note'}
        />
        {fieldErrors.message && <p id="ef-message-err" className="text-xs text-destructive">{fieldErrors.message}</p>}
        <p id="enquiry-form-note" className="text-xs text-muted-foreground">{form.message.length}/4000 characters</p>
      </div>

      <fieldset className="mt-5">
        <legend className="text-sm font-medium">Preferred contact method <span className="text-muted-foreground">(optional)</span></legend>
        <RadioGroup value={contactMethod} onValueChange={v => setContactMethod(v as typeof contactMethod)} className="mt-2.5 flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="EMAIL" id="ef-cm-email" />
            <Label htmlFor="ef-cm-email" className="font-normal">Email</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="PHONE" id="ef-cm-phone" />
            <Label htmlFor="ef-cm-phone" className="font-normal">Phone</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="NO_PREFERENCE" id="ef-cm-none" />
            <Label htmlFor="ef-cm-none" className="font-normal">No preference</Label>
          </div>
        </RadioGroup>
      </fieldset>

      <div className="mt-6 space-y-1.5">
        <div className="flex items-start gap-2.5">
          <Checkbox id="ef-consent" checked={consent} onCheckedChange={v => { setConsent(v === true); setFieldErrors(e => ({ ...e, consent: '' })) }} aria-describedby={fieldErrors.consent ? 'ef-consent-err' : undefined} />
          <Label htmlFor="ef-consent" className="text-sm font-normal leading-relaxed">
            {site.contact.consentLabel} <span className="text-muted-foreground">See the privacy notice below.</span>
          </Label>
        </div>
        {fieldErrors.consent && <p id="ef-consent-err" className="text-xs text-destructive">{fieldErrors.consent}</p>}
      </div>

      <Button type="submit" size="lg" className="slab mt-6 w-full sm:w-auto" disabled={status === 'submitting'}>
        {status === 'submitting' && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
        {status === 'submitting' ? 'Sending…' : 'Send enquiry'}
      </Button>
      <p className="mt-3 text-xs text-muted-foreground">
        This form does not send automated emails. Your enquiry is stored securely and reviewed by our team.
      </p>
    </form>
  )
}
