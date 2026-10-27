import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Target, HeartHandshake, Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { publicFileExists } from '@/lib/site-media'
import { site } from '@/lib/site-content'

export const metadata: Metadata = {
  title: 'About Us',
  description: 'ASTAS agency is a two-division creative studio — websites and video produced by one accountable team, built around long-term client relationships.',
}

const VALUE_ICONS = [Target, HeartHandshake, Compass]

export default function AboutPage() {
  return (
    <>
      <section className="border-b bg-gradient-to-b from-muted/70 to-background" aria-labelledby="about-heading">
        <div className="mx-auto max-w-6xl px-4 py-14 lg:px-6 lg:py-20">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">About us</p>
          <h1 id="about-heading" className="mt-2 max-w-3xl text-balance text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            {site.about.heading}
          </h1>
          <p className="mt-4 max-w-2xl text-pretty text-lg text-muted-foreground">{site.company.foundedLine}</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 lg:px-6 lg:py-20" aria-labelledby="about-story-heading">
        <div className="grid items-start gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
          <div>
            <h2 id="about-story-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">Our story</h2>
            {site.about.story.map((p, i) => (
              <p key={i} className="mt-4 text-pretty text-muted-foreground">{p}</p>
            ))}
            <div className="mt-8 rounded-xl border-l-4 border-primary bg-muted/50 p-5">
              <h3 className="flex items-center gap-2 font-semibold">
                <Target className="h-4 w-4 text-primary" aria-hidden="true" /> Our mission
              </h3>
              <p className="mt-2 text-pretty text-foreground/90">{site.about.mission}</p>
            </div>
          </div>
          <div className="lg:sticky lg:top-24">
            <div className="relative aspect-[16/11] overflow-hidden rounded-2xl border shadow-lg">
              {publicFileExists('/images/site/about-studio.jpg') ? (
                <Image src="/images/site/about-studio.jpg" alt="Inside the studio: storyboards on the wall and camera equipment ready for a shoot" fill sizes="(max-width: 1024px) 100vw, 45vw" className="object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted via-background to-muted">
                  <span className="text-sm text-muted-foreground">Studio photo placeholder</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="border-y bg-muted/40" aria-labelledby="about-values-heading">
        <div className="mx-auto max-w-6xl px-4 py-14 lg:px-6 lg:py-16">
          <h2 id="about-values-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">What we value</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {site.about.values.map((v, i) => {
              const Icon = VALUE_ICONS[i % VALUE_ICONS.length]
              return (
                <article key={v.title} className="rounded-xl border bg-card p-5">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="font-semibold">{v.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{v.body}</p>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 lg:px-6 lg:py-20" aria-labelledby="about-approach-heading">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-14">
          <div>
            <h2 id="about-approach-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">Our approach</h2>
            <p className="mt-4 text-pretty text-muted-foreground">{site.about.approach}</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button asChild>
                <Link href="/contact">Discuss Your Project <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/portfolio">See our work</Link>
              </Button>
            </div>
          </div>
          <dl className="grid gap-4 sm:grid-cols-2">
            {site.intro.whyUs.map(w => (
              <div key={w.title} className="rounded-xl border bg-card p-5">
                <dt className="font-semibold">{w.title}</dt>
                <dd className="mt-1.5 text-sm text-muted-foreground">{w.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </>
  )
}
