import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, ExternalLink, Film, Globe, ImageIcon } from 'lucide-react'
import { db } from '@/lib/db'
import { publicFileExists } from '@/lib/site-media'
import { categoryLabel, PORTFOLIO_CATEGORIES } from '@/lib/site-content'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Our Work',
  description: 'A selection of website projects and video production work — including clearly labelled sample projects that show our style and scope.',
}

export const dynamic = 'force-dynamic'

export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>
}) {
  const { category } = await searchParams
  const active = PORTFOLIO_CATEGORIES.some(c => c.value === category) ? category : null

  const items = await db.portfolioItem.findMany({
    where: { published: true, ...(active ? { category: active } : {}) },
    orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
  })

  return (
    <>
      <section className="ambient-ivory grain relative overflow-hidden border-b" aria-labelledby="portfolio-heading">
        <div className="mx-auto max-w-6xl px-4 py-16 lg:px-6 lg:py-24">
          <p className="eyebrow flex items-center gap-3 text-electric">Portfolio<span className="h-px w-10 bg-electric/60" aria-hidden="true" /></p>
          <h1 id="portfolio-heading" className="mt-4 max-w-3xl text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.5rem]">
            Our <span className="text-electric">work</span>
          </h1>
          <p className="mt-6 flex max-w-2xl items-start gap-4 text-pretty text-lg text-muted-foreground">
            <span className="mt-3 hidden h-px w-14 shrink-0 bg-electric/70 sm:block" aria-hidden="true" />
            <span>
              Websites we have built and videos we have produced. Items marked <Badge variant="secondary" className="mx-1 align-middle">Sample</Badge>
              are demonstration projects shown to illustrate style and scope — they are not client work, and we never present sample content as real client outcomes.
            </span>
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 lg:px-6 lg:py-16" aria-label="Portfolio items">
        {/* Category filter */}
        <nav aria-label="Filter by category" className="flex flex-wrap gap-2">
          <Link
            href="/portfolio"
            aria-current={active === null ? 'true' : undefined}
            className={cn(
              'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
              active === null ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            All work
          </Link>
          {PORTFOLIO_CATEGORIES.map(c => (
            <Link
              key={c.value}
              href={`/portfolio?category=${c.value}`}
              aria-current={active === c.value ? 'true' : undefined}
              className={cn(
                'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
                active === c.value ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {c.label}
            </Link>
          ))}
        </nav>

        {items.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-border p-12 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 ring-1 ring-inset ring-primary/25">
              <Globe className="h-6 w-6 text-primary" aria-hidden="true" />
            </span>
            <p className="mt-4 font-display font-bold">No published work in this category yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              We add portfolio pieces regularly. Ask us for relevant examples and we&apos;ll share them directly.
            </p>
            <Button variant="outline" className="mt-6" asChild>
              <Link href="/contact">Request examples <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></Link>
            </Button>
          </div>
        ) : (
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((w, i) => (
              <article key={w.id} className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[0_25px_70px_-55px_rgba(61,35,22,0.6)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_35px_80px_-50px_rgba(61,35,22,0.55)]">
                <div className="relative aspect-[4/3] overflow-hidden ring-1 ring-inset ring-foreground/5 transition-all duration-300 group-hover:ring-foreground/15">
                  {w.thumbnailUrl && publicFileExists(w.thumbnailUrl) ? (
                    <Image
                      src={w.thumbnailUrl}
                      alt={`${w.title} — ${categoryLabel(w.category)}`}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted via-background to-muted" aria-hidden="true">
                      <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
                    </div>
                  )}
                  <div className="absolute left-3 top-3 flex gap-2">
                    {w.isDemo && <Badge variant="secondary" className="bg-background/90">Sample</Badge>}
                    {w.featured && <Badge className="bg-primary/90 text-primary-foreground border-transparent">Featured</Badge>}
                  </div>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="eyebrow flex items-center gap-1.5 text-muted-foreground">
                      {w.division === 'VIDEO' ? <Film className="h-3.5 w-3.5" aria-hidden="true" /> : <Globe className="h-3.5 w-3.5" aria-hidden="true" />}
                      {categoryLabel(w.category)}
                    </p>
                    <span className="text-xs tabular-nums tracking-[0.2em] text-muted-foreground/60" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                  </div>
                  <h2 className="mt-2 font-display text-base font-bold leading-snug">{w.title}</h2>
                  <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">{w.summary}</p>
                  {(w.projectUrl || w.mediaUrl) && (
                    <div className="mt-4 flex gap-3 border-t border-border pt-4">
                      {w.projectUrl && (
                        <a href={w.projectUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-sm font-medium text-foreground transition-colors hover:text-electric">
                          View project <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                      )}
                      {w.mediaUrl && (
                        <a href={w.mediaUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-sm font-medium text-foreground transition-colors hover:text-electric">
                          Watch video <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="border-t bg-secondary/45" aria-label="Call to action">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 px-4 py-12 text-center sm:flex-row sm:text-left lg:px-6">
          <p className="max-w-xl text-lg font-medium">Want work like this for your business?</p>
          <Button size="lg" className="slab shadow-[0_20px_50px_-25px_rgba(84,26,15,0.5)]" asChild>
            <Link href="/contact">Discuss Your Project <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></Link>
          </Button>
        </div>
      </section>
    </>
  )
}
