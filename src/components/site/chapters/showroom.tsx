'use client'

/**
 * Chapter 03 — EXPLORE THE WORK.
 * DB-backed spatial showroom staged as a cinematic dark gallery (tone="night"):
 * asymmetric editorial canvases with gallery-mat inner rings and hairline frame
 * plates, hairline-framed category filter tray with an ember animated pill,
 * perspective hover, and a full cinematic viewing mode.
 * Data comes from the existing PortfolioItem records (published only);
 * sample items stay clearly labelled. Supports image and real video media.
 */
import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Play, X, ExternalLink, ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tilt } from '@/components/site/buttons'
import { AccentWord, ChapterSection } from './chapter'

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

  const hasFootnote = Boolean(active?.projectUrl) || (active?.isVideo && !active.mediaUrl)

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
      tone="night"
      title={<>Explore the <AccentWord>work</AccentWord></>}
      lede="Published pieces from our studio portfolio. Items marked “Sample” are demonstrations we built to show style and scope — nothing here is claimed as client work unless it genuinely is."
    >
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed hairline bg-card/40 p-12 text-center sm:p-16">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-electric/30 bg-electric/10">
            <ImageIcon className="h-5 w-5 text-electric" aria-hidden="true" />
          </span>
          <p className="mt-6 font-display text-lg font-bold">Our public portfolio is being prepared</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">Ask us for examples relevant to your project — we&apos;ll happily share them directly.</p>
        </div>
      ) : (
        <>
          {/* filters — hairline-framed tray, ember active pill */}
          <div className="mb-12 flex" role="group" aria-label="Filter work by category">
            <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-full border hairline bg-card/60 p-1.5 backdrop-blur-sm">
              {[{ value: 'ALL', label: 'All work' }, ...categories].map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setFilter(c.value)}
                  aria-pressed={filter === c.value}
                  className={cn(
                    'relative min-h-9 rounded-full px-4 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.16em] transition-colors duration-300',
                    filter === c.value ? 'text-[var(--accent-ink)]' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {filter === c.value &&
                    (reduced ? (
                      <span aria-hidden="true" className="absolute inset-0 rounded-full bg-electric" />
                    ) : (
                      <motion.span
                        layoutId="filter-pill"
                        className="absolute inset-0 rounded-full bg-electric"
                        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                      />
                    ))}
                  <span className="relative">{c.label}</span>
                </button>
              ))}
            </div>
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
                  transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: reduced ? 0 : (idx % 3) * 0.08 }}
                  className={cn('group min-w-0 cursor-pointer', span)}
                  onClick={() => setActive(item)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActive(item) } }}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open project: ${item.title}`}
                  data-testid={`showroom-item-${idx}`}
                >
                  <Tilt maxDeg={4}>
                    {/* gallery-mat canvas: 1px inner ring + deep shadow */}
                    <div className="relative h-full overflow-hidden rounded-2xl bg-card shadow-[0_30px_80px_-40px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 transition-all duration-500 group-hover:ring-white/25">
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
                          <span aria-hidden="true" className="font-mono text-[0.65rem] tracking-[0.3em] text-white/55">
                            <span className="text-white/90">{String(idx + 1).padStart(2, '0')}</span>
                            <span className="mx-1.5 text-white/35">/</span>
                            {String(filtered.length).padStart(2, '0')}
                          </span>
                          {item.isDemo && (
                            <span className="rounded-full border border-white/20 bg-black/60 px-3 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-white/90 backdrop-blur-sm">
                              Sample
                            </span>
                          )}
                        </div>
                        <div className="translate-y-1 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-y-0">
                          <p className="eyebrow text-electric">{item.categoryLabel}</p>
                          <h3 className="mt-2 font-display text-xl font-extrabold tracking-tight text-ivory sm:text-2xl">{item.title}</h3>
                          <p className="mt-2 max-w-md text-sm leading-snug text-white/75 opacity-0 transition-opacity duration-500 group-hover:opacity-100 max-lg:opacity-100">
                            {item.summary}
                          </p>
                          <span className="mt-3.5 inline-flex items-center gap-2.5 text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-white/85 transition-colors duration-500 group-hover:text-white">
                            View project
                            <span aria-hidden="true" className="h-px w-6 bg-electric transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:w-12" />
                          </span>
                        </div>
                      </div>
                    </div>
                  </Tilt>

                  {/* hairline frame plate under each canvas */}
                  <div className="mt-3.5 flex items-center justify-between gap-3 border-t hairline pt-2.5">
                    <span className="truncate font-mono text-[0.6rem] uppercase tracking-[0.24em] text-muted-foreground">{item.categoryLabel}</span>
                    <span className={cn('shrink-0 font-mono text-[0.6rem] uppercase tracking-[0.24em]', item.isDemo ? 'text-electric' : 'text-muted-foreground/60')}>
                      {item.isDemo ? 'Sample' : 'Published'}
                    </span>
                  </div>
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
              className="relative max-h-[88vh] w-full max-w-4xl overflow-y-auto scrollbar-slim rounded-2xl border border-border bg-card shadow-2xl shadow-black/60"
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
                  className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/70 text-white backdrop-blur-sm transition-colors duration-300 hover:border-electric hover:bg-electric hover:text-[var(--accent-ink)]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-6 sm:p-8 lg:p-10">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
                  <p className="eyebrow text-electric">{active.categoryLabel}</p>
                  {active.isDemo && (
                    <span className="rounded-full border border-electric/40 bg-electric/10 px-3 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-electric">
                      Sample — demonstration piece
                    </span>
                  )}
                </div>
                <h3 className="mt-4 font-display text-2xl font-extrabold tracking-tight sm:text-3xl lg:text-4xl">{active.title}</h3>
                {active.description && (
                  <p className="mt-4 max-w-2xl text-pretty text-[0.95rem] leading-relaxed text-muted-foreground sm:text-base">{active.description}</p>
                )}
                {hasFootnote && (
                  <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3 border-t hairline pt-6">
                    {active.projectUrl && (
                      <a
                        href={active.projectUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center gap-2.5 rounded-full border border-border px-6 text-[0.72rem] font-semibold uppercase tracking-[0.16em] transition-colors duration-300 hover:border-electric hover:bg-electric hover:text-[var(--accent-ink)]"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Visit live site
                      </a>
                    )}
                    {active.isVideo && !active.mediaUrl && (
                      <p className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Play className="h-3.5 w-3.5 text-electric" aria-hidden="true" /> Motion preview available on request.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* archive footer — hairline rule + ember sweep */}
      <div className="mt-16 border-t hairline pt-8">
        <a
          href="/portfolio"
          className="group/link flex min-h-11 w-full items-center gap-3 text-[0.8rem] font-medium uppercase tracking-[0.18em] text-foreground transition-colors duration-300 hover:text-electric"
        >
          Browse the full portfolio
          <span aria-hidden="true" className="h-px w-10 bg-electric transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/link:w-16" />
          <span className="ml-auto hidden font-mono text-[0.6rem] tracking-[0.24em] text-muted-foreground sm:block">/portfolio</span>
        </a>
      </div>
    </ChapterSection>
  )
}
