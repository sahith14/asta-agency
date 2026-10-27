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
      <section className="border-b bg-gradient-to-b from-muted/70 to-background" aria-labelledby="services-page-heading">
        <div className="mx-auto max-w-6xl px-4 py-14 lg:px-6 lg:py-20">
          <p className="eyebrow flex items-center gap-3 text-electric">Services<span className="h-px w-10 bg-electric/60" aria-hidden="true" /></p>
          <h1 id="services-page-heading" className="mt-2 max-w-3xl text-balance text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            Everything your brand needs online — built and filmed by <em className="editorial font-normal">one team</em>
          </h1>
          <p className="mt-4 max-w-2xl text-pretty text-lg text-muted-foreground">
            We keep two divisions under one roof so your website and your video content are planned together, produced professionally and delivered on schedule.
          </p>
        </div>
      </section>

      {site.divisions.map((d, idx) => (
        <section key={d.slug} className={idx % 2 === 1 ? 'border-y bg-muted/40' : ''} aria-labelledby={`svc-${d.slug}-heading`}>
          <div className="mx-auto max-w-6xl px-4 py-14 lg:px-6 lg:py-16">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <d.icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h2 id={`svc-${d.slug}-heading`} className="text-2xl font-bold tracking-tight sm:text-3xl">{d.name}</h2>
                <p className="mt-2 text-muted-foreground">{d.intro}</p>
              </div>
              <Button variant="outline" asChild>
                <Link href={d.href} className="shrink-0">
                  Learn More
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {d.services.map(s => (
                <article key={s.title} className="rounded-xl border bg-card p-5">
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <s.icon className="h-4.5 w-4.5" aria-hidden="true" />
                  </div>
                  <h3 className="font-semibold leading-snug">{s.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{s.body}</p>
                </article>
              ))}
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
              {d.deliverables.slice(0, 3).map(dl => (
                <li key={dl} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  {dl}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}

      <section className="mx-auto max-w-6xl px-4 py-16 lg:px-6" aria-labelledby="svc-cta-heading">
        <div className="rounded-2xl border bg-card p-8 text-center">
          <h2 id="svc-cta-heading" className="text-2xl font-bold tracking-tight">Not sure which service you need?</h2>
          <p className="mx-auto mt-2 max-w-xl text-muted-foreground">
            Describe your project in plain words — we&apos;ll recommend the right approach and a realistic budget band.
          </p>
          <Button size="lg" className="mt-6" asChild>
            <Link href="/contact">
              Discuss Your Project
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </section>
    </>
  )
}
