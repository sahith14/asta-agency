'use client'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PROJECT CONFIGURATOR — premium 7-step brief builder
 * ─────────────────────────────────────────────────────────────────────────────
 * Service → Goal → Scope → Budget & timing → Project info → Contact → Review.
 * Submits to the EXISTING public enquiry API (POST /api/enquiries) — same
 * validation, spam protection, rate limiting and CRM pipeline as the contact
 * page. Structured answers are preserved inside the enquiry message in a
 * readable, staff-friendly format; the service selection uses the existing
 * canonical service values. No schema changes, no fake prices, no fake
 * confirmations — the success screen shows the real reference number.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, CircleAlert, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConfigurator, type ConfiguratorAnswers } from './configurator-store'
import { site } from '@/lib/site-content'

/* ── Catalogue (service ids map to canonical public enquiry services) ─────── */
type Category = 'web' | 'video' | 'other'
const SERVICES: { id: string; label: string; api: string; category: Category }[] = [
  { id: 'web-website', label: 'Website design & development', api: 'Website design & development', category: 'web' },
  { id: 'web-ecommerce', label: 'E-commerce website', api: 'E-commerce website', category: 'web' },
  { id: 'web-app', label: 'Web application or client portal', api: 'Custom web app / portal', category: 'web' },
  { id: 'video-brand', label: 'Commercial video / brand film', api: 'Video — brand film', category: 'video' },
  { id: 'video-social', label: 'Social media content', api: 'Video — social reels package', category: 'video' },
  { id: 'video-product', label: 'Product / food content', api: 'Product & food photography/video', category: 'video' },
  { id: 'video-property', label: 'Property video', api: 'Video — property walkthrough', category: 'video' },
  { id: 'other', label: 'Multiple services / something else', api: 'Something else / not sure yet', category: 'other' },
]

const GOALS: Record<Category, string[]> = {
  web: ['New website', 'Redesign of an existing site', 'Online store', 'Booking or enquiry system', 'Custom platform or portal', 'Ongoing maintenance & care'],
  video: ['Single commercial', 'Monthly reels package', 'Product or food shoot', 'Property walkthrough', 'Brand film', 'Ongoing content package'],
  other: ['A new project from scratch', 'Improve something existing', 'Not sure yet — help me shape it'],
}

const PAGES = ['1–3 pages', '4–8 pages', '9+ pages', 'Not sure yet']
const FEATURES = ['Booking & scheduling', 'Payments', 'Blog or news section', 'Client login area', 'Third-party integrations', 'Multilingual']
const DELIVERABLES = ['1–2 videos', '3–6 videos', 'Monthly package']
const LOCATIONS = ['In the studio', 'On location', 'Both']
const PLATFORMS = ['Instagram', 'TikTok', 'YouTube', 'Website', 'In-store / venue']
const OTHER_FOCUS = ['Website', 'Video', 'Photography', 'Strategy / consulting', 'Not sure yet']
const BUDGETS = ['Under £2,000', '£2,000 – £5,000', '£5,000 – £10,000', '£10,000+', 'Not sure yet']
const TIMINGS = ['As soon as possible', 'Within 1–3 months', 'Within 3–6 months', 'Just exploring for now']

const STEP_TITLES = ['Service', 'Goal', 'Scope', 'Budget & timing', 'Project info', 'Contact', 'Review']

/* ── Tiny UI atoms ────────────────────────────────────────────────────────── */
function OptionCard({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'group w-full rounded-xl border p-4 text-left transition-all duration-200 min-h-11',
        selected
          ? 'border-electric bg-electric/10 text-foreground'
          : 'border-border bg-card/60 text-muted-foreground hover:border-foreground/30 hover:text-foreground'
      )}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{children}</span>
        <span
          aria-hidden="true"
          className={cn(
            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
            selected ? 'border-electric bg-electric text-black' : 'border-border'
          )}
        >
          {selected && <Check className="h-3 w-3" />}
        </span>
      </span>
    </button>
  )
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'rounded-full border px-4 py-2 text-xs font-medium transition-colors min-h-11 md:min-h-min',
        selected
          ? 'border-electric bg-electric/15 text-foreground'
          : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

const inputCls =
  'w-full rounded-lg border border-input bg-background/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-electric focus:outline-none'

/* ── The modal ────────────────────────────────────────────────────────────── */
export function ProjectConfigurator() {
  const { open, step, answers, openedAt, setStep, patch, closeConfigurator, reset } = useConfigurator()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reference, setReference] = useState<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const category: Category = useMemo(
    () => SERVICES.find(s => s.id === answers.serviceId)?.category ?? 'web',
    [answers.serviceId]
  )

  /* Escape closes; body scroll lock while open */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeConfigurator()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, closeConfigurator])

  /* Focus the step heading on change (keyboard flow) */
  useEffect(() => {
    if (open) headingRef.current?.focus()
  }, [step, open])

  /* ── per-step validation ─────────────────────────────────────────────── */
  const stepValid = useCallback(
    (s: number, a: ConfiguratorAnswers): boolean => {
      switch (s) {
        case 1:
          return !!a.serviceId
        case 2:
          return !!a.goal
        case 3:
          if (category === 'web') return !!a.scopePages
          if (category === 'video') return !!a.scopeDeliverables && !!a.scopeLocations
          return a.scopeFeatures.length > 0
        case 4:
          return !!a.budget && !!a.timing
        case 5:
          return a.description.trim().length >= 20
        case 6: {
          const hasContact = !!a.email.trim() || !!a.phone.trim()
          const emailOk = !a.email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email.trim())
          return hasContact && emailOk && a.name.trim().length >= 2 && a.consent
        }
        default:
          return true
      }
    },
    [category]
  )

  /* ── submission payload (preserves structure inside the message) ─────── */
  const buildMessage = (a: ConfiguratorAnswers): string => {
    const svc = SERVICES.find(s => s.id === a.serviceId)
    const lines: string[] = ['PROJECT BRIEF — submitted via the project configurator', '']
    lines.push(`Service: ${svc?.label ?? 'Unspecified'}`)
    if (a.alsoInterested.length) {
      const labels = a.alsoInterested
        .map(id => SERVICES.find(s => s.id === id)?.label)
        .filter(Boolean)
        .join(', ')
      lines.push(`Also interested in: ${labels}`)
    }
    lines.push(`Goal: ${a.goal ?? '—'}`)
    const scope: string[] = []
    if (a.scopePages) scope.push(`Pages: ${a.scopePages}`)
    if (a.scopeFeatures.length) scope.push(`Features: ${a.scopeFeatures.join(', ')}`)
    if (a.scopeDeliverables) scope.push(`Deliverables: ${a.scopeDeliverables}`)
    if (a.scopeLocations) scope.push(`Locations: ${a.scopeLocations}`)
    if (a.scopePlatforms.length) scope.push(`Platforms: ${a.scopePlatforms.join(', ')}`)
    if (scope.length) lines.push(`Scope — ${scope.join(' · ')}`)
    lines.push(`Budget (self-reported, not a quote): ${a.budget ?? '—'}`)
    lines.push(`Timing: ${a.timing ?? '—'}`)
    if (a.url.trim()) lines.push(`Reference link: ${a.url.trim()}`)
    lines.push('', 'Brief:', a.description.trim())
    return lines.join('\n').slice(0, 3900)
  }

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const svc = SERVICES.find(s => s.id === answers.serviceId)
      const res = await fetch('/api/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: answers.name.trim(),
          email: answers.email.trim() || undefined,
          phone: answers.phone.trim() || undefined,
          service: svc?.api ?? 'Something else / not sure yet',
          message: buildMessage(answers),
          contactMethod: answers.contactMethod,
          consent: true,
          website: '',
          formAgeMs: Math.min(Date.now() - openedAt, 23 * 3600 * 1000),
        }),
      })
      const data = (await res.json().catch(() => null)) as { ok?: boolean; reference?: string; error?: string } | null
      if (res.status === 201 && data?.reference) {
        setReference(data.reference)
        reset()
      } else if (res.status === 429) {
        setError('You have submitted several enquiries recently. Please try again a little later.')
      } else {
        setError(data?.error ?? 'Something went wrong saving your enquiry. Please try again, or use the contact page.')
      }
    } catch {
      setError('Network problem — your enquiry was not saved. Please check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  const canNext = stepValid(step, answers)

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Start a project — project configurator"
      data-testid="configurator"
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-[2px]" onClick={closeConfigurator} aria-hidden="true" />

      <div
        ref={panelRef}
        className="relative flex h-[94vh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl sm:h-[88vh] sm:max-w-2xl sm:rounded-2xl"
      >
        {/* header */}
        <div className="shrink-0 border-b border-border px-5 pb-4 pt-5 sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow text-electric">Start a project</p>
              <h2
                ref={headingRef}
                tabIndex={-1}
                className="mt-1 text-xl font-bold outline-none sm:text-2xl"
              >
                {reference ? 'Enquiry received' : STEP_TITLES[step - 1]}
              </h2>
            </div>
            <button
              type="button"
              onClick={closeConfigurator}
              aria-label="Close configurator"
              className="rounded-full border border-border p-2 text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground min-h-11 min-w-11"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {!reference && (
            <div className="mt-4 flex items-center gap-3">
              <span className="eyebrow shrink-0 text-muted-foreground">
                {String(step).padStart(2, '0')}/07
              </span>
              <div className="h-px flex-1 bg-border">
                <div
                  className="h-px bg-electric transition-all duration-500"
                  style={{ width: `${(step / 7) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* body */}
        <div className="scrollbar-slim flex-1 overflow-y-auto px-5 py-6 sm:px-7">
          {reference ? (
            <SuccessPanel reference={reference} onClose={closeConfigurator} />
          ) : (
            <>
              {step === 1 && (
                <StepShell title="What do you need?" hint="Pick the closest match — you can refine it later.">
                  <div className="grid gap-2.5">
                    {SERVICES.map(s => (
                      <OptionCard
                        key={s.id}
                        selected={answers.serviceId === s.id}
                        onClick={() => patch({ serviceId: s.id, goal: null, scopePages: null, scopeFeatures: [], scopeDeliverables: null, scopeLocations: null, scopePlatforms: [] })}
                      >
                        {s.label}
                      </OptionCard>
                    ))}
                  </div>
                  {answers.serviceId && (
                    <div className="mt-6">
                      <p className="eyebrow mb-3 text-muted-foreground">Also interested in (optional)</p>
                      <div className="flex flex-wrap gap-2">
                        {SERVICES.filter(s => s.id !== answers.serviceId).map(s => (
                          <Chip
                            key={s.id}
                            selected={answers.alsoInterested.includes(s.id)}
                            onClick={() =>
                              patch({
                                alsoInterested: answers.alsoInterested.includes(s.id)
                                  ? answers.alsoInterested.filter(x => x !== s.id)
                                  : [...answers.alsoInterested, s.id],
                              })
                            }
                          >
                            {s.label}
                          </Chip>
                        ))}
                      </div>
                    </div>
                  )}
                </StepShell>
              )}

              {step === 2 && (
                <StepShell title="What is the goal?" hint="Tells us where to focus from the first reply.">
                  <div className="grid gap-2.5">
                    {GOALS[category].map(g => (
                      <OptionCard key={g} selected={answers.goal === g} onClick={() => patch({ goal: g })}>
                        {g}
                      </OptionCard>
                    ))}
                  </div>
                </StepShell>
              )}

              {step === 3 && category === 'web' && (
                <StepShell title="Roughly what scope?" hint="A starting point — the proposal will define the final scope.">
                  <p className="eyebrow mb-3 text-muted-foreground">Expected size</p>
                  <div className="grid grid-cols-2 gap-2.5">
                    {PAGES.map(p => (
                      <OptionCard key={p} selected={answers.scopePages === p} onClick={() => patch({ scopePages: p })}>
                        {p}
                      </OptionCard>
                    ))}
                  </div>
                  <p className="eyebrow mb-3 mt-6 text-muted-foreground">Features you may need</p>
                  <div className="flex flex-wrap gap-2">
                    {FEATURES.map(f => (
                      <Chip
                        key={f}
                        selected={answers.scopeFeatures.includes(f)}
                        onClick={() =>
                          patch({
                            scopeFeatures: answers.scopeFeatures.includes(f)
                              ? answers.scopeFeatures.filter(x => x !== f)
                              : [...answers.scopeFeatures, f],
                          })
                        }
                      >
                        {f}
                      </Chip>
                    ))}
                  </div>
                </StepShell>
              )}

              {step === 3 && category === 'video' && (
                <StepShell title="Roughly what scope?" hint="A starting point — the proposal will define the final scope.">
                  <p className="eyebrow mb-3 text-muted-foreground">Deliverables</p>
                  <div className="grid gap-2.5">
                    {DELIVERABLES.map(d => (
                      <OptionCard key={d} selected={answers.scopeDeliverables === d} onClick={() => patch({ scopeDeliverables: d })}>
                        {d}
                      </OptionCard>
                    ))}
                  </div>
                  <p className="eyebrow mb-3 mt-6 text-muted-foreground">Filming locations</p>
                  <div className="grid grid-cols-3 gap-2.5">
                    {LOCATIONS.map(l => (
                      <OptionCard key={l} selected={answers.scopeLocations === l} onClick={() => patch({ scopeLocations: l })}>
                        {l}
                      </OptionCard>
                    ))}
                  </div>
                  <p className="eyebrow mb-3 mt-6 text-muted-foreground">Where will it play?</p>
                  <div className="flex flex-wrap gap-2">
                    {PLATFORMS.map(pl => (
                      <Chip
                        key={pl}
                        selected={answers.scopePlatforms.includes(pl)}
                        onClick={() =>
                          patch({
                            scopePlatforms: answers.scopePlatforms.includes(pl)
                              ? answers.scopePlatforms.filter(x => x !== pl)
                              : [...answers.scopePlatforms, pl],
                          })
                        }
                      >
                        {pl}
                      </Chip>
                    ))}
                  </div>
                </StepShell>
              )}

              {step === 3 && category === 'other' && (
                <StepShell title="What should we focus on?" hint="Pick anything relevant — we'll shape it together.">
                  <div className="flex flex-wrap gap-2">
                    {OTHER_FOCUS.map(f => (
                      <Chip
                        key={f}
                        selected={answers.scopeFeatures.includes(f)}
                        onClick={() =>
                          patch({
                            scopeFeatures: answers.scopeFeatures.includes(f)
                              ? answers.scopeFeatures.filter(x => x !== f)
                              : [...answers.scopeFeatures, f],
                          })
                        }
                      >
                        {f}
                      </Chip>
                    ))}
                  </div>
                </StepShell>
              )}

              {step === 4 && (
                <StepShell
                  title="Budget & timing"
                  hint="Budget ranges are self-reported to help us tailor a proposal — they are not prices and nothing is charged here."
                >
                  <p className="eyebrow mb-3 text-muted-foreground">Comfortable budget range</p>
                  <div className="grid grid-cols-2 gap-2.5">
                    {BUDGETS.map(b => (
                      <OptionCard key={b} selected={answers.budget === b} onClick={() => patch({ budget: b })}>
                        {b}
                      </OptionCard>
                    ))}
                  </div>
                  <p className="eyebrow mb-3 mt-6 text-muted-foreground">Ideal timing</p>
                  <div className="grid gap-2.5">
                    {TIMINGS.map(t => (
                      <OptionCard key={t} selected={answers.timing === t} onClick={() => patch({ timing: t })}>
                        {t}
                      </OptionCard>
                    ))}
                  </div>
                </StepShell>
              )}

              {step === 5 && (
                <StepShell title="Tell us about the project" hint="A short brief is enough — we'll ask the right questions in reply.">
                  <textarea
                    value={answers.description}
                    onChange={e => patch({ description: e.target.value })}
                    rows={6}
                    maxLength={3000}
                    placeholder="What does your business do, what should this project achieve, anything we should know…"
                    className={cn(inputCls, 'resize-none')}
                    aria-label="Project description"
                    data-testid="configurator-description"
                  />
                  <p className={cn('mt-2 text-xs', answers.description.trim().length >= 20 ? 'text-muted-foreground' : 'text-electric')}>
                    {answers.description.trim().length}/20 characters minimum
                  </p>
                  <div className="mt-5">
                    <label htmlFor="cfg-url" className="eyebrow mb-2 block text-muted-foreground">
                      Existing website or reference (optional)
                    </label>
                    <input
                      id="cfg-url"
                      type="url"
                      value={answers.url}
                      onChange={e => patch({ url: e.target.value })}
                      placeholder="https://…"
                      className={inputCls}
                    />
                  </div>
                </StepShell>
              )}

              {step === 6 && (
                <StepShell title="How should we reach you?" hint={site.contact.intro}>
                  <div className="grid gap-4">
                    <div>
                      <label htmlFor="cfg-name" className="eyebrow mb-2 block text-muted-foreground">Your name</label>
                      <input
                        id="cfg-name"
                        value={answers.name}
                        onChange={e => patch({ name: e.target.value })}
                        autoComplete="name"
                        className={inputCls}
                        data-testid="configurator-name"
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="cfg-email" className="eyebrow mb-2 block text-muted-foreground">Email</label>
                        <input
                          id="cfg-email"
                          type="email"
                          value={answers.email}
                          onChange={e => patch({ email: e.target.value })}
                          autoComplete="email"
                          className={inputCls}
                          data-testid="configurator-email"
                        />
                      </div>
                      <div>
                        <label htmlFor="cfg-phone" className="eyebrow mb-2 block text-muted-foreground">Phone</label>
                        <input
                          id="cfg-phone"
                          type="tel"
                          value={answers.phone}
                          onChange={e => patch({ phone: e.target.value })}
                          autoComplete="tel"
                          className={inputCls}
                          data-testid="configurator-phone"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">Provide at least one — email or phone.</p>
                    <div>
                      <p className="eyebrow mb-2 text-muted-foreground">Preferred contact method</p>
                      <div className="flex flex-wrap gap-2">
                        {(['EMAIL', 'PHONE', 'NO_PREFERENCE'] as const).map(m => (
                          <Chip key={m} selected={answers.contactMethod === m} onClick={() => patch({ contactMethod: m })}>
                            {m === 'EMAIL' ? 'Email' : m === 'PHONE' ? 'Phone' : 'No preference'}
                          </Chip>
                        ))}
                      </div>
                    </div>
                    <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={answers.consent}
                        onChange={e => patch({ consent: e.target.checked })}
                        className="mt-0.5 h-4 w-4 accent-[var(--electric)]"
                        data-testid="configurator-consent"
                      />
                      <span>{site.contact.consentLabel}</span>
                    </label>
                  </div>
                </StepShell>
              )}

              {step === 7 && (
                <StepShell title="Review your brief" hint="Check everything — use Edit to go back to any step.">
                  <div className="grid gap-3" data-testid="configurator-review">
                    <ReviewRow label="Service" value={SERVICES.find(s => s.id === answers.serviceId)?.label ?? '—'} step={1} />
                    {answers.alsoInterested.length > 0 && (
                      <ReviewRow
                        label="Also interested"
                        value={answers.alsoInterested.map(id => SERVICES.find(s => s.id === id)?.label).join(', ')}
                        step={1}
                      />
                    )}
                    <ReviewRow label="Goal" value={answers.goal ?? '—'} step={2} />
                    {(answers.scopePages || answers.scopeDeliverables || answers.scopeFeatures.length > 0) && (
                      <ReviewRow
                        label="Scope"
                        value={[
                          answers.scopePages,
                          answers.scopeDeliverables,
                          answers.scopeLocations,
                          answers.scopeFeatures.length ? answers.scopeFeatures.join(', ') : null,
                          answers.scopePlatforms.length ? answers.scopePlatforms.join(', ') : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                        step={3}
                      />
                    )}
                    <ReviewRow label="Budget & timing" value={`${answers.budget ?? '—'} · ${answers.timing ?? '—'}`} step={4} />
                    <ReviewRow label="Brief" value={answers.description.trim()} step={5} />
                    {answers.url.trim() && <ReviewRow label="Reference" value={answers.url.trim()} step={5} />}
                    <ReviewRow
                      label="Contact"
                      value={`${answers.name.trim()} · ${[answers.email.trim(), answers.phone.trim()].filter(Boolean).join(' · ')} · prefers ${answers.contactMethod === 'EMAIL' ? 'email' : answers.contactMethod === 'PHONE' ? 'phone' : 'either'}`}
                      step={6}
                    />
                    {error && (
                      <div className="flex items-start gap-2 rounded-lg border border-electric/40 bg-electric/10 p-3 text-sm text-foreground" role="alert">
                        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
                        <span>{error}</span>
                      </div>
                    )}
                  </div>
                </StepShell>
              )}
            </>
          )}
        </div>

        {/* footer controls */}
        {!reference && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-5 py-4 sm:px-7">
            <button
              type="button"
              onClick={() => setStep(Math.max(1, step - 1))}
              disabled={step === 1}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[0.8rem] font-medium uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-0"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            {step < 7 ? (
              <button
                type="button"
                onClick={() => canNext && setStep(step + 1)}
                disabled={!canNext}
                data-testid="configurator-next"
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-electric px-6 text-[0.8rem] font-semibold uppercase tracking-[0.14em] text-black transition-opacity disabled:opacity-30"
              >
                Continue <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                data-testid="configurator-submit"
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-electric px-6 text-[0.8rem] font-semibold uppercase tracking-[0.14em] text-black transition-opacity disabled:opacity-50"
              >
                {submitting ? 'Sending…' : <>Submit enquiry <ArrowRight className="h-3.5 w-3.5" /></>}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function StepShell({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-lg font-bold">{title}</h3>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      <div className="mt-5">{children}</div>
    </div>
  )
}

function ReviewRow({ label, value, step }: { label: string; value: string; step: number }) {
  const { setStep } = useConfigurator()
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-background/40 p-4">
      <div className="min-w-0">
        <p className="eyebrow text-muted-foreground">{label}</p>
        <p className="mt-1 break-words text-sm text-foreground">{value}</p>
      </div>
      <button
        type="button"
        onClick={() => setStep(step)}
        className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-electric hover:text-electric min-h-11"
      >
        Edit
      </button>
    </div>
  )
}

function SuccessPanel({ reference, onClose }: { reference: string; onClose: () => void }) {
  return (
    <div className="flex flex-col items-start gap-4 py-6" data-testid="configurator-success">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-electric text-black">
        <Check className="h-6 w-6" />
      </span>
      <h3 className="text-2xl font-bold">Your brief is in.</h3>
      <p className="text-sm text-muted-foreground">{site.contact.successNote}</p>
      <div className="w-full rounded-xl border border-border bg-background/50 p-4">
        <p className="eyebrow text-muted-foreground">Your enquiry reference</p>
        <p className="mt-1 font-mono text-lg tracking-wide text-electric" data-testid="configurator-reference">
          {reference}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">Keep this reference — quote it in any follow-up and we can find your enquiry instantly.</p>
      <button
        type="button"
        onClick={onClose}
        className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full bg-electric px-6 text-[0.8rem] font-semibold uppercase tracking-[0.14em] text-black"
      >
        Done <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
