'use client'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE OXBLOOD RIBBON — landing-only signature band
 * ─────────────────────────────────────────────────────────────────────────────
 * A full-bleed, slightly-rotated oxblood ticker pinned across the ivory→night
 * seam (chapters 02→03) like gallery packaging tape. The studio tagline runs
 * as giant bold Syne type — solid ivory alternating with stroked-outline
 * letters, champagne gems between — over a slab-edged band that echoes the
 * 3D key language of the button system.
 *
 * It is REACTIVE, not just animated: a rAF loop drifts the band and feeds off
 * live scroll velocity. Scrolling down accelerates the run and leans the type
 * into the scroll (skewX); scrolling up bleeds speed off and can pull the
 * tape backward, like ribbon under tension. Everything is transform-only
 * (zero layout cost), paused whenever the band is off-screen or the tab is
 * hidden, fully static under prefers-reduced-motion, and decorative
 * throughout (aria-hidden + pointer-events-none).
 *
 * Mounted ONLY by the landing page (src/app/(site)/page.tsx) — no other
 * route renders it.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'framer-motion'

const PHRASES = ['We make digital', 'Feel different.'] as const

/** Items per duplicated copy — two identical copies make the loop seamless. */
const COPY_LENGTH = 8 // 4 tagline pairs per copy
const COPY_COUNT = 2

const BASE_SPEED = 34 // px/s idle drift leftward
const VEL_GAIN = 0.38 // band px/s gained per scroll px/s
const MAX_VEL = 750 // clamp on the scroll-derived component
const SKEW_GAIN = 0.0045 // deg of lean per scroll px/s
const MAX_SKEW = 5 // deg

export function PulseRibbon() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    const wrap = wrapRef.current
    const track = trackRef.current
    if (!wrap || !track || reduced) return

    let half = 0 // width of one copy — the wrap distance
    let pos = 0
    let vel = 0 // smoothed scroll velocity (px/s)
    let lastY = window.scrollY
    let last = performance.now()
    let raf = 0
    let visible = true
    let running = false

    const measure = () => {
      half = track.scrollWidth / COPY_COUNT
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(track)

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const y = window.scrollY
      const rawVel = dt > 0 ? (y - lastY) / dt : 0
      lastY = y
      vel += (rawVel - vel) * Math.min(1, dt * 7)
      const boost = Math.max(-MAX_VEL, Math.min(MAX_VEL, vel * VEL_GAIN))
      pos = (pos + (BASE_SPEED + boost) * dt) % half
      if (pos < 0) pos += half
      const skew = Math.max(-MAX_SKEW, Math.min(MAX_SKEW, vel * SKEW_GAIN))
      track.style.transform = `translate3d(${(-pos).toFixed(2)}px,0,0) skewX(${skew.toFixed(2)}deg)`
    }

    const sync = () => {
      const should = visible && !document.hidden
      if (should && !running) {
        running = true
        last = performance.now()
        lastY = window.scrollY
        raf = requestAnimationFrame(frame)
      } else if (!should && running) {
        running = false
        cancelAnimationFrame(raf)
      }
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting
        sync()
      },
      { rootMargin: '10% 0px' },
    )
    io.observe(wrap)
    const onVisibility = () => sync()
    document.addEventListener('visibilitychange', onVisibility)
    sync()

    return () => {
      running = false
      cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      track.style.transform = ''
    }
  }, [reduced])

  const items = Array.from({ length: COPY_LENGTH }, (_, i) => PHRASES[i % PHRASES.length])

  const copy = (key: string) => (
    <div key={key} className="flex shrink-0 items-center">
      {items.map((phrase, i) => (
        <span key={i} className="flex items-center">
          <span
            className={`whitespace-nowrap px-5 text-[clamp(1.35rem,3vw,2.4rem)] font-extrabold uppercase leading-none tracking-tight sm:px-7 ${
              i % 2 ? 'ribbon-outline' : 'ribbon-face'
            }`}
          >
            {phrase}
          </span>
          <span aria-hidden="true" className="ribbon-gem mx-1 h-2 w-2 rotate-45 rounded-[1px] sm:h-2.5 sm:w-2.5" />
        </span>
      ))}
    </div>
  )

  return (
    <div
      ref={wrapRef}
      data-testid="pulse-ribbon"
      aria-hidden="true"
      className="pointer-events-none relative z-20 -my-3 select-none overflow-x-clip py-3"
    >
      {/* rotation + slight over-scale: the tape bleeds past the viewport and
          the overflow-x-clip wrapper keeps horizontal scroll at zero */}
      <div className="-rotate-[1.3deg] scale-x-[1.04]">
        <div className="ribbon-band grain relative py-3.5 sm:py-4">
          <div ref={trackRef} className="ribbon-track flex w-max items-center">
            {copy('a')}
            {copy('b')}
          </div>
        </div>
      </div>
    </div>
  )
}
