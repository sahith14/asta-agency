'use client'

/**
 * Chapter 02 — DISCOVER THE CAPABILITIES.
 * Two divisions, two distinct interaction languages:
 *   A. Web & digital  → a GENUINE live interface study: a working mini
 *      website (tabs, forms, validation) inside a desktop/mobile device
 *      frame with a real responsive-preview toggle. Nothing is faked —
 *      the demo is real HTML responding to input, labelled as a demo.
 *      Presentation: the frame sits on an atmospheric projection stage
 *      (ambient ivory wash, champagne glow, hairline bench) as the
 *      chapter's visual anchor. MiniSiteDemo deliberately keeps its own
 *      amber demo identity — only its container/staging is art-directed.
 *   B. Video & creative → a cinematic sample-frame gallery hung with
 *      varied aspect ratios and desktop-only offsets, captions set on
 *      chalk plaques below each frame; media is clearly labelled as
 *      sample content until real client work exists.
 */
import { useState } from 'react'
import Image from 'next/image'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowUpRight, Monitor, Smartphone, ImageIcon, Check, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CinematicLink, Tilt } from '@/components/site/buttons'
import { AccentWord, ChapterSection } from './chapter'

/* ── B. Editorial gallery rhythm — varied aspects with deliberate
   desktop-only vertical offsets (mobile stays a clean 2-col grid) ────────── */
const PANEL_RHYTHM = [
  { aspect: 'aspect-[3/4]', offset: '' },
  { aspect: 'aspect-[4/5]', offset: 'lg:mt-10' },
  { aspect: 'aspect-[1/1]', offset: 'lg:-mt-3' },
  { aspect: 'aspect-[16/10]', offset: 'lg:mt-5' },
] as const

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
      title={<>Discover the <AccentWord>capabilities</AccentWord></>}
      lede="Two divisions with one standard: work you can interact with before you ever speak to us. Try the interface below — it is real, working UI."
    >
      <div className="grid gap-16 lg:grid-cols-2 lg:gap-12">
        {/* ── Web & digital: live interface study on a projection stage ── */}
        <div>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow flex items-center gap-3 text-electric">
                <span className="h-px w-6 bg-electric/50" aria-hidden="true" />
                Division A — Live interface study
              </p>
              <h3 className="mt-2 text-2xl font-bold sm:text-3xl">
                Website &amp; digital <AccentWord>experiences</AccentWord>
              </h3>
            </div>
            {/* genuine responsive preview toggle — refined segmented control */}
            <div
              className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-card p-1 shadow-sm"
              role="group"
              aria-label="Preview device"
            >
              {([['desktop', Monitor], ['mobile', Smartphone]] as const).map(([d, Icon]) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDevice(d)}
                  aria-pressed={device === d}
                  aria-label={`Preview at ${d} width`}
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-300',
                    device === d
                      ? 'bg-electric text-[var(--accent-ink)] shadow-[0_2px_10px_rgba(36,20,14,0.28)]'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>

          {/* atmospheric stage — ambient wash + warm glow behind the device frame */}
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="ambient-ivory relative mt-8"
          >
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-4 top-10 bottom-2 rounded-[100%] bg-champagne/50 blur-3xl" />
            <div aria-hidden="true" className="pointer-events-none absolute -left-2 top-1/3 h-32 w-32 rounded-full bg-blush/50 blur-2xl" />

            <motion.div
              layout
              transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 200, damping: 26 }}
              className="relative rounded-2xl border border-border bg-card p-2.5 shadow-[0_36px_90px_-30px_rgba(36,20,14,0.45)] ring-1 ring-foreground/5"
              data-testid="web-demo-frame"
              style={{ maxWidth: device === 'desktop' ? '100%' : '320px' }}
            >
              {/* oxblood live chip on the frame corner */}
              <span className="absolute -top-3 left-5 z-10 inline-flex items-center gap-1.5 rounded-full bg-electric px-2.5 py-1 text-[0.55rem] font-bold uppercase tracking-[0.24em] text-[var(--accent-ink)] shadow-sm">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--accent-ink)] motion-safe:animate-pulse" />
                Live demo
              </span>

              {/* browser chrome */}
              <div className="flex items-center gap-1.5 px-2 pb-2 pt-1.5" aria-hidden="true">
                <span className="h-2.5 w-2.5 rounded-full bg-electric/70 ring-1 ring-foreground/10" />
                <span className="h-2.5 w-2.5 rounded-full bg-champagne ring-1 ring-foreground/10" />
                <span className="h-2.5 w-2.5 rounded-full bg-taupe ring-1 ring-foreground/10" />
                <span className="ml-2 flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-secondary/70 px-3 py-1 text-center text-[0.55rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  <Lock className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
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

            {/* projection bench — soft cast shadow over a hairline floor line */}
            <div aria-hidden="true" className="mx-auto mt-6 h-5 w-[72%] rounded-[100%] bg-foreground/[0.09] blur-lg" />
            <div aria-hidden="true" className="mx-auto -mt-2 h-px w-[86%] bg-gradient-to-r from-transparent via-foreground/25 to-transparent" />
          </motion.div>

          <p className="mt-5 text-sm text-muted-foreground">
            Tabs, validation and states in this frame genuinely work — the same discipline we
            bring to booking systems, portals and storefronts.
          </p>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
            <CinematicLink href="/services/web-development">Web division in detail</CinematicLink>
            <CinematicLink href="/portfolio">Recent interface work</CinematicLink>
          </div>
        </div>

        {/* ── Video & creative: sample gallery with chalk caption plaques ── */}
        <div>
          <div>
            <p className="eyebrow flex items-center gap-3 text-electric">
              <span className="h-px w-6 bg-electric/50" aria-hidden="true" />
              Division B — Sample frames
            </p>
            <h3 className="mt-2 text-2xl font-bold sm:text-3xl">
              Video &amp; visual <AccentWord>production</AccentWord>
            </h3>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 lg:mt-10 lg:gap-x-6" data-testid="video-panels">
            {videoPanels.map((p, i) => {
              const rhythm = PANEL_RHYTHM[i % PANEL_RHYTHM.length]
              return (
                <motion.div
                  key={p.cat}
                  initial={reduced ? false : { opacity: 0, y: 26 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{ duration: 0.7, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                  className={rhythm.offset}
                >
                  <Tilt maxDeg={4}>
                    <figure className="group">
                      <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-[0_20px_45px_-28px_rgba(36,20,14,0.4)] transition-colors duration-500 group-hover:border-foreground/25">
                        <div className={cn('relative', rhythm.aspect)}>
                          {p.ok ? (
                            <Image
                              src={p.src}
                              alt={`Sample frame — ${p.cat}`}
                              fill
                              sizes="(max-width: 1024px) 50vw, 25vw"
                              className="object-cover transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.05]"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground/40">
                              <ImageIcon className="h-6 w-6" aria-hidden="true" />
                            </div>
                          )}
                          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/10" />
                          <span className="absolute left-2.5 top-2.5 rounded-full bg-black/60 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-white/90 backdrop-blur-[2px]">
                            Sample
                          </span>
                        </div>
                      </div>
                      {/* chalk caption plaque below the frame */}
                      <figcaption className="mt-3 border-t border-border pt-3">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="eyebrow text-electric">{p.cat}</p>
                          <span aria-hidden="true" className="font-mono text-[0.6rem] tracking-[0.2em] text-muted-foreground/70">
                            {String(i + 1).padStart(2, '0')}
                          </span>
                        </div>
                        <p className="mt-1.5 text-[0.72rem] leading-snug text-muted-foreground">{p.note}</p>
                      </figcaption>
                    </figure>
                  </Tilt>
                </motion.div>
              )
            })}
          </div>

          <p className="mt-8 text-sm text-muted-foreground">
            Frames above are demonstration content. When your project ships, this gallery carries
            your approved footage with full play controls and portal-based review.
          </p>
          <div className="mt-4">
            <CinematicLink href="/services/video-production">Video division in detail</CinematicLink>
          </div>
        </div>
      </div>

      {/* capability matrix — chalk columns, mono indices, hairline rules */}
      <div className="mt-20 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4" aria-label="Full capability list">
        {[
          { h: 'Build', items: ['Business websites', 'E-commerce', 'Booking & enquiry systems', 'Custom web apps & portals'] },
          { h: 'Refine', items: ['Responsive UI design', 'Redesigns & performance', 'Integrations & technical build', 'Dashboards & internal tools'] },
          { h: 'Produce', items: ['Commercial films', 'Social reels & short-form', 'Product & food content', 'Property walkthroughs'] },
          { h: 'Sustain', items: ['Hosting & maintenance', 'Care plans & support', 'Recurring content packages', 'Ongoing iteration'] },
        ].map((col, i) => (
          <motion.div
            key={col.h}
            initial={reduced ? false : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.6, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
            className="group relative bg-card p-6 sm:p-7"
          >
            <span aria-hidden="true" className="pointer-events-none absolute inset-0 border border-transparent transition-colors duration-300 group-hover:border-foreground/20" />
            <div className="border-b border-border pb-4">
              <p className="font-mono text-[0.6rem] tracking-[0.3em] text-muted-foreground/80">{String(i + 1).padStart(2, '0')}</p>
              <h4 className="mt-2.5 font-display text-base font-bold uppercase tracking-[0.14em] text-electric">{col.h}</h4>
            </div>
            <ul className="mt-4 space-y-2.5">
              {col.items.map(item => (
                <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-electric/60" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>

      <div className="mt-10 flex items-center gap-2 border-t border-border pt-6 text-xs text-muted-foreground">
        <ArrowUpRight className="h-3.5 w-3.5 text-electric" aria-hidden="true" />
        <span>
          Full service pages: <a href="/services" className="underline underline-offset-4 transition-colors hover:text-electric">all services</a>
        </span>
      </div>
    </ChapterSection>
  )
}
