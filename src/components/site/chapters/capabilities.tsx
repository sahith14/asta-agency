'use client'

/**
 * Chapter 02 — DISCOVER THE CAPABILITIES.
 * Two divisions, two distinct interaction languages:
 *   A. Web & digital  → a GENUINE live interface study: a working mini
 *      website (tabs, forms, validation) inside a desktop/mobile device
 *      frame with a real responsive-preview toggle. Nothing is faked —
 *      the demo is real HTML responding to input, labelled as a demo.
 *   B. Video & creative → a cinematic sample-frame gallery; media is
 *      clearly labelled as sample content until real client work exists.
 */
import { useState } from 'react'
import Image from 'next/image'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowUpRight, Monitor, Smartphone, ImageIcon, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CinematicLink, Tilt } from '@/components/site/buttons'
import { ChapterSection } from './chapter'

/* ── A. Genuine mini-site demo (all interactions real, nothing sent) ─────── */
type DemoTab = 'home' | 'menu' | 'book'

function MiniSiteDemo() {
  const [tab, setTab] = useState<DemoTab>('home')
  const [name, setName] = useState('')
  const [guests, setGuests] = useState('2')
  const [booked, setBooked] = useState<string | null>(null)
  const [bookError, setBookError] = useState<string | null>(null)

  const book = () => {
    if (name.trim().length < 2) {
      setBookError('Please enter a name for the booking.')
      return
    }
    setBookError(null)
    setBooked(`${name.trim()} · ${guests} guests`)
  }

  return (
    <div className="flex h-full flex-col bg-[#0f0e0c] text-neutral-200">
      {/* mini nav */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <span className="text-[0.65rem] font-bold uppercase tracking-[0.3em]">The Anchor</span>
        <nav className="flex gap-1" aria-label="Demo site sections">
          {(['home', 'menu', 'book'] as DemoTab[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => { setTab(t); setBooked(null) }}
              aria-pressed={tab === t}
              className={cn(
                'rounded-full px-2.5 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.18em] transition-colors min-h-6',
                tab === t ? 'bg-amber-400 text-black' : 'text-neutral-400 hover:text-neutral-200'
              )}
            >
              {t}
            </button>
          ))}
        </nav>
      </div>

      {/* demo content — switches per tab, all client-side */}
      <div className="flex-1 overflow-y-auto scrollbar-slim p-4">
        {tab === 'home' && (
          <div>
            <p className="text-[0.55rem] uppercase tracking-[0.3em] text-amber-400">Est. 2019 · Kitchen &amp; bar</p>
            <p className="mt-2 text-xl font-bold leading-tight text-white sm:text-2xl">
              Seasonal plates,<br />late-night pouring.
            </p>
            <p className="mt-2 text-[0.7rem] leading-relaxed text-neutral-400">
              A neighbourhood kitchen serving small plates and natural wine — this page is a live
              demonstration, not a real business.
            </p>
            <button
              type="button"
              onClick={() => setTab('book')}
              className="mt-4 rounded-full bg-amber-400 px-4 py-2 text-[0.65rem] font-bold uppercase tracking-[0.18em] text-black min-h-8"
            >
              Book a table
            </button>
            <div className="mt-4 grid grid-cols-3 gap-2" aria-hidden="true">
              {['Small plates', 'Natural wine', 'Vinyl nights'].map(s => (
                <div key={s} className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-3 text-center text-[0.6rem] text-neutral-400">
                  {s}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'menu' && (
          <div>
            <p className="text-[0.55rem] uppercase tracking-[0.3em] text-amber-400">This week</p>
            <ul className="mt-3 space-y-2.5">
              {[
                ['Sourdough & cultured butter', '4.5'],
                ['Charred hispi cabbage', '9'],
                ['Cornish hake, brown shrimp', '16'],
                ['Buttermilk pudding, rhubarb', '7'],
              ].map(([dish, price]) => (
                <li key={dish} className="flex items-baseline justify-between gap-3 border-b border-white/5 pb-2 text-[0.75rem]">
                  <span>{dish}</span>
                  <span className="text-amber-400/90">{price}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[0.6rem] text-neutral-500">Menu changes weekly — demo content.</p>
          </div>
        )}

        {tab === 'book' && (
          <div>
            <p className="text-[0.55rem] uppercase tracking-[0.3em] text-amber-400">Reservations</p>
            {booked ? (
              <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3">
                <p className="flex items-center gap-2 text-[0.75rem] font-semibold text-amber-300">
                  <Check className="h-3.5 w-3.5" /> Booking captured (demo)
                </p>
                <p className="mt-1 text-[0.7rem] text-neutral-300">{booked} — this demo stores nothing and sends nothing.</p>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <div>
                  <label htmlFor="demo-name" className="mb-1 block text-[0.6rem] uppercase tracking-[0.2em] text-neutral-500">Name</label>
                  <input
                    id="demo-name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full rounded-md border border-white/15 bg-white/[0.04] px-3 py-2 text-[0.75rem] text-white placeholder:text-neutral-600 focus:border-amber-400 focus:outline-none"
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label htmlFor="demo-guests" className="mb-1 block text-[0.6rem] uppercase tracking-[0.2em] text-neutral-500">Party size</label>
                  <select
                    id="demo-guests"
                    value={guests}
                    onChange={e => setGuests(e.target.value)}
                    className="w-full rounded-md border border-white/15 bg-white/[0.04] px-3 py-2 text-[0.75rem] text-white focus:border-amber-400 focus:outline-none"
                  >
                    {['1', '2', '3', '4', '5', '6+'].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                {bookError && <p className="text-[0.65rem] text-red-400" role="alert">{bookError}</p>}
                <button
                  type="button"
                  onClick={book}
                  className="rounded-full bg-amber-400 px-4 py-2 text-[0.65rem] font-bold uppercase tracking-[0.18em] text-black min-h-8"
                >
                  Request table
                </button>
                <p className="text-[0.6rem] text-neutral-500">Demo interaction — validates input, stores nothing.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── B. Video sample frames (existence flags computed server-side) ───────── */
export interface VideoPanel {
  src: string
  cat: string
  note: string
  ok: boolean
}

export function CapabilitiesChapter({ videoPanels }: { videoPanels: VideoPanel[] }) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const reduced = useReducedMotion()

  return (
    <ChapterSection
      id="ch-capabilities"
      num="02"
      title="Discover the capabilities"
      lede="Two divisions with one standard: work you can interact with before you ever speak to us. Try the interface below — it is real, working UI."
    >
      <div className="grid gap-16 lg:grid-cols-2 lg:gap-12">
        {/* ── Web & digital: live interface study ── */}
        <div>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow text-muted-foreground">Division A — Live interface study</p>
              <h3 className="mt-2 text-2xl font-bold sm:text-3xl">Website &amp; digital experiences</h3>
            </div>
            {/* genuine responsive preview toggle */}
            <div className="flex shrink-0 rounded-full border border-border p-1" role="group" aria-label="Preview device">
              {([['desktop', Monitor], ['mobile', Smartphone]] as const).map(([d, Icon]) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDevice(d)}
                  aria-pressed={device === d}
                  aria-label={`Preview at ${d} width`}
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full transition-colors',
                    device === d ? 'bg-electric text-black' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>

          <motion.div
            layout
            transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 200, damping: 26 }}
            className="mt-6 rounded-2xl border border-border bg-card p-2.5 shadow-[0_30px_80px_rgba(0,0,0,0.5)]"
            data-testid="web-demo-frame"
            style={{ maxWidth: device === 'desktop' ? '100%' : '320px' }}
          >
            {/* browser chrome */}
            <div className="flex items-center gap-1.5 px-2 pb-2 pt-1" aria-hidden="true">
              <span className="h-2 w-2 rounded-full bg-white/15" />
              <span className="h-2 w-2 rounded-full bg-white/15" />
              <span className="h-2 w-2 rounded-full bg-white/15" />
              <span className="ml-2 flex-1 rounded-full bg-white/[0.06] px-3 py-1 text-[0.6rem] text-neutral-500">
                live demo — real UI, no data sent
              </span>
            </div>
            <div
              className={cn(
                'overflow-hidden rounded-xl transition-[height] duration-500',
                device === 'desktop' ? 'h-[420px]' : 'h-[480px]'
              )}
            >
              <MiniSiteDemo />
            </div>
          </motion.div>

          <p className="mt-4 text-sm text-muted-foreground">
            Tabs, validation and states in this frame genuinely work — the same discipline we
            bring to booking systems, portals and storefronts.
          </p>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
            <CinematicLink href="/services/web-development">Web division in detail</CinematicLink>
            <CinematicLink href="/portfolio" >Recent interface work</CinematicLink>
          </div>
        </div>

        {/* ── Video & creative: cinematic sample gallery ── */}
        <div>
          <div>
            <p className="eyebrow text-muted-foreground">Division B — Sample frames</p>
            <h3 className="mt-2 text-2xl font-bold sm:text-3xl">Video &amp; visual production</h3>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3" data-testid="video-panels">
            {videoPanels.map((p, i) => {
              return (
                <Tilt key={p.cat} maxDeg={4} className={cn(i % 2 === 1 && 'sm:translate-y-6')}>
                  <figure className="group relative overflow-hidden rounded-xl border border-border bg-card">
                    <div className="relative aspect-[4/5]">
                      {p.ok ? (
                        <Image
                          src={p.src}
                          alt={`Sample frame — ${p.cat}`}
                          fill
                          sizes="(max-width: 1024px) 50vw, 25vw"
                          className="object-cover transition-transform duration-700 group-hover:scale-[1.05]"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground/40">
                          <ImageIcon className="h-6 w-6" aria-hidden="true" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                      <span className="absolute left-2.5 top-2.5 rounded-full bg-black/60 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-white/90">
                        Sample
                      </span>
                      <figcaption className="absolute inset-x-0 bottom-0 p-3">
                        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-electric">{p.cat}</p>
                        <p className="mt-1 text-[0.72rem] leading-snug text-white/85">{p.note}</p>
                      </figcaption>
                    </div>
                  </figure>
                </Tilt>
              )
            })}
          </div>

          <p className="mt-6 text-sm text-muted-foreground">
            Frames above are demonstration content. When your project ships, this gallery carries
            your approved footage with full play controls and portal-based review.
          </p>
          <div className="mt-4">
            <CinematicLink href="/services/video-production">Video division in detail</CinematicLink>
          </div>
        </div>
      </div>

      {/* capability matrix */}
      <div className="mt-20 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4" aria-label="Full capability list">
        {[
          { h: 'Build', items: ['Business websites', 'E-commerce', 'Booking & enquiry systems', 'Custom web apps & portals'] },
          { h: 'Refine', items: ['Responsive UI design', 'Redesigns & performance', 'Integrations & technical build', 'Dashboards & internal tools'] },
          { h: 'Produce', items: ['Commercial films', 'Social reels & short-form', 'Product & food content', 'Property walkthroughs'] },
          { h: 'Sustain', items: ['Hosting & maintenance', 'Care plans & support', 'Recurring content packages', 'Ongoing iteration'] },
        ].map(col => (
          <div key={col.h} className="bg-card p-6">
            <p className="eyebrow text-electric">{col.h}</p>
            <ul className="mt-4 space-y-2.5">
              {col.items.map(item => (
                <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-foreground/40" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
        <ArrowUpRight className="h-3.5 w-3.5 text-electric" />
        Full service pages: <a href="/services" className="underline underline-offset-4 hover:text-electric">all services</a>
      </div>
    </ChapterSection>
  )
}
