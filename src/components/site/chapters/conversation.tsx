'use client'

/**
 * Chapter 06 — START A CONVERSATION.
 * The experience resolves into a clear, inviting final scene: genuine
 * enquiry routes, honest contact details (hidden while placeholders),
 * and login paths for existing clients and staff.
 *
 * Art direction (Gallery & Oxblood, night finale): cinematic dark tokens via
 * tone="night" (ambient glow + grain come with it), a chrome display moment
 * with a serif-italic accent, contact details set as hairline meta rows and
 * login routes as night cards with ember hover.
 */
import { motion, useReducedMotion } from 'framer-motion'
import { LogIn, KeyRound } from 'lucide-react'
import { Magnetic, SlabCTA, CinematicLink } from '@/components/site/buttons'
import { useConfigurator } from '@/components/site/configurator/configurator-store'
import { site, CONTACT_PLACEHOLDERS } from '@/lib/site-content'
import { AccentWord, ChapterSection } from './chapter'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

export function ConversationChapter() {
  const openConfigurator = useConfigurator(s => s.openConfigurator)
  const reduced = useReducedMotion()

  return (
    <ChapterSection
      id="ch-contact"
      num="06"
      title={
        <>
          Start a <AccentWord>conversation</AccentWord>
        </>
      }
      lede="Tell us what you are building. A real person reviews every enquiry and replies within two working days — no chatbots, no obligation, no account needed."
      tone="night"
      className="border-b-0"
    >
      <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
        {/* left — display moment, CTA, honest contact block */}
        <div>
          <motion.h3
            initial={reduced ? false : { opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.8, ease: EASE }}
            className="text-[clamp(1.9rem,4.6vw,3.4rem)] font-extrabold uppercase leading-[1.06] tracking-tight"
          >
            Let&apos;s make something
            <br />
            <span className="chrome-text">
              worth staring at.
            </span>
          </motion.h3>

          <motion.div
            initial={reduced ? false : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.7, delay: 0.08, ease: EASE }}
            className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5"
          >
            <Magnetic>
              <SlabCTA onClick={() => openConfigurator()} data-testid="contact-open-configurator">
                Start a project
              </SlabCTA>
            </Magnetic>
            <span aria-hidden="true" className="hidden h-6 w-px bg-border sm:block" />
            <CinematicLink href="/contact">Use the simple form</CinematicLink>
          </motion.div>

          {/* real contact details — rendered only when genuine values exist */}
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.7, delay: 0.16, ease: EASE }}
            className="mt-12 text-sm"
          >
            {!CONTACT_PLACEHOLDERS.email && (
              <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1 border-t border-border py-4">
                <span className="eyebrow text-muted-foreground/70">Email</span>
                <a
                  href={`mailto:${site.company.email}`}
                  className="text-foreground underline decoration-electric/60 underline-offset-4 transition-colors hover:text-electric"
                >
                  {site.company.email}
                </a>
              </div>
            )}
            {!CONTACT_PLACEHOLDERS.phone && (
              <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1 border-t border-border py-4">
                <span className="eyebrow text-muted-foreground/70">Phone</span>
                <a
                  href={`tel:${site.company.phone.replace(/\s/g, '')}`}
                  className="text-foreground underline decoration-electric/60 underline-offset-4 transition-colors hover:text-electric"
                >
                  {site.company.phone}
                </a>
              </div>
            )}
            {(CONTACT_PLACEHOLDERS.email || CONTACT_PLACEHOLDERS.phone) && (
              <p className="mb-5 rounded-xl border border-border border-l-2 border-l-electric bg-card p-4 text-xs leading-relaxed text-muted-foreground">
                The fastest way to reach us is the project form above — every submission lands in the studio
                inbox and is answered by a person. Direct email and phone details will appear here once our
                public lines are live.
              </p>
            )}
            <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1 border-y border-border py-4">
              <span className="eyebrow text-muted-foreground/70">Where</span>
              <span className="text-foreground/90">{site.company.location}</span>
            </div>
          </motion.div>
        </div>

        {/* right — login routes for existing people */}
        <div className="flex flex-col justify-center gap-4">
          <motion.p
            initial={reduced ? false : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.7, delay: 0.1, ease: EASE }}
            className="eyebrow flex items-center gap-3 text-muted-foreground"
          >
            Already working with us?
            <span aria-hidden="true" className="h-px w-8 bg-electric/50" />
          </motion.p>
          <motion.a
            href="/login"
            data-testid="conversation-client-login"
            initial={reduced ? false : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.7, delay: 0.18, ease: EASE }}
            className="group flex min-h-14 items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 transition-colors duration-300 hover:border-electric/60"
          >
            <span>
              <span className="block text-sm font-semibold">Client login</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">Projects, invoices, reviews & deliveries</span>
            </span>
            <LogIn className="h-4 w-4 shrink-0 text-muted-foreground transition-colors duration-300 group-hover:text-electric" aria-hidden="true" />
          </motion.a>
          <motion.a
            href="/login"
            initial={reduced ? false : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.7, delay: 0.26, ease: EASE }}
            className="group flex min-h-14 items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 transition-colors duration-300 hover:border-electric/60"
          >
            <span>
              <span className="block text-sm font-semibold">Staff login</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">Studio dashboard & CRM</span>
            </span>
            <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground transition-colors duration-300 group-hover:text-electric" aria-hidden="true" />
          </motion.a>
        </div>
      </div>
    </ChapterSection>
  )
}
