'use client'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SITE MOTION STORE — shared scroll/pointer state for the 3D experience
 * ─────────────────────────────────────────────────────────────────────────────
 * A module-level mutable store read inside rAF loops (never triggers React
 * re-renders). The SceneCanvas owns the single rAF loop that smooths raw
 * scroll/pointer input; UI components read the smoothed values imperatively
 * (refs / direct style writes) or subscribe to coarse state changes only.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type QualityTier = 'high' | 'low'

export interface SiteMotionState {
  /** Raw scroll progress through the 3D journey (0..1) — clamped. */
  raw: number
  /** Smoothed (lerped) journey progress used by the 3D rig. */
  smooth: number
  /** Normalised pointer position (-1..1 both axes). */
  pointerX: number
  pointerY: number
  /** Smoothed pointer for parallax. */
  smoothPointerX: number
  smoothPointerY: number
  /** Journey bounds in px (recomputed on resize). */
  journeyStart: number
  journeyEnd: number
  /** True while the 3D scene is on-screen and worth rendering. */
  journeyActive: boolean
  reducedMotion: boolean
  isTouch: boolean
  quality: QualityTier
}

export const motion: SiteMotionState = {
  raw: 0,
  smooth: 0,
  pointerX: 0,
  pointerY: 0,
  smoothPointerX: 0,
  smoothPointerY: 0,
  journeyStart: 0,
  journeyEnd: 1,
  journeyActive: true,
  reducedMotion: false,
  isTouch: false,
  quality: 'high',
}

/** Journey length is measured to the top of this chapter id. */
const JOURNEY_END_ID = 'ch-craft'

export function initMotion(): () => void {
  if (typeof window === 'undefined') return () => {}

  const mqReduced = window.matchMedia('(prefers-reduced-motion: reduce)')
  const mqTouch = window.matchMedia('(pointer: coarse)')
  const readReduced = () => { motion.reducedMotion = mqReduced.matches }
  const readTouch = () => { motion.isTouch = mqTouch.matches }
  readReduced()
  readTouch()
  mqReduced.addEventListener?.('change', readReduced)
  mqTouch.addEventListener?.('change', readTouch)

  // Quality tier — conservative heuristics; low tier reduces geometry/DPR.
  const cores = navigator.hardwareConcurrency ?? 4
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
  motion.quality = cores >= 6 && mem >= 6 && !mqTouch.matches ? 'high' : 'low'

  const measure = () => {
    const vh = window.innerHeight
    const endEl = document.getElementById(JOURNEY_END_ID)
    motion.journeyStart = 0
    motion.journeyEnd = endEl
      ? Math.max(vh, endEl.getBoundingClientRect().top + window.scrollY - vh * 0.5)
      : vh * 4
  }
  measure()
  window.addEventListener('resize', measure)

  const onScroll = () => {
    const y = window.scrollY
    const span = Math.max(1, motion.journeyEnd - motion.journeyStart)
    motion.raw = Math.min(1, Math.max(0, (y - motion.journeyStart) / span))
    motion.journeyActive = y < motion.journeyEnd + window.innerHeight * 0.4
  }
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })

  const onPointer = (e: PointerEvent) => {
    if (motion.isTouch) return
    motion.pointerX = (e.clientX / window.innerWidth) * 2 - 1
    motion.pointerY = (e.clientY / window.innerHeight) * 2 - 1
  }
  window.addEventListener('pointermove', onPointer, { passive: true })

  return () => {
    mqReduced.removeEventListener?.('change', readReduced)
    mqTouch.removeEventListener?.('change', readTouch)
    window.removeEventListener('resize', measure)
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('pointermove', onPointer)
  }
}

/**
 * Advance the smoothing — called once per frame from the scene's rAF loop.
 * With reduced motion, smoothed values snap to raw (no floaty drift).
 */
export function tickMotion(delta: number): void {
  const t = Math.min(1, delta * 4.5)
  if (motion.reducedMotion) {
    motion.smooth = motion.raw
    motion.smoothPointerX = motion.pointerX
    motion.smoothPointerY = motion.pointerY
    return
  }
  motion.smooth += (motion.raw - motion.smooth) * t
  motion.smoothPointerX += (motion.pointerX - motion.smoothPointerX) * t * 0.6
  motion.smoothPointerY += (motion.pointerY - motion.smoothPointerY) * t * 0.6
}

/** Smooth-scroll to an element id; instant jump under reduced motion. */
export function scrollToId(id: string): void {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: motion.reducedMotion ? 'auto' : 'smooth', block: 'start' })
}
