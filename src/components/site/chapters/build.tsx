'use client'

/**
 * Chapter 05 — BUILD A PROJECT.
 * Entry point to the genuine project configurator, the real process summary
 * and indicative packages (only verified pricing shown, honestly labelled).
 *
 * Art direction (Gallery & Oxblood, taupe atelier band): the configurator
 * entry is the hero of the chapter — a chalk card floating on the taupe wash
 * over soft champagne/oxblood ambient ellipses, with the seven brief steps
 * set as a hairline spine of oxblood number medallions. The process reads as
 * numbered hairline plates; packages are two contrasting cards (chalk vs
 * oxblood-tinted frame, the only verified price in oxblood).
 */
import { motion, useReducedMotion } from 'framer-motion'
import { Check } from 'lucide-react'
import { Magnetic, SlabCTA, CinematicLink } from '@/components/site/buttons'
import { useConfigurator } from '@/components/site/configurator/configurator-store'
import { site } from '@/lib/site-content'
import { AccentWord, ChapterSection } from './chapter'

const CONFIGURATOR_STEPS = [
  'Choose your service',
  'Define the goal',
  'Set the scope',
  'Budget & timing',
  'Describe the project',
  'Leave your contact',
  'Review & send',
] as const

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

export function BuildChapter() {
  const openConfigurator = useConfigurator(s => s.openConfigurator)
  const reduced = useReducedMotion()

  return (
    <ChapterSection
      id="ch-build"
      num="05"
      title={
        <>
          Build a <AccentWord>project</AccentWord>
        </>
      }
      lede="Shape your brief in the project configurator — seven quick steps, no account, no obligation. It lands directly in our studio inbox with every detail you chose."
      tone="taupe"
    >
      {/* ── Configurator entry — the hero of the chapter ───────────────────── */}
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.8, ease: EASE }}
        className="relative"
      >
        {/* soft ambient ellipses floating the chalk card on the taupe wash */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-16 left-1/2 h-72 w-[min(44rem,94%)] -translate-x-1/2 rounded-full bg-champagne/60 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-20 right-0 h-56 w-[min(26rem,70%)] rounded-full bg-electric/10 blur-3xl"
        />

        <div className="relative rounded-3xl border border-border bg-card p-7 shadow-[0_30px_80px_-40px_rgba(61,35,22,0.35)] sm:p-10 lg:p-12">
          <p className="eyebrow flex items-center gap-3 text-electric">
            The configurator
            <span aria-hidden="true" className="h-px w-10 bg-electric/60" />
          </p>

          <div className="mt-8 grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-x-14 lg:gap-y-8">
            {/* display heading — oxblood accent on the last word */}
            <div>
              <h3 className="text-[clamp(1.75rem,3.4vw,2.6rem)] font-extrabold leading-[1.08] tracking-tight">
                Build your brief like a <span className="text-electric">product</span>
              </h3>
            </div>

            {/* the seven steps — mono numbers in oxblood circles on a hairline spine */}
            <div className="relative self-start lg:row-span-2">
              <span aria-hidden="true" className="absolute bottom-4 left-[15px] top-4 w-px bg-border" />
              <ol className="space-y-5">
                {CONFIGURATOR_STEPS.map((s, i) => (
                  <motion.li
                    key={s}
                    initial={reduced ? false : { opacity: 0, x: -12 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: '-60px' }}
                    transition={{ duration: 0.6, delay: i * 0.05, ease: EASE }}
                    className="relative flex items-center gap-4"
                  >
                    <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-electric font-mono text-[0.62rem] text-[var(--accent-ink)] ring-4 ring-card">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="text-sm text-muted-foreground">{s}</span>
                  </motion.li>
                ))}
              </ol>
            </div>

            {/* CTA row + honest CRM footnote */}
            <div className="flex flex-col justify-end">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <Magnetic>
                  <SlabCTA onClick={() => openConfigurator()} data-testid="build-open-configurator">
                    Open the configurator
                  </SlabCTA>
                </Magnetic>
                <CinematicLink href="/contact">Prefer a simple form?</CinematicLink>
              </div>
              <p className="mt-7 border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground">
                Every enquiry is validated, spam-protected and saved to our studio CRM — a real person replies within two working days.
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Process — six numbered hairline plates ─────────────────────────── */}
      <div className="mt-16">
        <p className="eyebrow flex scroll-mt-24 items-center gap-3 text-muted-foreground" id="process">
          How a project runs
          <span aria-hidden="true" className="h-px w-8 bg-electric/50" />
        </p>
        <div className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {site.process.steps.slice(0, 6).map((step, i) => (
            <motion.div
              key={step.n}
              initial={reduced ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.6, delay: i * 0.05, ease: EASE }}
              className="bg-card p-5"
            >
              <div className="flex items-center justify-between">
                <p className="font-mono text-[0.65rem] tracking-[0.2em] text-electric">{String(step.n).padStart(2, '0')}</p>
                <span aria-hidden="true" className="h-px w-6 bg-border" />
              </div>
              <h4 className="mt-3 text-sm font-semibold leading-snug">{step.title}</h4>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── Indicative packages — real data, honest labels ─────────────────── */}
      <div className="mt-16">
        <p className="eyebrow flex scroll-mt-24 items-center gap-3 text-muted-foreground" id="packages">
          Indicative packages
          <span aria-hidden="true" className="h-px w-8 bg-electric/50" />
        </p>
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          {/* card A — chalk & hairline */}
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.7, delay: 0, ease: EASE }}
            className="rounded-2xl border border-border bg-card p-6"
          >
            <h4 className="text-base font-bold">{site.packages.web[0].name}</h4>
            <p className="mt-1 text-xs text-muted-foreground">{site.packages.web[0].forWhom}</p>
            <ul className="mt-4 space-y-2">
              {site.packages.web[0].includes.slice(0, 3).map(i => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Check className="mt-0.5 h-3 w-3 shrink-0 text-electric" aria-hidden="true" />
                  {i}
                </li>
              ))}
            </ul>
            <p className="mt-5 border-t border-border pt-4 text-sm font-semibold">{site.packages.web[0].price}</p>
          </motion.div>

          {/* card B — oxblood-tinted frame, the one verified price in oxblood */}
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.7, delay: 0.08, ease: EASE }}
            className="rounded-2xl border border-electric/40 bg-card p-6"
          >
            <h4 className="text-base font-bold">{site.packages.video[0].name}</h4>
            <p className="mt-1 text-xs text-muted-foreground">{site.packages.video[0].forWhom}</p>
            <ul className="mt-4 space-y-2">
              {site.packages.video[0].includes.slice(0, 3).map(i => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Check className="mt-0.5 h-3 w-3 shrink-0 text-electric" aria-hidden="true" />
                  {i}
                </li>
              ))}
            </ul>
            <p className="mt-5 border-t border-border pt-4 text-sm font-semibold text-electric">{site.packages.video[0].price}</p>
            <p className="mt-1.5 text-[0.65rem] text-muted-foreground">Indicative — confirmed in a written proposal.</p>
          </motion.div>
        </div>
        <p className="mt-6 border-t border-border pt-4 text-[0.7rem] leading-relaxed text-muted-foreground">{site.packages.note}</p>
      </div>
    </ChapterSection>
  )
}
