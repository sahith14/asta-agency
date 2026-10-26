'use client'

/**
 * Chapter 06 — START A CONVERSATION.
 * The experience resolves into a clear, inviting final scene: genuine
 * enquiry routes, honest contact details (hidden while placeholders),
 * and login paths for existing clients and staff.
 */
import { motion, useReducedMotion } from 'framer-motion'
import { LogIn, KeyRound } from 'lucide-react'
import { Magnetic, LiquidCTA, CinematicLink } from '@/components/site/buttons'
import { useConfigurator } from '@/components/site/configurator/configurator-store'
import { site, CONTACT_PLACEHOLDERS } from '@/lib/site-content'
import { ChapterSection } from './chapter'

export function ConversationChapter() {
  const openConfigurator = useConfigurator(s => s.openConfigurator)
  const reduced = useReducedMotion()

  return (
    <ChapterSection
      id="ch-contact"
      num="06"
      title="Start a conversation"
      lede="Tell us what you are building. A real person reviews every enquiry and replies within two working days — no chatbots, no obligation, no account needed."
      tone="solid"
      className="border-b-0"
    >
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="grid gap-12 lg:grid-cols-[1.2fr_1fr] lg:gap-16"
      >
        <div>
          <h3 className="text-[clamp(1.8rem,4.5vw,3.2rem)] font-extrabold uppercase leading-[1.05]">
            Let&apos;s make something
            <br />
            <span className="chrome-text">worth staring at.</span>
          </h3>
          <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:items-center">
            <Magnetic>
              <LiquidCTA onClick={() => openConfigurator()} data-testid="contact-open-configurator">
                Start a project
              </LiquidCTA>
            </Magnetic>
            <CinematicLink href="/contact">Use the simple form</CinematicLink>
          </div>

          {/* real contact details — rendered only when genuine values exist */}
          <div className="mt-10 space-y-3 text-sm">
            {!CONTACT_PLACEHOLDERS.email && (
              <p className="text-muted-foreground">
                <span className="eyebrow mr-3 text-muted-foreground/70">Email</span>
                <a href={`mailto:${site.company.email}`} className="text-foreground underline decoration-electric/60 underline-offset-4 hover:text-electric">
                  {site.company.email}
                </a>
              </p>
            )}
            {!CONTACT_PLACEHOLDERS.phone && (
              <p className="text-muted-foreground">
                <span className="eyebrow mr-3 text-muted-foreground/70">Phone</span>
                <a href={`tel:${site.company.phone.replace(/\s/g, '')}`} className="text-foreground underline decoration-electric/60 underline-offset-4 hover:text-electric">
                  {site.company.phone}
                </a>
              </p>
            )}
            {(CONTACT_PLACEHOLDERS.email || CONTACT_PLACEHOLDERS.phone) && (
              <p className="rounded-xl border border-border bg-card/60 p-4 text-xs leading-relaxed text-muted-foreground">
                The fastest way to reach us is the project form above — every submission lands in the studio
                inbox and is answered by a person. Direct email and phone details will appear here once our
                public lines are live.
              </p>
            )}
            <p className="text-muted-foreground">
              <span className="eyebrow mr-3 text-muted-foreground/70">Where</span>
              {site.company.location}
            </p>
          </div>
        </div>

        {/* login routes for existing people */}
        <div className="flex flex-col justify-center gap-4">
          <p className="eyebrow text-muted-foreground">Already working with us?</p>
          <a
            href="/login"
            data-testid="conversation-client-login"
            className="group flex min-h-14 items-center justify-between rounded-2xl border border-border bg-card p-5 transition-colors hover:border-electric/50"
          >
            <span>
              <span className="block text-sm font-semibold">Client login</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">Projects, invoices, reviews & deliveries</span>
            </span>
            <LogIn className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-electric" aria-hidden="true" />
          </a>
          <a
            href="/login"
            className="group flex min-h-14 items-center justify-between rounded-2xl border border-border bg-card p-5 transition-colors hover:border-electric/50"
          >
            <span>
              <span className="block text-sm font-semibold">Staff login</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">Studio dashboard & CRM</span>
            </span>
            <KeyRound className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-electric" aria-hidden="true" />
          </a>
        </div>
      </motion.div>
    </ChapterSection>
  )
}
