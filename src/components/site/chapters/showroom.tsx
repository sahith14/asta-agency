'use client'

/**
 * Chapter 03 — EXPLORE THE WORK.
 * DB-backed spatial showroom: asymmetric editorial canvases, category
 * filters with animated state, perspective hover, and a full viewing mode.
 * Data comes from the existing PortfolioItem records (published only);
 * sample items stay clearly labelled. Supports image and real video media.
 */
import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Play, X, ExternalLink, ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tilt } from '@/components/site/buttons'
import { ChapterSection } from './chapter'

export interface ShowroomItem {
  id: string
  title: string
  category: string
  categoryLabel: string
  summary: string
  description: string | null
  thumbnailUrl: string | null
  thumbOk: boolean
  mediaUrl: string | null
  isVideo: boolean
  projectUrl: string | null
  isDemo: boolean
}

/* grid rhythm by index — asymmetric, editorial (aspect ratios desktop-only;
   mobile heights flow from the metadata block) */
const SPANS = [
  'lg:col-span-7 lg:aspect-[16/10]',
  'lg:col-span-5 lg:aspect-[4/3] lg:mt-20',
  'lg:col-span-5 lg:aspect-[5/4]',
  'lg:col-span-7 lg:aspect-[16/9] lg:-mt-10',
  'lg:col-span-6 lg:aspect-[4/3]',
  'lg:col-span-6 lg:aspect-[4/3] lg:mt-14',
]

export function ShowroomChapter({ items }: { items: ShowroomItem[] }) {
  const [filter, setFilter] = useState<string>('ALL')
  const [active, setActive] = useState<ShowroomItem | null>(null)
  const reduced = useReducedMotion()

  const categories = useMemo(() => {
    const seen = new Map<string, string>()
    for (const it of items) seen.set(it.category, it.categoryLabel)
    return [...seen.entries()].map(([value, label]) => ({ value, label }))
  }, [items])

  const filtered = useMemo(
    () => (filter === 'ALL' ? items : items.filter(i => i.category === filter)),
    [items, filter]
  )

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setActive(null) }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [active])

  return (
    <ChapterSection
      id="ch-work"
      num="03"
      title="Explore the work"
      lede="Published pieces from our studio portfolio. Items marked “Sample” are demonstrations we built to show style and scope — nothing here is claimed as client work unless it genuinely is."
    >
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-14 text-center">
          <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
          <p className="mt-4 font-medium">Our public portfolio is being prepared</p>
          <p className="mt-1 text-sm text-muted-foreground">Ask us for examples relevant to your project — we&apos;ll happily share them directly.</p>
        </div>
      ) : (
        <>
          {/* filters */}
          <div className="mb-12 flex flex-wrap gap-2" role="group" aria-label="Filter work by category">
            {[{ value: 'ALL', label: 'All work' }, ...categories].map(c => (
              <button
                key={c.value}
                type="button"
                onClick={() => setFilter(c.value)}
                aria-pressed={filter === c.value}
                className={cn(
                  'relative rounded-full border px-4 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.16em] transition-colors min-h-9',
                  filter === c.value
                    ? 'border-electric text-foreground'
                    : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground'
                )}
              >
                {filter === c.value && !reduced && (
                  <motion.span
                    layoutId="filter-pill"
                    className="absolute inset-0 rounded-full bg-electric/15"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
                <span className={cn('relative', filter === c.value && 'text-electric')}>{c.label}</span>
              </button>
            ))}
          </div>

          {/* asymmetric grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-x-8" data-testid="showroom-grid">
            {filtered.map((item, idx) => {
              const span = SPANS[idx % SPANS.length]
              return (
                <motion.article
                  key={item.id}
                  layout={reduced ? false : 'position'}
                  initial={reduced ? false : { opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                  className={cn('group min-w-0 cursor-pointer', span)}
                  onClick={() => setActive(item)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActive(item) } }}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open project: ${item.title}`}
                  data-testid={`showroom-item-${idx}`}
                >
                  <Tilt maxDeg={4}>
                    <div className="relative h-full overflow-hidden rounded-2xl border border-border bg-card transition-colors duration-500 group-hover:border-foreground/25">
                      <div className="absolute inset-0">
                        {item.thumbOk ? (
                          <Image
                            src={item.thumbnailUrl!}
                            alt={`${item.title} — ${item.categoryLabel}`}
                            fill
                            sizes="(max-width: 1024px) 100vw, 60vw"
                            className="object-cover transition-transform duration-[1.2s] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.045]"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground/30">
                            <ImageIcon className="h-8 w-8" aria-hidden="true" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/5 to-black/20 opacity-90 transition-opacity duration-500 group-hover:opacity-100" />
                      </div>

                      {/* meta */}
                      <div className="relative flex h-full min-h-[240px] flex-col justify-between p-5 sm:p-6">
                        <div className="flex items-start justify-between gap-3">
                          <span className="font-mono text-[0.65rem] tracking-widest text-white/50">
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          {item.isDemo && (
                            <span className="rounded-full bg-black/60 px-2.5 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-white/90">
                              Sample
                            </span>
                          )}
                        </div>
                        <div className="translate-y-1 transition-transform duration-500 group-hover:translate-y-0">
                          <p className="eyebrow text-electric">{item.categoryLabel}</p>
                          <h3 className="mt-1.5 text-xl font-bold text-white sm:text-2xl">{item.title}</h3>
                          <p className="mt-1.5 max-w-md text-sm leading-snug text-white/70 opacity-0 transition-opacity duration-500 group-hover:opacity-100 max-lg:opacity-100">
                            {item.summary}
                          </p>
                          <span className="mt-3 inline-flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-white/90">
                            View project
                            <span className="h-px w-6 bg-electric transition-all duration-500 group-hover:w-10" aria-hidden="true" />
                          </span>
                        </div>
                      </div>
                    </div>
                  </Tilt>
                </motion.article>
              )
            })}
          </div>
        </>
      )}

      {/* full viewing mode */}
      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[65] flex items-center justify-center p-4 sm:p-8"
            role="dialog"
            aria-modal="true"
            aria-label={`Project detail — ${active.title}`}
            data-testid="showroom-detail"
            onClick={() => setActive(null)}
          >
            <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" aria-hidden="true" />
            <motion.div
              initial={reduced ? false : { opacity: 0, y: 40, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="relative max-h-[88vh] w-full max-w-4xl overflow-y-auto scrollbar-slim rounded-2xl border border-border bg-card shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="relative aspect-[16/9] w-full">
                {active.isVideo && active.mediaUrl ? (
                  <video
                    src={active.mediaUrl}
                    poster={active.thumbOk ? active.thumbnailUrl ?? undefined : undefined}
                    controls
                    playsInline
                    preload="metadata"
                    className="h-full w-full bg-black object-contain"
                  />
                ) : active.thumbOk ? (
                  <Image
                    src={active.thumbnailUrl!}
                    alt={`${active.title} — large view`}
                    fill
                    sizes="(max-width: 1024px) 100vw, 900px"
                    className="object-cover"
                    priority
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground/40">
                    <ImageIcon className="h-10 w-10" aria-hidden="true" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setActive(null)}
                  aria-label="Close project detail"
                  className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white transition-colors hover:bg-electric hover:text-black"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-6 sm:p-8">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="eyebrow text-electric">{active.categoryLabel}</p>
                  {active.isDemo && (
                    <span className="rounded-full border border-border px-2.5 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Sample — demonstration piece
                    </span>
                  )}
                </div>
                <h3 className="mt-3 text-2xl font-bold sm:text-3xl">{active.title}</h3>
                {active.description && (
                  <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">{active.description}</p>
                )}
                {active.projectUrl && (
                  <a
                    href={active.projectUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-5 text-[0.72rem] font-semibold uppercase tracking-[0.16em] transition-colors hover:border-electric hover:text-electric"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Visit live site
                  </a>
                )}
                {active.isVideo && !active.mediaUrl && (
                  <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                    <Play className="h-3.5 w-3.5 text-electric" /> Motion preview available on request.
                  </p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-14">
        <a
          href="/portfolio"
          className="group/link inline-flex min-h-11 items-center gap-3 text-[0.8rem] font-medium uppercase tracking-[0.18em] text-foreground transition-colors hover:text-electric"
        >
          Browse the full portfolio
          <span className="h-px w-10 bg-electric transition-all duration-500 group-hover/link:w-16" aria-hidden="true" />
        </a>
      </div>
    </ChapterSection>
  )
}
