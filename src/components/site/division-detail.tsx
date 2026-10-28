import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { publicFileExists } from '@/lib/site-media'
import { site, type SiteDivision } from '@/lib/site-content'

/** Shared detailed public page for one service division. */
export function DivisionDetail({ division }: { division: SiteDivision }) {
  const packages = division.slug === 'web-development' ? site.packages.web : site.packages.video
  return (
    <>
      {/* Division hero */}
      <section className="ambient-ivory grain relative overflow-hidden border-b" aria-labelledby="division-heading">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 lg:grid-cols-2 lg:px-6 lg:py-24">
          <div>
            <p className="eyebrow flex items-center gap-3 text-electric">Services<span className="h-px w-10 bg-electric/60" aria-hidden="true" /></p>
            <h1 id="division-heading" className="mt-4 text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
              {division.name}
            </h1>
            <p className="mt-5 text-lg font-medium text-foreground/85">{division.tagline}</p>
            <p className="mt-4 text-pretty leading-[1.8] text-muted-foreground">{division.intro}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" asChild className="slab">
                <Link href="/contact">
                  {division.cta}
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="slab slab-soft">
                <Link href="/#packages">See packages</Link>
              </Button>
            </div>
          </div>
          <div className="relative">
            {/* Layered plate behind the photograph */}
            <div className="absolute -left-3 -top-3 h-full w-full rounded-2xl border border-border bg-blush/40" aria-hidden="true" />
            <div className="absolute -bottom-3 -right-3 h-full w-full rounded-2xl bg-champagne/45" aria-hidden="true" />
            <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-border shadow-[0_35px_90px_-45px_rgba(61,35,22,0.55)] ring-1 ring-inset ring-foreground/5">
              {publicFileExists(division.image) ? (
                <Image src={division.image} alt={`${division.name} example visual`} fill priority sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted via-background to-muted">
                  <division.icon className="h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Services in this division — indexed hairline plate */}
      <section className="mx-auto max-w-6xl px-4 py-16 lg:px-6 lg:py-20" aria-labelledby="division-services-heading">
        <p className="eyebrow flex items-center gap-3 text-muted-foreground">What we offer<span className="h-px w-8 bg-border" aria-hidden="true" /></p>
        <h2 id="division-services-heading" className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          Built by this <span className="text-electric">division</span>
        </h2>
        <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-border bg-border shadow-[0_25px_70px_-50px_rgba(61,35,22,0.55)] sm:grid-cols-2 lg:grid-cols-3">
          {division.services.map((s, si) => (
            <article key={s.title} className="group bg-card p-6 transition-colors hover:bg-background">
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground" aria-hidden="true">
                  <s.icon className="h-5 w-5" />
                </span>
                <span className="text-xs tabular-nums tracking-[0.2em] text-muted-foreground/70" aria-hidden="true">{String(si + 1).padStart(2, '0')}</span>
              </div>
              <h3 className="mt-5 font-display text-base font-bold leading-snug">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Deliverables */}
      <section className="border-y bg-secondary/45" aria-labelledby="division-deliverables-heading">
        <div className="mx-auto max-w-6xl px-4 py-16 lg:px-6 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
            <div>
              <p className="eyebrow flex items-center gap-3 text-muted-foreground">Deliverables<span className="h-px w-8 bg-border" aria-hidden="true" /></p>
              <h2 id="division-deliverables-heading" className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                {division.slug === 'web-development' ? 'What a website project delivers' : 'What a video project delivers'}
              </h2>
              <p className="mt-4 text-pretty leading-[1.8] text-muted-foreground">
                Every proposal lists its deliverables explicitly, so you always know exactly what you are getting.
              </p>
            </div>
            <ul className="grid content-start gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2">
              {division.deliverables.map((d, di) => (
                <li key={d} className="flex items-start gap-2.5 bg-card p-4 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-electric" aria-hidden="true" />
                  <span>
                    <span className="mr-2 text-xs tabular-nums text-muted-foreground/60" aria-hidden="true">{String(di + 1).padStart(2, '0')}</span>
                    {d}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Packages for this division */}
      <section className="mx-auto max-w-6xl px-4 py-16 lg:px-6 lg:py-20" aria-labelledby="division-packages-heading">
        <p className="eyebrow flex items-center gap-3 text-muted-foreground">Packages<span className="h-px w-8 bg-border" aria-hidden="true" /></p>
        <h2 id="division-packages-heading" className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Indicative packages</h2>
        <p className="mt-4 max-w-2xl text-pretty leading-[1.8] text-muted-foreground">{site.packages.intro}</p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {packages.map(p => (
            <div key={p.name} className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-[0_25px_70px_-55px_rgba(61,35,22,0.6)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_35px_80px_-50px_rgba(61,35,22,0.55)]">
              <h3 className="font-display text-base font-bold">{p.name}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{p.forWhom}</p>
              <ul className="mt-5 flex-1 space-y-2 border-t border-border pt-5">
                {p.includes.map(i => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-electric" aria-hidden="true" />
                    <span>{i}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6 border-t border-border pt-4">
                <p className="font-display text-lg font-bold text-electric">{p.price}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{p.recurring}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-6 text-xs text-muted-foreground">{site.packages.note}</p>
      </section>

      {/* CTA — oxblood plate with grain */}
      <section className="relative overflow-hidden bg-primary text-primary-foreground" aria-labelledby="division-cta-heading">
        <div className="grain absolute inset-0" aria-hidden="true" />
        <div className="relative mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 py-14 text-center md:flex-row md:text-left lg:px-6">
          <h2 id="division-cta-heading" className="text-2xl font-extrabold tracking-tight sm:text-3xl">Have a project in mind?</h2>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button size="lg" variant="secondary" asChild className="slab slab-soft">
              <Link href="/contact">{division.cta}</Link>
            </Button>
            <Button size="lg" variant="outline" className="border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10" asChild>
              <Link href="/portfolio">See our work</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}
