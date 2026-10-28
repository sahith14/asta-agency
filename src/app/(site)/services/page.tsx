import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { site } from '@/lib/site-content'

export const metadata: Metadata = {
  title: 'Services',
  description: 'Website & digital services and video production & creative services — delivered by one accountable studio.',
}

export default function ServicesPage() {
  return (
    <>
      <section className="ambient-ivory grain relative overflow-hidden border-b" aria-labelledby="services-page-heading">
        <div className="mx-auto max-w-6xl px-4 py-16 lg:px-6 lg:py-24">
          <p className="eyebrow flex items-center gap-3 text-electric">Services<span className="h-px w-10 bg-electric/60" aria-hidden="true" /></p>
          <h1 id="services-page-heading" className="mt-4 max-w-3xl text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.5rem]">
            Everything your brand needs online — built and filmed by <span className="text-electric">one team</span>
          </h1>
          <p className="mt-6 flex max-w-2xl items-start gap-4 text-pretty text-lg text-muted-foreground">
            <span className="mt-3 hidden h-px w-14 shrink-0 bg-electric/70 sm:block" aria-hidden="true" />
            We keep two divisions under one roof so your website and your video content are planned together, produced professionally and delivered on schedule.
          </p>
        </div>
      </section>

      {site.divisions.map((d, idx) => (
        <section key={d.slug} className={idx % 2 === 1 ? 'border-y bg-secondary/45' : ''} aria-labelledby={`svc-${d.slug}-heading`}>
          <div className="mx-auto max-w-6xl px-4 py-16 lg:px-6 lg:py-20">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="max-w-2xl">
                <p className="eyebrow flex items-center gap-3 text-electric">
                  <span className="text-xs tabular-nums tracking-[0.2em]">{String(idx + 1).padStart(2, '0')}</span>
                  <span className="h-px w-8 bg-electric/50" aria-hidden="true" />
                  Division
                </p>
                <div className="mt-4 flex items-center gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-inset ring-primary/20" aria-hidden="true">
                    <d.icon className="h-5 w-5" />
                  </span>
                  <h2 id={`svc-${d.slug}-heading`} className="text-3xl font-bold tracking-tight sm:text-4xl">{d.name}</h2>
                </div>
                <p className="mt-4 text-pretty leading-[1.8] text-muted-foreground">{d.intro}</p>
              </div>
              <Button variant="outline" size="lg" asChild className="shrink-0">
                <Link href={d.href}>
                  Learn More
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
            <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-border bg-border shadow-[0_25px_70px_-50px_rgba(61,35,22,0.55)] sm:grid-cols-2 lg:grid-cols-3">
              {d.services.map((s, si) => (
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
            <ul className="mt-8 flex flex-wrap gap-x-8 gap-y-2 border-t border-border pt-6">
              {d.deliverables.slice(0, 3).map(dl => (
                <li key={dl} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Check className="h-4 w-4 shrink-0 text-electric" aria-hidden="true" />
                  {dl}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}

      {/* Cinematic night CTA — the light page resolves into the studio's dark room */}
      <section className="night ambient-night grain relative overflow-hidden bg-background text-foreground" aria-labelledby="svc-cta-heading">
        <div className="mx-auto max-w-6xl px-4 py-20 text-center lg:px-6 lg:py-24">
          <p className="eyebrow flex items-center justify-center gap-3 text-muted-foreground">
            Next step<span className="h-px w-10 bg-electric/60" aria-hidden="true" />
          </p>
          <h2 id="svc-cta-heading" className="mx-auto mt-4 max-w-2xl text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
            Not sure which service <span className="text-electric">you need?</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-pretty leading-[1.8] text-muted-foreground">
            Describe your project in plain words — we&apos;ll recommend the right approach and a realistic budget band.
          </p>
          <div className="mt-8">
            <Button size="lg" className="slab shadow-[0_20px_50px_-25px_rgba(208,98,83,0.6)]" asChild>
              <Link href="/contact">
                Discuss Your Project
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}
