'use client'

/**
 * Chapter 04 — EXPERIENCE THE CRAFT. Art-directed as a small exhibit hall on
 * the light ivory tone: three genuine, isolated demonstrations (no client
 * claims), each mounted in a chalk ExhibitFrame with a museum-plaque header
 * (mono code, Syne mini-title, tag chip), a dark exhibit viewport and an
 * honest caption footer.
 *   L-01 Material study   — live 3D material controls (lazy R3F)
 *   L-02 Typography study — pointer-reactive display type
 *   L-03 Image treatment  — draggable before/after comparison
 * All are labelled demonstrations; all work on touch.
 */
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { AccentWord, ChapterSection } from './chapter'

const MaterialLab = dynamic(() => import('@/components/site/three/material-lab'), { ssr: false })

/* ── Exhibit frame — chalk plaque card shared by all three labs ───────────
   Header plaque row (mono code + Syne mini-title + oxblood-tinted tag chip),
   full-bleed exhibit viewport (each lab brings its own dark screen), caption
   footer. Rises in staggered whileInView, reduced-motion gated. */
function ExhibitFrame({
  code,
  title,
  tag,
  caption,
  delay = 0,
  className,
  children,
}: {
  code: string
  title: string
  tag: string
  caption: React.ReactNode
  delay?: number
  className?: string
  children: React.ReactNode
}) {
  const reduced = useReducedMotion()
  return (
    <motion.article
      initial={reduced ? false : { opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_60px_-42px_rgba(31,21,15,0.45)]',
        className
      )}
    >
      {/* plaque */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-5 py-3.5 sm:px-6">
        <span className="font-mono text-[0.65rem] font-semibold tracking-[0.24em] text-electric">{code}</span>
        <span aria-hidden="true" className="hidden h-px w-5 bg-electric/40 sm:block" />
        <h3 className="font-display text-[0.8rem] font-bold uppercase tracking-[0.14em] text-foreground">{title}</h3>
        <span className="ml-auto rounded-full border border-electric/25 bg-electric/[0.07] px-2.5 py-1 text-[0.58rem] font-semibold uppercase tracking-[0.18em] text-electric">
          {tag}
        </span>
      </header>
      {/* exhibit viewport — each lab supplies its own dark stage */}
      <div>{children}</div>
      {/* caption footer */}
      <footer className="border-t border-border px-5 py-3.5 sm:px-6">
        <p className="text-xs leading-relaxed text-muted-foreground">{caption}</p>
      </footer>
    </motion.article>
  )
}

/* ── L-02 Typography study — letters repel from the pointer ───────────────
   The interior panel is its own dark stage while the surrounding section is
   light, so interior colours are pinned explicitly (no token inheritance):
   letters = warm chalk, touched letter = ember, chrome labels = whites. */
function TypeLab() {
  const hostRef = useRef<HTMLDivElement>(null)
  const letterRefs = useRef<(HTMLSpanElement | null)[]>([])
  const raf = useRef(0)
  const [touched, setTouched] = useState<number | null>(null)

  const onMove = useCallback((e: React.PointerEvent) => {
    if (motionReduced()) return
    const host = hostRef.current
    if (!host) return
    const hostRect = host.getBoundingClientRect()
    const mx = e.clientX
    const my = e.clientY
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => {
      letterRefs.current.forEach((el, i) => {
        if (!el) return
        const r = el.getBoundingClientRect()
        const dx = mx - (r.left + r.width / 2)
        const dy = my - (r.top + r.height / 2)
        const dist = Math.hypot(dx, dy)
        const influence = Math.max(0, 1 - dist / 220)
        const push = influence * influence * -34
        el.style.transform = `translate(${(dx / (dist || 1)) * push}px, ${(dy / (dist || 1)) * push}px) rotate(${influence * 6 * (i % 2 ? 1 : -1)}deg)`
        el.style.fontVariationSettings = `'wght' ${700 + Math.round(influence * 100)}`
      })
    })
  }, [])

  const onLeave = useCallback(() => {
    letterRefs.current.forEach(el => {
      if (el) el.style.transform = 'translate(0,0) rotate(0deg)'
    })
  }, [])

  const word = 'MOTION'

  return (
    <div
      ref={hostRef}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className="relative flex h-[18rem] w-full items-center justify-center overflow-hidden bg-[linear-gradient(180deg,#12100e,#0d0c0a)] sm:h-[21rem]"
      data-testid="type-lab"
    >
      <span className="absolute left-4 top-4 font-mono text-[0.6rem] tracking-widest text-white/40">
        L-02 · TYPOGRAPHY STUDY
      </span>
      <div className="flex select-none" aria-label="Interactive typography demonstration" role="img">
        {word.split('').map((ch, i) => (
          <span
            key={i}
            ref={el => { letterRefs.current[i] = el }}
            onTouchStart={() => { setTouched(i); setTimeout(() => setTouched(null), 450) }}
            className={cn(
              'inline-block cursor-default px-1 text-[clamp(3rem,9vw,6rem)] font-extrabold uppercase leading-none text-[#f2efe9] transition-[transform,opacity] duration-300 ease-out will-change-transform',
              touched === i && 'scale-125 text-[#d06253]'
            )}
            style={{ transitionProperty: 'transform, color' }}
          >
            {ch}
          </span>
        ))}
      </div>
      <p className="absolute bottom-4 left-0 right-0 text-center text-[0.65rem] text-white/45">
        Move your pointer through the letters — or tap them on touch screens
      </p>
    </div>
  )
}

function motionReduced(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/* ── L-03 Before / after image treatment ──────────────────────────────────
   The wide centrepiece: media plays as an inset dark screen on the full-width
   chalk frame; the slider plinth below stays in light-scope tokens. */
function CompareLab({ src, ok }: { src: string; ok: boolean }) {
  const [pos, setPos] = useState(50)
  const hostRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const setFromClientX = useCallback((clientX: number) => {
    const host = hostRef.current
    if (!host) return
    const r = host.getBoundingClientRect()
    const pct = ((clientX - r.left) / r.width) * 100
    setPos(Math.min(96, Math.max(4, pct)))
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    setFromClientX(e.clientX)
  }
  const onPointerMove = (e: React.PointerEvent) => { if (dragging.current) setFromClientX(e.clientX) }
  const onPointerUp = () => { dragging.current = false }

  return (
    <div>
      {/* media — inset cinematic screen */}
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <div
          ref={hostRef}
          className="relative mx-auto h-72 w-full max-w-4xl select-none overflow-hidden rounded-lg shadow-[0_18px_40px_-24px_rgba(31,21,15,0.4)] sm:h-80 lg:h-[25rem]"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          data-testid="compare-lab"
        >
          {ok ? (
            <>
              {/* treated (base layer) */}
              <Image src={src} alt="Image treatment demonstration — treated version" fill sizes="(max-width: 1024px) 94vw, 900px" className="object-cover" draggable={false} />
              {/* raw (clipped overlay) */}
              <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
                <Image
                  src={src}
                  alt="Image treatment demonstration — raw version"
                  fill
                  sizes="(max-width: 1024px) 94vw, 900px"
                  className="object-cover [filter:grayscale(0.9)_brightness(0.72)_contrast(0.92)]"
                  draggable={false}
                />
              </div>
              {/* divider */}
              <div className="absolute inset-y-0 w-px bg-electric" style={{ left: `${pos}%` }} aria-hidden="true">
                <span className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-electric text-[var(--accent-ink)] shadow-lg">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <path d="M8 7l-5 5 5 5M16 7l5 5-5 5" />
                  </svg>
                </span>
              </div>
              <span className="absolute left-4 top-4 rounded-full bg-black/60 px-2.5 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-white/85 backdrop-blur-sm">
                Raw
              </span>
              <span className="absolute right-4 top-4 rounded-full bg-[#d06253] px-2.5 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-[#0d0c0a] shadow-sm">
                Treated
              </span>
            </>
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(180deg,#12100e,#0d0c0a)] p-6 text-center text-sm text-white/40">
              Treatment demo unavailable — media missing
            </div>
          )}
          <span className="absolute left-4 top-12 font-mono text-[0.6rem] tracking-widest text-white/60">
            L-03 · IMAGE TREATMENT
          </span>
        </div>
      </div>
      {/* chalk plinth — slider controls (light-scope tokens are fine here) */}
      <div className="mx-auto w-full max-w-4xl px-5 pb-5 pt-4 sm:px-6 sm:pb-6 sm:pt-5">
        <label htmlFor="compare-range" className="eyebrow mb-2 flex justify-between text-muted-foreground">
          Drag or use the slider <span className="text-electric">{Math.round(pos)}%</span>
        </label>
        <input
          id="compare-range"
          type="range"
          min={4}
          max={96}
          value={Math.round(pos)}
          onChange={e => setPos(Number(e.target.value))}
          className="w-full accent-[var(--electric)]"
          aria-label="Before and after comparison position"
        />
      </div>
    </div>
  )
}

/* ── Chapter shell — the exhibit hall ───────────────────────────────────── */
export function CraftChapter({ compareImage, compareOk }: { compareImage: string; compareOk: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const inView = useInView(hostRef, { once: false, margin: '200px' })
  const [webglOn, setWebglOn] = useState(false)
  const reduced = useReducedMotion()

  useEffect(() => {
    import('@/lib/site/webgl').then(m => setWebglOn(m.webglAvailable()))
  }, [])

  return (
    <ChapterSection
      id="ch-craft"
      num="04"
      title={<>Experience the <AccentWord>craft</AccentWord></>}
      lede="Three small, honest experiments from our lab — the same materials, motion and image discipline we apply to client work. Every control is real."
    >
      <div ref={hostRef} className="grid gap-6 sm:gap-8 lg:grid-cols-2 lg:items-start lg:gap-10">
        {/* L-01 — live material study (lazy, in-view gated, webgl-gated) */}
        <ExhibitFrame
          code="L-01"
          title="Material study"
          tag="Real-time 3D"
          caption="A live WebGL demonstration — roughness, metalness and key light respond in real time. A materials study from our lab, not a client render."
        >
          {webglOn ? (
            /* MaterialLab ships its own chalk chrome (rounded card + plinth);
               flatten it so the exhibit frame is the one card and its dark
               viewport + control plinth read as part of the frame. */
            <div className="[&>div]:rounded-none [&>div]:border-0 [&>div]:bg-transparent">
              <MaterialLab active={inView && !reduced} />
            </div>
          ) : (
            <div className="relative flex h-72 flex-col items-center justify-center gap-2 overflow-hidden bg-[linear-gradient(180deg,#12100e,#0d0c0a)] p-8 text-center sm:h-80">
              <span className="absolute left-4 top-4 font-mono text-[0.6rem] tracking-widest text-white/40">
                L-01 · MATERIAL STUDY
              </span>
              <p className="max-w-xs text-sm leading-relaxed text-white/50">
                The material study needs WebGL — the rest of the experience remains fully usable.
              </p>
            </div>
          )}
        </ExhibitFrame>

        {/* L-02 — pointer-reactive typography */}
        <ExhibitFrame
          code="L-02"
          title="Typography study"
          tag="Pointer study"
          delay={0.08}
          caption="A live motion study — letters recoil and gain weight as the pointer passes through. On touch screens, tap the letters."
        >
          <TypeLab />
        </ExhibitFrame>

        {/* L-03 — before/after grade, the wide centrepiece */}
        <div className="lg:col-span-2">
          <ExhibitFrame
            code="L-03"
            title="Image treatment"
            tag="Drag to compare"
            delay={0.1}
            caption="The same frame, before and after our grade — colour, contrast and clarity. A demonstration of treatment, not a client result."
          >
            <CompareLab src={compareImage} ok={compareOk} />
          </ExhibitFrame>
        </div>
      </div>
    </ChapterSection>
  )
}
