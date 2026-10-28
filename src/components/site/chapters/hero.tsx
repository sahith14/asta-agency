'use client'

/**
 * Chapter 01 — ENTER THE STUDIO (night cinematic opening).
 *
 * Art direction (AESTH-3): a controlled kinetic composition layered over the
 * 3D monolith — overflow-hidden per-line headline reveal (line 2 in chrome,
 * fully bold Syne), eyebrow metadata with hairline
 * annotation, a hairline-divided CTA pair with the primary action visually
 * dominant, a thin oxblood rule over the lede, polished scroll cue and an
 * airier ember-dot capability marquee with hairline top border. A corner
 * metadata layer carries a gentle ±10px pointer parallax (fine pointers
 * only; touch / reduced motion get a static, transform-free fallback). The
 * 3D canvas (z-1) paints above this section's dark base but below all copy
 * (z-10); the scrims below keep type readable over the scene. The `.night`
 * token flip keeps this section cinematic-dark while the rest of the site
 * is ivory editorial.
 */
import { useEffect, useRef, useState } from 'react'
import { motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion'
import { Magnetic, SlabCTA } from '@/components/site/buttons'
import { scrollToId } from '@/lib/site/motion'
import { useConfigurator } from '@/components/site/configurator/configurator-store'
import { site } from '@/lib/site-content'

const MARQUEE = [
  'Websites', 'E-commerce', 'Web apps', 'Client portals', 'Brand films',
  'Social reels', 'Product & food content', 'Property films', 'Care plans',
]

/**
 * Gentle corner parallax — max ±10px. An rAF-throttled pointermove feeds
 * spring-smoothed MotionValues. Fine pointers only; touch and reduced
 * motion stay fully static (no transform is applied at all).
 */
function useCornerParallax(reduced: boolean | null) {
  const rawX = useMotionValue(0)
  const rawY = useMotionValue(0)
  const px = useSpring(rawX, { stiffness: 55, damping: 18, mass: 0.6 })
  const py = useSpring(rawY, { stiffness: 55, damping: 18, mass: 0.6 })
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    if (reduced) {
      const t = requestAnimationFrame(() => setEnabled(false))
      return () => cancelAnimationFrame(t)
    }
    const fine = window.matchMedia('(pointer: fine)')
    const update = () => {
      const on = fine.matches
      setEnabled(on)
      if (!on) {
        rawX.set(0)
        rawY.set(0)
      }
    }
    // defer the first read out of the effect body (no synchronous setState)
    const t = requestAnimationFrame(update)
    fine.addEventListener?.('change', update)
    return () => {
      cancelAnimationFrame(t)
      fine.removeEventListener?.('change', update)
    }
  }, [reduced, rawX, rawY])

  useEffect(() => {
    if (!enabled) return
    let raf = 0
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        rawX.set(((e.clientX / window.innerWidth) * 2 - 1) * 10)
        rawY.set(((e.clientY / window.innerHeight) * 2 - 1) * 10)
      })
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(raf)
    }
  }, [enabled, rawX, rawY])

  return { px, py, enabled }
}

export function HeroChapter() {
  const openConfigurator = useConfigurator(s => s.openConfigurator)
  const reduced = useReducedMotion()
  const parallax = useCornerParallax(reduced)
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
  // Opacity-only entrance for the parallax layer (its x/y are MotionValues).
  const fade = (delay: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0 },
          animate: loaded ? { opacity: 1 } : {},
          transition: { duration: 1, delay, ease },
        }
  // Kinetic line reveal — slides up from below its overflow-hidden wrapper.
  const line = (delay: number) =>
    reduced
      ? { initial: false, animate: { y: '0%' } }
      : {
          initial: { y: '110%' },
          animate: loaded ? { y: '0%' } : { y: '110%' },
          transition: { duration: 1.05, delay, ease },
        }

  return (
    <section
      id="ch-hero"
      aria-label="Enter the studio"
      className="night grain relative flex min-h-[100svh] flex-col overflow-hidden bg-background text-foreground"
    >
      {/* mobile: dim the scene behind the copy for reliable contrast */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/25 to-black/55 lg:hidden" aria-hidden="true" />
      {/* desktop: left-edge scrim grounds the copy while the monolith stays clear */}
      <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-[68%] bg-gradient-to-r from-black/65 via-black/30 to-transparent lg:block" aria-hidden="true" />

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center px-5 pb-28 pt-28 sm:px-8 lg:px-12">
        <motion.p {...show(0.1)} className="eyebrow flex items-center gap-3 text-electric">
          <span aria-hidden="true" className="h-px w-10 bg-electric/60" />
          {site.company.name} — Website &amp; digital · Video production
        </motion.p>

        {/* Kinetic headline — two masked lines, staggered. Mobile floor keeps
            Syne's wide metrics inside 390px; ≥480px steps up to the editorial
            clamp; lg:pr-44 clears the fixed chapter rail on the right edge. */}
        <h1
          data-testid="hero-heading"
          className="mt-6 max-w-6xl text-[clamp(2.1rem,6.5vw,5.2rem)] font-extrabold uppercase leading-[1.04] tracking-tight min-[480px]:text-[clamp(2.4rem,6.5vw,5.2rem)] lg:pr-44"
        >
          <span className="block overflow-hidden">
            <motion.span {...line(0.3)} className="block">
              We make digital
            </motion.span>
          </span>
          <span className="block overflow-hidden">
            <motion.span {...line(0.44)} className="block chrome-text">
              feel different.
            </motion.span>
          </span>
        </h1>

        <motion.p
          {...show(0.62)}
          className="mt-9 max-w-xl text-pretty text-base leading-[1.75] text-muted-foreground sm:text-lg"
        >
          <span aria-hidden="true" className="mb-5 block h-px w-14 bg-electric/80" />
          Immersive websites. Cinematic video. Digital experiences built to make
          brands impossible to ignore — one studio for both crafts.
        </motion.p>

        <motion.div
          {...show(0.78)}
          className="mt-10 flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-x-6 sm:gap-y-4"
        >
          <Magnetic strength={0.32}>
            <SlabCTA onClick={() => scrollToId('ch-work')} data-testid="hero-explore" className="px-8">
              Explore the studio
            </SlabCTA>
          </Magnetic>
          <span aria-hidden="true" className="hidden h-9 w-px bg-border/80 sm:block" />
          <Magnetic strength={0.26}>
            <SlabCTA
              variant="outline"
              onClick={() => openConfigurator()}
              data-testid="hero-start-project"
              className="text-muted-foreground/90"
            >
              Start a project
            </SlabCTA>
          </Magnetic>
          <span className="eyebrow text-muted-foreground/80 sm:ml-1 sm:max-w-44 sm:leading-[1.9]">
            No account needed to browse.
          </span>
        </motion.div>
      </div>

      {/* corner metadata — hairline annotation stack, gentle pointer parallax;
          gated to ≥lg width AND ≥720px height so it never crowds the CTA row
          on short windows (degrades to hidden, static layout elsewhere) */}
      <motion.div
        {...fade(1.15)}
        style={parallax.enabled ? { x: parallax.px, y: parallax.py } : undefined}
        className="pointer-events-none absolute bottom-24 left-12 z-10 hidden [@media(min-width:1024px)_and_(min-height:720px)]:block"
        aria-hidden="true"
      >
        <div className="flex flex-col gap-3">
          <span className="eyebrow flex items-center gap-3 text-muted-foreground/85">
            <span aria-hidden="true" className="h-px w-9 bg-border" />
            Digital experiences
          </span>
          <span className="eyebrow flex items-center gap-3 text-muted-foreground/85">
            <span aria-hidden="true" className="h-px w-9 bg-border" />
            Film &amp; visual production
          </span>
        </div>
      </motion.div>

      {/* scroll cue */}
      <motion.div
        {...show(1.05)}
        className="pointer-events-none absolute bottom-20 left-1/2 z-10 -translate-x-1/2"
        aria-hidden="true"
      >
        <div className="flex flex-col items-center gap-3.5">
          <span className="eyebrow text-muted-foreground/85">Scroll · 01/06</span>
          <span className="relative h-14 w-px overflow-hidden bg-border/80">
            <span className="scroll-drip absolute inset-x-0 top-0 h-1/2 bg-electric" />
          </span>
        </div>
      </motion.div>

      {/* capability marquee — editorial divider (hairline top, ember dots) */}
      <motion.div
        {...show(0.95)}
        className="relative z-10 border-t border-border/70 bg-black/30 py-3.5 backdrop-blur-[2px]"
      >
        <div
          className="flex overflow-hidden [-webkit-mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)] [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]"
          aria-hidden="true"
        >
          <div className="marquee-track flex shrink-0 items-center gap-8 pr-8">
            {[...MARQUEE, ...MARQUEE].map((m, i) => (
              <span key={i} className="eyebrow flex items-center gap-8 text-muted-foreground">
                {m}
                <span aria-hidden="true" className="h-1 w-1 rounded-full bg-electric/80" />
              </span>
            ))}
          </div>
        </div>
      </motion.div>
    </section>
  )
}
