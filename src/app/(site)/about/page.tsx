import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Target, HeartHandshake, Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { publicFileExists } from '@/lib/site-media'
import { site } from '@/lib/site-content'

export const metadata: Metadata = {
  title: 'About Us',
  description: 'ASTA AGENCY is a two-division creative studio — websites and video produced by one accountable team, built around long-term client relationships.',
}

const VALUE_ICONS = [Target, HeartHandshake, Compass]

export default function AboutPage() {
  return (
    <>
      {/* Editorial masthead — oversized display type over warm ivory */}
      <section className="ambient-ivory grain relative overflow-hidden border-b" aria-labelledby="about-heading">
        <div className="mx-auto max-w-6xl px-4 py-16 lg:px-6 lg:py-24">
          <span className="ghost-num pointer-events-none absolute -right-4 bottom-0 hidden select-none font-display text-[11rem] font-extrabold leading-none lg:block" aria-hidden="true">01</span>
          <p className="eyebrow flex items-center gap-3 text-electric">About us<span className="h-px w-10 bg-electric/60" aria-hidden="true" /></p>
          <h1 id="about-heading" className="mt-4 max-w-3xl text-balance text-4xl font-extrabold leading-[1.04] tracking-tight sm:text-5xl lg:text-[3.75rem]">
            {site.about.heading}
          </h1>
          <p className="mt-6 flex max-w-2xl items-start gap-4 text-pretty text-lg text-muted-foreground">
            <span className="mt-3 hidden h-px w-14 shrink-0 bg-electric/70 sm:block" aria-hidden="true" />
            {site.company.foundedLine}
          </p>
        </div>
      </section>

      {/* Story — text column beside a framed plate */}
      <section className="mx-auto max-w-6xl px-4 py-16 lg:px-6 lg:py-24" aria-labelledby="about-story-heading">
        <div className="grid items-start gap-12 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
          <div>
            <p className="eyebrow flex items-center gap-3 text-muted-foreground">Our story<span className="h-px w-8 bg-border" aria-hidden="true" /></p>
            <h2 id="about-story-heading" className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              One team, <span className="text-electric">both crafts</span>
            </h2>
            {site.about.story.map((p, i) => (
              <p key={i} className="mt-5 text-pretty leading-[1.8] text-muted-foreground">{p}</p>
            ))}
            <div className="mt-9 border-l-2 border-electric bg-card p-6 shadow-[0_20px_50px_-35px_rgba(61,35,22,0.5)]">
              <h3 className="eyebrow flex items-center gap-2.5 text-foreground">
                <Target className="h-4 w-4 text-electric" aria-hidden="true" /> Our mission
              </h3>
              <p className="mt-3 text-pretty leading-[1.8] text-foreground/90">{site.about.mission}</p>
            </div>
          </div>
          <div className="lg:sticky lg:top-24">
            <div className="relative">
              {/* Layered plate behind the photograph */}
              <div className="absolute -left-3 -top-3 h-full w-full rounded-2xl border border-border bg-blush/40" aria-hidden="true" />
              <div className="absolute -bottom-3 -right-3 h-full w-full rounded-2xl bg-champagne/45" aria-hidden="true" />
              <div className="relative aspect-[16/11] overflow-hidden rounded-2xl border border-border shadow-[0_35px_90px_-45px_rgba(61,35,22,0.55)] ring-1 ring-inset ring-foreground/5">
                {publicFileExists('/images/site/about-studio.jpg') ? (
                  <Image src="/images/site/about-studio.jpg" alt="Inside the studio: storyboards on the wall and camera equipment ready for a shoot" fill sizes="(max-width: 1024px) 100vw, 45vw" className="object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted via-background to-muted">
                    <span className="text-sm text-muted-foreground">Studio photo placeholder</span>
                  </div>
                )}
              </div>
              <p className="mt-5 flex items-center gap-3 text-[0.6875rem] uppercase tracking-[0.28em] text-muted-foreground" aria-hidden="true">
                <span className="h-px w-8 bg-electric/60" /> Inside the studio
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Values — indexed hairline plate, not floating cards */}
      <section className="border-y bg-secondary/45" aria-labelledby="about-values-heading">
        <div className="mx-auto max-w-6xl px-4 py-16 lg:px-6 lg:py-20">
          <p className="eyebrow flex items-center gap-3 text-muted-foreground">What we value<span className="h-px w-8 bg-border" aria-hidden="true" /></p>
          <h2 id="about-values-heading" className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            How the studio <span className="text-electric">thinks</span>
          </h2>
          <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-border bg-border shadow-[0_25px_70px_-50px_rgba(61,35,22,0.55)] sm:grid-cols-2 lg:grid-cols-4">
            {site.about.values.map((v, i) => {
              const Icon = VALUE_ICONS[i % VALUE_ICONS.length]
              return (
                <article key={v.title} className="group bg-card p-6 transition-colors hover:bg-background">
                  <div className="flex items-center justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground" aria-hidden="true">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="text-xs tabular-nums tracking-[0.2em] text-muted-foreground/70">{String(i + 1).padStart(2, '0')}</span>
                  </div>
                  <h3 className="mt-5 font-display text-base font-bold leading-snug">{v.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{v.body}</p>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      {/* Approach — split composition with indexed plates */}
      <section className="mx-auto max-w-6xl px-4 py-16 lg:px-6 lg:py-24" aria-labelledby="about-approach-heading">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="eyebrow flex items-center gap-3 text-muted-foreground">Our approach<span className="h-px w-8 bg-border" aria-hidden="true" /></p>
            <h2 id="about-approach-heading" className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Deliberate, <span className="text-electric">visible</span> work
            </h2>
            <p className="mt-5 text-pretty leading-[1.8] text-muted-foreground">{site.about.approach}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="slab">
                <Link href="/contact">Discuss Your Project <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></Link>
              </Button>
              <Button variant="outline" size="lg" asChild className="slab slab-soft">
                <Link href="/portfolio">See our work</Link>
              </Button>
            </div>
          </div>
          <dl className="grid content-start gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2">
            {site.intro.whyUs.map((w, i) => (
              <div key={w.title} className="bg-card p-6">
                <span className="text-xs tabular-nums tracking-[0.2em] text-electric" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                <dt className="mt-3 font-display font-bold">{w.title}</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{w.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </>
  )
}
