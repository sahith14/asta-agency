'use client'

/**
 * Shared chapter scaffolding: numbered eyebrow header + consistent rhythm.
 * `tone="open"` keeps the section transparent so the 3D scene shows through;
 * `tone="solid"` resolves onto the dark surface for content-heavy chapters.
 */
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

export function ChapterSection({
  id,
  num,
  title,
  lede,
  tone = 'solid',
  className,
  children,
}: {
  id: string
  num: string
  title: string
  lede?: string
  tone?: 'open' | 'solid'
  className?: string
  children: React.ReactNode
}) {
  const reduced = useReducedMotion()
  return (
    <section
      id={id}
      className={cn(
        'relative scroll-mt-16',
        tone === 'solid' && 'border-t border-border bg-background',
        className
      )}
      aria-label={`Chapter ${num} — ${title}`}
    >
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
        <motion.header
          initial={reduced ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="mb-14 max-w-3xl"
        >
          <p className="eyebrow flex items-center gap-3 text-electric">
            {num}
            <span className="h-px w-10 bg-electric/60" aria-hidden="true" />
            <span className="text-muted-foreground">Chapter</span>
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
