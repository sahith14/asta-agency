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
      <section className="border-b bg-gradient-to-b from-muted/70 to-background" aria-labelledby="division-heading">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 lg:grid-cols-2 lg:px-6 lg:py-20">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Services</p>
            <h1 id="division-heading" className="mt-2 text-balance text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
              {division.name}
            </h1>
            <p className="mt-3 text-lg font-medium text-foreground/80">{division.tagline}</p>
            <p className="mt-4 text-pretty text-muted-foreground">{division.intro}</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link href="/contact">
                  {division.cta}
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/#packages">See packages</Link>
              </Button>
            </div>
          </div>
          <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border shadow-lg">
            {publicFileExists(division.image) ? (
              <Image src={division.image} alt={`${division.name} example visual`} fill priority sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted via-background to-muted">
                <division.icon className="h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Services in this division */}
      <section className="mx-auto max-w-6xl px-4 py-16 lg:px-6" aria-labelledby="division-services-heading">
        <h2 id="division-services-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">What we offer</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {division.services.map(s => (
            <article key={s.title} className="rounded-xl border bg-card p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <s.icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="font-semibold leading-snug">{s.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{s.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Deliverables */}
      <section className="border-y bg-muted/40" aria-labelledby="division-deliverables-heading">
        <div className="mx-auto max-w-6xl px-4 py-14 lg:px-6">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr] lg:gap-14">
            <div>
              <h2 id="division-deliverables-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">
                {division.slug === 'web-development' ? 'What a website project delivers' : 'What a video project delivers'}
              </h2>
              <p className="mt-3 text-muted-foreground">
                Every proposal lists its deliverables explicitly, so you always know exactly what you are getting.
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {division.deliverables.map(d => (
                <li key={d} className="flex items-start gap-2.5 rounded-lg border bg-card p-3.5 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Packages for this division */}
      <section className="mx-auto max-w-6xl px-4 py-16 lg:px-6" aria-labelledby="division-packages-heading">
        <h2 id="division-packages-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">Indicative packages</h2>
        <p className="mt-3 max-w-2xl text-muted-foreground">{site.packages.intro}</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {packages.map(p => (
            <div key={p.name} className="flex flex-col rounded-xl border bg-card p-5">
              <h3 className="font-semibold">{p.name}</h3>
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
        <p className="mt-5 text-xs text-muted-foreground">{site.packages.note}</p>
      </section>

      {/* CTA */}
      <section className="border-t bg-primary text-primary-foreground" aria-labelledby="division-cta-heading">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 py-12 text-center md:flex-row md:text-left lg:px-6">
          <h2 id="division-cta-heading" className="text-2xl font-bold">Have a project in mind?</h2>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button size="lg" variant="secondary" asChild>
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
