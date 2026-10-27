'use client'

/**
 * Shared chapter scaffolding — editorial chapter header + tone system.
 *
 * Tones (section rhythm for the long homepage):
 *  - 'open'   transparent — the 3D scene shows through (hero-adjacent use)
 *  - 'ivory'  warm chalk paper, bright editorial section
 *  - 'taupe'  blush/taupe tinted atelier section
 *  - 'night'  cinematic dark section (token flip via `.night`)
 *
 * Header: ghost chapter numeral, eyebrow annotation, Syne display title with
 * optional serif-italic accent (<AccentWord>), and a lede. Entrance respects
 * prefers-reduced-motion.
 */
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

export function AccentWord({ children, className }: { children: React.ReactNode; className?: string }) {
  return <em className={cn('editorial font-normal', className)}>{children}</em>
}

export function ChapterSection({
  id,
  num,
  title,
  lede,
  tone = 'ivory',
  className,
  children,
}: {
  id: string
  num: string
  title: React.ReactNode
  lede?: string
  tone?: 'open' | 'solid' | 'ivory' | 'taupe' | 'night'
  className?: string
  children: React.ReactNode
}) {
  const reduced = useReducedMotion()
  const isNight = tone === 'night'
  return (
    <section
      id={id}
      className={cn(
        'relative scroll-mt-16',
        (tone === 'solid' || tone === 'ivory') && 'border-t border-border bg-background',
        tone === 'taupe' && 'ambient-taupe border-t border-border bg-secondary/45',
        isNight && 'night ambient-night grain border-t border-border bg-background text-foreground',
        className
      )}
      aria-label={typeof title === 'string' ? `Chapter ${num} — ${title}` : `Chapter ${num}`}
    >
      {isNight && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/25 to-transparent" />
      )}
      <div className="relative mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
        {/* oversized ghost numeral — decorative, aria-hidden */}
        <span
          aria-hidden="true"
          className={cn(
            'ghost-num pointer-events-none absolute right-4 top-6 select-none font-display text-[clamp(5rem,14vw,11rem)] font-extrabold leading-none lg:right-10',
            isNight && 'opacity-70'
          )}
        >
          {num}
        </span>

        <motion.header
          initial={reduced ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="relative mb-14 max-w-3xl"
        >
          <p className="eyebrow flex items-center gap-3 text-electric">
            Chapter {num}
            <span className="h-px w-10 bg-electric/60" aria-hidden="true" />
          </p>
          <h2 className="mt-4 text-[clamp(1.7rem,5.5vw,4rem)] font-extrabold uppercase leading-[1.05] tracking-tight [text-wrap:balance]">
            {title}
          </h2>
          {lede && <p className="mt-5 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">{lede}</p>}
        </motion.header>
        {children}
      </div>
    </section>
  )
}
