'use client'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SITE BUTTON SYSTEM
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable branded interactions shared by every CTA on the public site:
 *  - <Magnetic>        pointer-attraction wrapper (desktop fine pointers only)
 *  - <LiquidCTA>       liquid-fill morphing action button
 *  - <Tilt>            subtle 3D perspective wrapper for cards/actions
 *  - <CinematicLink>   animated underline + sliding arrow text link
 *
 * Rules built into every component:
 *  - keyboard reachable & focus-visible styled (globals.css outline)
 *  - magnetic/tilt/parallax effects disabled for touch pointers and for
 *    visitors preferring reduced motion
 *  - no layout shift: transforms only
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion as motionStore } from '@/lib/site/motion'

/** True only for fine pointers with motion enabled — read once, live-updated. */
function useInteractiveMotion(): boolean {
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)')
    const update = () =>
      setEnabled(fine.matches && !motionStore.reducedMotion && !motionStore.isTouch)
    update()
    const onReduced = () => update()
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', onReduced)
    return () =>
      window.matchMedia('(prefers-reduced-motion: reduce)').removeEventListener?.('change', onReduced)
  }, [])
  return enabled
}

/* ── Magnetic wrapper ─────────────────────────────────────────────────────── */
export function Magnetic({
  children,
  strength = 0.35,
  className,
}: {
  children: ReactNode
  strength?: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const enabled = useInteractiveMotion()

  const onMove = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled || !ref.current) return
      const rect = ref.current.getBoundingClientRect()
      const dx = e.clientX - (rect.left + rect.width / 2)
      const dy = e.clientY - (rect.top + rect.height / 2)
      ref.current.style.transition = 'transform 80ms linear'
      ref.current.style.transform = `translate(${dx * strength}px, ${dy * strength}px)`
    },
    [enabled, strength]
  )

  const onLeave = useCallback(() => {
    if (!ref.current) return
    ref.current.style.transition = 'transform 500ms cubic-bezier(0.22, 1.4, 0.36, 1)'
    ref.current.style.transform = 'translate(0px, 0px)'
  }, [])

  return (
    <span
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={cn('inline-block will-change-transform', className)}
    >
      {children}
    </span>
  )
}

/* ── Liquid CTA ───────────────────────────────────────────────────────────── */
type LiquidVariant = 'primary' | 'ghost' | 'outline'

const liquidBase =
  'group/liquid relative inline-flex min-h-11 cursor-pointer items-center justify-center overflow-hidden rounded-full px-7 py-3 text-[0.8rem] font-semibold uppercase tracking-[0.18em] transition-colors duration-300 select-none'

const liquidVariants: Record<LiquidVariant, string> = {
  primary: 'bg-electric text-black hover:text-black',
  ghost: 'bg-transparent text-foreground hover:text-black',
  outline: 'bg-transparent text-foreground border border-border hover:text-black',
}

export function LiquidCTA({
  children,
  variant = 'primary',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: LiquidVariant }) {
  return (
    <button {...props} className={cn(liquidBase, liquidVariants[variant], className)}>
      {/* liquid fill — scales from the pointer side on hover/press */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-0 -z-0 rounded-full transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
          variant === 'primary' ? 'bg-foreground' : 'bg-electric',
          'scale-y-0 origin-bottom group-hover/liquid:scale-y-100 group-active/liquid:scale-y-100 group-active/liquid:duration-200'
        )}
      />
      <span className="relative z-10 flex items-center gap-2">{children}</span>
    </button>
  )
}

/* ── Tilt wrapper (perspective depth for cards & project canvases) ───────── */
export function Tilt({
  children,
  className,
  maxDeg = 5,
  scale = 1.0,
}: {
  children: ReactNode
  className?: string
  maxDeg?: number
  scale?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const enabled = useInteractiveMotion()

  const onMove = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled || !ref.current) return
      const rect = ref.current.getBoundingClientRect()
      const px = (e.clientX - rect.left) / rect.width - 0.5
      const py = (e.clientY - rect.top) / rect.height - 0.5
      ref.current.style.transition = 'transform 60ms linear'
      ref.current.style.transform = `perspective(900px) rotateX(${(-py * maxDeg).toFixed(2)}deg) rotateY(${(px * maxDeg).toFixed(2)}deg)${scale !== 1 ? ` scale(${scale})` : ''}`
    },
    [enabled, maxDeg, scale]
  )

  const onLeave = useCallback(() => {
    if (!ref.current) return
    ref.current.style.transition = 'transform 600ms cubic-bezier(0.22, 1, 0.36, 1)'
    ref.current.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg)'
  }, [])

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={cn('will-change-transform [transform-style:preserve-3d]', className)}
    >
      {children}
    </div>
  )
}

/* ── Cinematic text link ─────────────────────────────────────────────────── */
export function CinematicLink({
  href,
  children,
  className,
  external = false,
  onClick,
}: {
  href: string
  children: ReactNode
  className?: string
  external?: boolean
  onClick?: () => void
}) {
  const inner = (
    <>
      <span className="relative">
        {children}
        {/* sweeping underline */}
        <span
          aria-hidden="true"
          className="absolute -bottom-1 left-0 h-px w-full origin-left scale-x-100 bg-electric transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/link:scale-x-0"
        />
        <span
          aria-hidden="true"
          className="absolute -bottom-1 left-0 h-px w-full origin-right scale-x-0 bg-electric transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] delay-100 group-hover/link:scale-x-100"
        />
      </span>
      <ArrowRight
        className="h-3.5 w-3.5 text-electric transition-transform duration-300 group-hover/link:translate-x-1.5"
        aria-hidden="true"
      />
    </>
  )
  const cls = cn(
    'group/link inline-flex min-h-11 items-center gap-2 text-[0.8rem] font-medium uppercase tracking-[0.18em] text-foreground transition-colors hover:text-electric',
    className
  )
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls} onClick={onClick}>
        {inner}
      </a>
    )
  }
  return (
    <Link href={href} className={cls} onClick={onClick}>
      {inner}
    </Link>
  )
}
