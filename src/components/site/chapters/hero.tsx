'use client'

/**
 * Chapter 01 — ENTER THE STUDIO.
 * Overlay composition for the 3D monolith scene: cinematic headline,
 * dual CTA route (journey vs genuine enquiry), scroll cue. The 3D canvas
 * renders behind this chapter; copy stays readable via the scene vignette.
 */
import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Magnetic, LiquidCTA } from '@/components/site/buttons'
import { scrollToId } from '@/lib/site/motion'
import { useConfigurator } from '@/components/site/configurator/configurator-store'
import { site } from '@/lib/site-content'

const MARQUEE = [
  'Websites', 'E-commerce', 'Web apps', 'Client portals', 'Brand films',
  'Social reels', 'Product & food content', 'Property films', 'Care plans',
]

export function HeroChapter() {
  const openConfigurator = useConfigurator(s => s.openConfigurator)
  const reduced = useReducedMotion()
  const [loaded, setLoaded] = useState(false)
  const mounted = useRef(false)

  useEffect(() => {
    if (mounted.current) return
    mounted.current = true
    const t = requestAnimationFrame(() => setLoaded(true))
    return () => cancelAnimationFrame(t)
  }, [])

  const ease: [number, number, number, number] = [0.22, 1, 0.36, 1]
  const show = (delay: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 26 },
          animate: loaded ? { opacity: 1, y: 0 } : {},
          transition: { duration: 0.9, delay, ease },
        }

  return (
    <section
      id="ch-hero"
      aria-label="Enter the studio"
      className="grain relative flex min-h-[100svh] flex-col overflow-hidden"
    >
      {/* mobile: dim the scene behind the copy for reliable contrast */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/25 to-black/55 lg:hidden" aria-hidden="true" />
      {/* desktop: left-edge scrim grounds the copy while the monolith stays clear */}
      <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-[68%] bg-gradient-to-r from-black/65 via-black/30 to-transparent lg:block" aria-hidden="true" />
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center px-5 pb-28 pt-28 sm:px-8 lg:px-12">
        <motion.p {...show(0.1)} className="eyebrow text-electric">
          {site.company.name} — Website &amp; digital · Video production
        </motion.p>

        <motion.h1
          {...show(0.25)}
          className="mt-6 max-w-6xl text-[clamp(2.1rem,5.6vw,4.5rem)] font-extrabold uppercase leading-[1.04] tracking-tight [text-wrap:balance]"
          data-testid="hero-heading"
        >
          We make digital
          <br />
          <span className="chrome-text">feel different.</span>
        </motion.h1>

        <motion.p {...show(0.45)} className="mt-7 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
          Immersive websites. Cinematic video. Digital experiences built to make
          brands impossible to ignore — one studio for both crafts.
        </motion.p>

        <motion.div {...show(0.6)} className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
          <Magnetic>
            <LiquidCTA onClick={() => scrollToId('ch-work')} data-testid="hero-explore">
              Explore the studio
            </LiquidCTA>
          </Magnetic>
          <Magnetic>
            <LiquidCTA
              variant="outline"
              onClick={() => openConfigurator()}
              data-testid="hero-start-project"
            >
              Start a project
            </LiquidCTA>
          </Magnetic>
          <span className="text-xs text-muted-foreground/80 sm:ml-2">
            No account needed to browse.
          </span>
        </motion.div>
      </div>

      {/* scroll cue */}
      <motion.div
        {...show(1.0)}
        className="pointer-events-none absolute bottom-20 left-1/2 z-10 -translate-x-1/2"
        aria-hidden="true"
      >
        <div className="flex flex-col items-center gap-3">
          <span className="eyebrow text-muted-foreground">Scroll · 01/06</span>
          <span className="relative h-12 w-px overflow-hidden bg-border">
            <span className="scroll-drip absolute inset-x-0 top-0 h-1/2 bg-electric" />
          </span>
        </div>
      </motion.div>

      {/* capability marquee — editorial divider */}
      <div className="relative z-10 border-y border-border/60 bg-black/30 py-3 backdrop-blur-[2px]">
        <div className="flex overflow-hidden" aria-hidden="true">
          <div className="marquee-track flex shrink-0 items-center gap-8 pr-8">
            {[...MARQUEE, ...MARQUEE].map((m, i) => (
              <span key={i} className="eyebrow flex items-center gap-8 text-muted-foreground">
                {m}
                <span className="h-1 w-1 rounded-full bg-electric/70" />
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
