import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Check, Film, Globe, ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { db } from '@/lib/db'
import { publicFileExists } from '@/lib/site-media'
import { categoryLabel } from '@/lib/site-content'
import { site } from '@/lib/site-content'

export const metadata: Metadata = {
  title: `${site.company.name} — ${site.company.tagline}`,
  description: site.company.valueProposition,
}

export const dynamic = 'force-dynamic'

const INDUSTRIES = [
  'Restaurants', 'Cafés & coffee shops', 'Food & beverage', 'Real estate', 'Retail',
  'Hospitality', 'Corporate', 'Events', 'Personal brands', 'Automotive', 'Healthcare',
]

function WorkThumb({ src, alt }: { src: string | null; alt: string }) {
  if (src && publicFileExists(src)) {
    return (
      <Image src={src} alt={alt} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
    )
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted via-background to-muted" aria-hidden="true">
      <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
    </div>
  )
}

export default async function HomePage() {
  const works = await db.portfolioItem.findMany({
    where: { published: true },
    orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
    take: 6,
  })
  const heroOk = publicFileExists('/images/site/hero-studio.jpg')

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="border-b bg-gradient-to-b from-muted/70 via-background to-background" aria-labelledby="hero-heading">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 lg:grid-cols-2 lg:gap-14 lg:px-6 lg:py-24">
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <Badge variant="outline" className="mb-5 border-primary/30 bg-primary/5 text-primary">
              Website &amp; digital · Video production — one studio
            </Badge>
            <h1 id="hero-heading" className="text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Websites that work. Videos that get watched.
            </h1>
            <p className="mt-5 max-w-xl text-pretty text-lg text-muted-foreground">
              {site.company.valueProposition}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link href="/services">
                  Explore Our Services
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/contact">Discuss Your Project</Link>
              </Button>
            </div>
            <p className="mt-5 text-sm text-muted-foreground">
              No account needed to browse — log in only if you are an existing client or team member.
            </p>
          </div>
          <div className="relative animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border shadow-xl">
              {heroOk ? (
                <Image
                  src="/images/site/hero-studio.jpg"
                  alt="A cinema camera and an editing workstation in a warmly lit creative studio"
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted via-background to-muted">
                  <Film className="h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
                </div>
              )}
            </div>
            <div className="absolute -bottom-4 -left-4 hidden rounded-xl border bg-background p-4 shadow-lg sm:block">
              <p className="text-sm font-semibold">Two divisions, one team</p>
              <p className="text-xs text-muted-foreground">Web builds · film shoots · care plans</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Company introduction ─────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-16 lg:px-6 lg:py-20" aria-labelledby="intro-heading">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
          <div>
            <h2 id="intro-heading" className="text-3xl font-bold tracking-tight sm:text-4xl">
              {site.intro.heading}
            </h2>
            {site.intro.body.map((p, i) => (
              <p key={i} className="mt-4 text-pretty text-muted-foreground">{p}</p>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {site.intro.whyUs.map(w => (
              <div key={w.title} className="rounded-xl border bg-card p-5">
                <h3 className="font-semibold">{w.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{w.body}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-12">
          <p className="text-center text-sm font-medium text-muted-foreground">Built for businesses like yours</p>
          <div className="mx-auto mt-4 flex max-w-4xl flex-wrap justify-center gap-2">
            {INDUSTRIES.map(c => (
              <Badge key={c} variant="secondary" className="px-3 py-1.5">{c}</Badge>
            ))}
          </div>
        </div>
      </section>

      {/* ── Services ─────────────────────────────────────────── */}
      <section className="border-y bg-muted/40" aria-labelledby="services-heading">
        <div className="mx-auto max-w-6xl px-4 py-16 lg:px-6 lg:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 id="services-heading" className="text-3xl font-bold tracking-tight sm:text-4xl">What we do</h2>
            <p className="mt-3 text-muted-foreground">
              Two connected divisions. Pick one, or combine them for a launch with both a website and the content to fill it.
            </p>
          </div>
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            {site.divisions.map(d => (
              <article key={d.slug} className="group flex flex-col overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-lg">
                <div className="relative aspect-[16/8] overflow-hidden">
                  {publicFileExists(d.image) ? (
                    <Image src={d.image} alt={`${d.name} example visual`} fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted via-background to-muted">
                      <d.icon className="h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <d.icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="text-xl font-semibold">{d.name}</h3>
                  <p className="mt-2 flex-1 text-sm text-muted-foreground">{d.intro}</p>
                  <ul className="mt-4 space-y-1.5">
                    {d.services.slice(0, 4).map(s => (
                      <li key={s.title} className="flex items-start gap-2 text-sm">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                        <span>{s.title}</span>
                      </li>
                    ))}
                  </ul>
                  <Button className="mt-5 self-start" variant="outline" asChild>
                    <Link href={d.href}>
                      Learn More
                      <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Work preview ─────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-16 lg:px-6 lg:py-20" aria-labelledby="work-heading">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="work-heading" className="text-3xl font-bold tracking-tight sm:text-4xl">Selected work</h2>
            <p className="mt-3 max-w-xl text-muted-foreground">
              A sample of what we produce. Items marked <em>Sample</em> are demonstration projects, shown to illustrate style and scope.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/portfolio">
              View all work
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
        {works.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed p-12 text-center">
            <Globe className="mx-auto h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
            <p className="mt-3 font-medium">Our public portfolio is being prepared</p>
            <p className="mt-1 text-sm text-muted-foreground">Ask us for examples relevant to your project — we&apos;ll happily share them directly.</p>
          </div>
        ) : (
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {works.map(w => (
              <Link key={w.id} href="/portfolio" className="group block overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md">
                <div className="relative aspect-[4/3] overflow-hidden">
                  <WorkThumb src={w.thumbnailUrl} alt={`${w.title} — ${categoryLabel(w.category)}`} />
                  {w.isDemo && (
                    <Badge variant="secondary" className="absolute left-3 top-3 bg-background/90">Sample</Badge>
                  )}
                </div>
                <div className="p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{categoryLabel(w.category)}</p>
                  <h3 className="mt-1 font-semibold">{w.title}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{w.summary}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ── Process ──────────────────────────────────────────── */}
      <section id="process" className="scroll-mt-20 border-y bg-muted/40" aria-labelledby="process-heading">
        <div className="mx-auto max-w-6xl px-4 py-16 lg:px-6 lg:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 id="process-heading" className="text-3xl font-bold tracking-tight sm:text-4xl">{site.process.heading}</h2>
            <p className="mt-3 text-muted-foreground">{site.process.intro}</p>
          </div>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {site.process.steps.map(step => (
              <li key={step.n} className="flex flex-col rounded-xl border bg-card p-5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground" aria-hidden="true">
                  {step.n}
                </span>
                <h3 className="mt-3 font-semibold">{step.title}</h3>
                <p className="mt-1.5 flex-1 text-sm text-muted-foreground">{step.body}</p>
                <div className="mt-3 space-y-1 border-t pt-3 text-xs text-muted-foreground">
                  <p><span className="font-semibold text-foreground/80">Websites:</span> {step.web}</p>
                  <p><span className="font-semibold text-foreground/80">Video:</span> {step.video}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Packages ─────────────────────────────────────────── */}
      <section id="packages" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 lg:px-6 lg:py-20" aria-labelledby="packages-heading">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="packages-heading" className="text-3xl font-bold tracking-tight sm:text-4xl">{site.packages.heading}</h2>
          <p className="mt-3 text-muted-foreground">{site.packages.intro}</p>
        </div>

        {(['web', 'video'] as const).map(kind => (
          <div key={kind} className="mt-12">
            <h3 className="flex items-center gap-2 text-xl font-semibold">
              {kind === 'web' ? <Globe className="h-5 w-5 text-primary" aria-hidden="true" /> : <Film className="h-5 w-5 text-primary" aria-hidden="true" />}
              {kind === 'web' ? 'Website & digital packages' : 'Video production packages'}
            </h3>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {site.packages[kind].map(p => (
                <div key={p.name} className="flex flex-col rounded-xl border bg-card p-5">
                  <h4 className="font-semibold">{p.name}</h4>
                  <p className="mt-1 text-xs text-muted-foreground">{p.forWhom}</p>
                  <ul className="mt-4 flex-1 space-y-1.5">
                    {p.includes.map(i => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                        <span>{i}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 border-t pt-3">
                    <p className="text-sm font-semibold">{p.price}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{p.recurring}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        <p className="mt-6 text-center text-xs text-muted-foreground">{site.packages.note}</p>
      </section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <section className="border-t bg-primary text-primary-foreground" aria-labelledby="cta-heading">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 py-14 text-center md:flex-row md:text-left lg:px-6">
          <div>
            <h2 id="cta-heading" className="text-2xl font-bold sm:text-3xl">Ready when you are</h2>
            <p className="mt-2 max-w-xl text-primary-foreground/85">
              Tell us about your project and we&apos;ll come back with clear next steps and a written proposal.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button size="lg" variant="secondary" asChild>
              <Link href="/contact">Discuss Your Project</Link>
            </Button>
            <Button size="lg" variant="outline" className="border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10" asChild>
              <Link href="/services">Explore Our Services</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}
