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
      <section className="border-b bg-gradient-to-b from-muted/70 to-background" aria-labelledby="portfolio-heading">
        <div className="mx-auto max-w-6xl px-4 py-14 lg:px-6 lg:py-20">
          <p className="eyebrow flex items-center gap-3 text-electric">Portfolio<span className="h-px w-10 bg-electric/60" aria-hidden="true" /></p>
          <h1 id="portfolio-heading" className="mt-2 text-balance text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            Our <em className="editorial font-normal">work</em>
          </h1>
          <p className="mt-4 max-w-2xl text-pretty text-lg text-muted-foreground">
            Websites we have built and videos we have produced. Items marked <Badge variant="secondary" className="mx-1 align-middle">Sample</Badge>
            are demonstration projects shown to illustrate style and scope — they are not client work, and we never present sample content as real client outcomes.
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
          <div className="mt-10 rounded-2xl border border-dashed p-12 text-center">
            <Globe className="mx-auto h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
            <p className="mt-3 font-medium">No published work in this category yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              We add portfolio pieces regularly. Ask us for relevant examples and we&apos;ll share them directly.
            </p>
            <Button variant="outline" className="mt-5" asChild>
              <Link href="/contact">Request examples <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></Link>
            </Button>
          </div>
        ) : (
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map(w => (
              <article key={w.id} className="group flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md">
                <div className="relative aspect-[4/3] overflow-hidden">
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
                  <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {w.division === 'VIDEO' ? <Film className="h-3.5 w-3.5" aria-hidden="true" /> : <Globe className="h-3.5 w-3.5" aria-hidden="true" />}
                    {categoryLabel(w.category)}
                  </p>
                  <h2 className="mt-1.5 font-semibold leading-snug">{w.title}</h2>
                  <p className="mt-1.5 flex-1 text-sm text-muted-foreground">{w.summary}</p>
                  {(w.projectUrl || w.mediaUrl) && (
                    <div className="mt-4 flex gap-3">
                      {w.projectUrl && (
                        <a href={w.projectUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-sm font-medium text-foreground hover:underline">
                          View project <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                      )}
                      {w.mediaUrl && (
                        <a href={w.mediaUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-sm font-medium text-foreground hover:underline">
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

      <section className="border-t bg-muted/40" aria-label="Call to action">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 px-4 py-12 text-center sm:flex-row sm:text-left lg:px-6">
          <p className="max-w-xl text-lg font-medium">Want work like this for your business?</p>
          <Button size="lg" asChild>
            <Link href="/contact">Discuss Your Project <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></Link>
          </Button>
        </div>
      </section>
    </>
  )
}
