'use client'

/**
 * Chapter 05 — BUILD A PROJECT.
 * Entry point to the genuine project configurator, the real process summary
 * and indicative packages (only verified pricing shown, honestly labelled).
 */
import { motion, useReducedMotion } from 'framer-motion'
import { Check } from 'lucide-react'
import { Magnetic, LiquidCTA, CinematicLink } from '@/components/site/buttons'
import { useConfigurator } from '@/components/site/configurator/configurator-store'
import { site } from '@/lib/site-content'
import { ChapterSection } from './chapter'

export function BuildChapter() {
  const openConfigurator = useConfigurator(s => s.openConfigurator)
  const reduced = useReducedMotion()

  return (
    <ChapterSection
      id="ch-build"
      num="05"
      title="Build a project"
      lede="Shape your brief in the project configurator — seven quick steps, no account, no obligation. It lands directly in our studio inbox with every detail you chose."
      tone="solid"
    >
      <div className="grid gap-14 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="rounded-2xl border border-border bg-card p-7 sm:p-9">
            <p className="eyebrow text-electric">The configurator</p>
            <h3 className="mt-3 text-2xl font-bold sm:text-3xl">Build your brief like a product</h3>
            <ol className="mt-6 space-y-3">
              {['Choose your service', 'Define the goal', 'Set the scope', 'Budget & timing', 'Describe the project', 'Leave your contact', 'Review & send'].map((s, i) => (
                <li key={s} className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border font-mono text-[0.6rem] text-electric">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {s}
                </li>
              ))}
            </ol>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Magnetic>
                <LiquidCTA onClick={() => openConfigurator()} data-testid="build-open-configurator">
                  Open the configurator
                </LiquidCTA>
              </Magnetic>
              <CinematicLink href="/contact">Prefer a simple form?</CinematicLink>
            </div>
            <p className="mt-5 text-xs text-muted-foreground">
              Every enquiry is validated, spam-protected and saved to our studio CRM — a real person replies within two working days.
            </p>
          </div>
        </motion.div>

        <div>
          {/* process */}
          <p className="eyebrow scroll-mt-24 text-muted-foreground" id="process">
            How a project runs
          </p>
          <div className="mt-5 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2">
            {site.process.steps.slice(0, 6).map(step => (
              <div key={step.n} className="bg-card p-4">
                <p className="font-mono text-[0.65rem] text-electric">{String(step.n).padStart(2, '0')}</p>
                <h4 className="mt-1.5 text-sm font-semibold">{step.title}</h4>
              </div>
            ))}
          </div>

          {/* indicative packages — real data, honest labels */}
          <p className="eyebrow mt-10 scroll-mt-24 text-muted-foreground" id="packages">
            Indicative packages
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-5">
              <h4 className="text-sm font-bold">{site.packages.web[0].name}</h4>
              <p className="mt-1 text-xs text-muted-foreground">{site.packages.web[0].forWhom}</p>
              <ul className="mt-3 space-y-1.5">
                {site.packages.web[0].includes.slice(0, 3).map(i => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-electric" aria-hidden="true" />
                    {i}
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-t border-border pt-3 text-sm font-semibold">{site.packages.web[0].price}</p>
            </div>
            <div className="rounded-2xl border border-electric/40 bg-card p-5">
              <h4 className="text-sm font-bold">{site.packages.video[0].name}</h4>
              <p className="mt-1 text-xs text-muted-foreground">{site.packages.video[0].forWhom}</p>
              <ul className="mt-3 space-y-1.5">
                {site.packages.video[0].includes.slice(0, 3).map(i => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-electric" aria-hidden="true" />
                    {i}
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-t border-border pt-3 text-sm font-semibold text-electric">{site.packages.video[0].price}</p>
              <p className="mt-1 text-[0.65rem] text-muted-foreground">Indicative — confirmed in a written proposal.</p>
            </div>
          </div>
          <p className="mt-4 text-[0.7rem] text-muted-foreground">{site.packages.note}</p>
        </div>
      </div>
    </ChapterSection>
  )
}
