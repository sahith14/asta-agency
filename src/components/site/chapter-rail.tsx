'use client'

/**
 * Persistent chapter rail — unobtrusive fixed navigation (desktop, ≥lg only).
 * Tracks the active chapter with an IntersectionObserver; clicking a dot
 * smooth-scrolls to the chapter. Hidden for reduced-motion visitors is NOT
 * needed (jump navigation aids accessibility); it simply never animates.
 */
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { scrollToId } from '@/lib/site/motion'

const CHAPTERS = [
  { id: 'ch-hero', num: '01', label: 'Enter the studio' },
  { id: 'ch-capabilities', num: '02', label: 'Capabilities' },
  { id: 'ch-work', num: '03', label: 'The work' },
  { id: 'ch-craft', num: '04', label: 'The craft' },
  { id: 'ch-build', num: '05', label: 'Build a project' },
  { id: 'ch-contact', num: '06', label: 'Conversation' },
]

export function ChapterRail() {
  const [active, setActive] = useState('ch-hero')

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id)
        }
      },
      { rootMargin: '-45% 0px -45% 0px' }
    )
    for (const c of CHAPTERS) {
      const el = document.getElementById(c.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [])

  return (
    <nav
      aria-label="Chapters"
      className="fixed right-6 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-4 lg:flex"
      data-testid="chapter-rail"
    >
      {CHAPTERS.map(c => {
        const isActive = active === c.id
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => scrollToId(c.id)}
            aria-label={`Chapter ${c.num} — ${c.label}`}
            aria-current={isActive ? 'true' : undefined}
            className="group flex items-center justify-end gap-3"
          >
            <span
              className={cn(
                'eyebrow text-[0.55rem] transition-all duration-300',
                isActive ? 'text-electric opacity-100' : 'text-muted-foreground opacity-0 group-hover:opacity-100'
              )}
            >
              {c.num} {c.label}
            </span>
            <span
              className={cn(
                'block rounded-full transition-all duration-300',
                isActive ? 'h-6 w-[3px] bg-electric' : 'h-[3px] w-[3px] bg-foreground/40 group-hover:bg-foreground'
              )}
            />
          </button>
        )
      })}
    </nav>
  )
}
