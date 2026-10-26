'use client'

/**
 * Chapter 04 — EXPERIENCE THE CRAFT.
 * Three genuine, isolated demonstrations (no client claims):
 *   L-01 Material study   — live 3D material controls (lazy R3F)
 *   L-02 Typography study — pointer-reactive display type
 *   L-03 Image treatment  — draggable before/after comparison
 * All are labelled demonstrations; all work on touch.
 */
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useInView, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { ChapterSection } from './chapter'

const MaterialLab = dynamic(() => import('@/components/site/three/material-lab'), { ssr: false })

/* ── L-02 Typography study — letters repel from the pointer ─────────────── */
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
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div
        ref={hostRef}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        className="relative flex h-72 items-center justify-center bg-[linear-gradient(180deg,#12100e,#0d0c0a)] sm:h-80"
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
                'inline-block cursor-default px-1 text-[clamp(3rem,9vw,6rem)] font-extrabold uppercase leading-none text-foreground transition-[transform,opacity] duration-300 ease-out will-change-transform',
                touched === i && 'scale-125 text-electric'
              )}
              style={{ transitionProperty: 'transform, color' }}
            >
              {ch}
            </span>
          ))}
        </div>
        <p className="absolute bottom-4 left-0 right-0 text-center text-[0.65rem] text-muted-foreground/70">
          Move your pointer through the letters — or tap them on touch screens
        </p>
      </div>
    </div>
  )
}

function motionReduced(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/* ── L-03 Before / after image treatment ────────────────────────────────── */
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
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div
        ref={hostRef}
        className="relative h-72 select-none overflow-hidden sm:h-80"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        data-testid="compare-lab"
      >
        {ok ? (
          <>
            {/* treated (base layer) */}
            <Image src={src} alt="Image treatment demonstration — treated version" fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" draggable={false} />
            {/* raw (clipped overlay) */}
            <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
              <Image
                src={src}
                alt="Image treatment demonstration — raw version"
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover [filter:grayscale(0.9)_brightness(0.72)_contrast(0.92)]"
                draggable={false}
              />
            </div>
            {/* divider */}
            <div className="absolute inset-y-0 w-px bg-electric" style={{ left: `${pos}%` }} aria-hidden="true">
              <span className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-electric text-black shadow-lg">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <path d="M8 7l-5 5 5 5M16 7l5 5-5 5" />
                </svg>
              </span>
            </div>
            <span className="absolute left-4 top-4 rounded-full bg-black/60 px-2.5 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-white/80">
              Raw
            </span>
            <span className="absolute right-4 top-4 rounded-full bg-black/60 px-2.5 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-electric">
              Treated
            </span>
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground/40">
            Treatment demo unavailable — media missing
          </div>
        )}
        <span className="absolute left-4 top-12 font-mono text-[0.6rem] tracking-widest text-white/60">
          L-03 · IMAGE TREATMENT
        </span>
      </div>
      <div className="p-5 sm:p-6">
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
        <p className="mt-2 text-xs text-muted-foreground">
          The same frame, before and after our grade — colour, contrast and clarity. A demonstration of treatment, not a client result.
        </p>
      </div>
    </div>
  )
}

/* ── Chapter shell ──────────────────────────────────────────────────────── */
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
      title="Experience the craft"
      lede="Three small, honest experiments from our lab — the same materials, motion and image discipline we apply to client work. Every control is real."
      tone="solid"
    >
      <div ref={hostRef} className="grid gap-8 lg:grid-cols-2">
        {/* L-01 Material study (lazy, in-view gated, webgl-gated) */}
        {webglOn ? (
          <MaterialLab active={inView && !reduced} />
        ) : (
          <div className="flex h-72 items-center justify-center rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground sm:h-80">
            The material study needs WebGL — the rest of the experience remains fully usable.
          </div>
        )}
        <TypeLab />
        <div className="lg:col-span-2">
          <CompareLab src={compareImage} ok={compareOk} />
        </div>
      </div>
    </ChapterSection>
  )
}
