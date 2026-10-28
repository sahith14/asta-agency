import type { Metadata } from 'next'
import { Mail, Phone, MapPin, ClipboardList, Search, PenLine, Rocket } from 'lucide-react'
import { EnquiryForm } from '@/components/site/enquiry-form'
import { site, CONTACT_PLACEHOLDERS } from '@/lib/site-content'

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Tell us about your project — website, web app, or video production. No account required; every enquiry is reviewed by a real person.',
}

const NEXT_STEPS = [
  { icon: ClipboardList, title: 'We review it', body: 'A real person reads every enquiry, usually the same working day.' },
  { icon: Search, title: 'We clarify', body: 'We reply using your preferred contact method with a few questions or a call proposal.' },
  { icon: PenLine, title: 'You get a proposal', body: 'A written scope, schedule and price — you decide in your own time.' },
  { icon: Rocket, title: 'Work begins', body: 'Once approved, your project runs through our tracked process with visible progress.' },
]

export default function ContactPage() {
  return (
    <>
      <section className="ambient-ivory grain relative overflow-hidden border-b" aria-labelledby="contact-heading">
        <div className="mx-auto max-w-6xl px-4 py-16 lg:px-6 lg:py-24">
          <p className="eyebrow flex items-center gap-3 text-electric">Contact<span className="h-px w-10 bg-electric/60" aria-hidden="true" /></p>
          <h1 id="contact-heading" className="mt-4 max-w-3xl text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.5rem]">
            {site.contact.heading}
          </h1>
          <p className="mt-6 flex max-w-2xl items-start gap-4 text-pretty text-lg text-muted-foreground">
            <span className="mt-3 hidden h-px w-14 shrink-0 bg-electric/70 sm:block" aria-hidden="true" />
            {site.contact.intro}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 lg:px-6 lg:py-20" aria-labelledby="enquiry-heading">
        <div className="grid gap-12 lg:grid-cols-[1.5fr_1fr] lg:gap-16">
          <div>
            <h2 id="enquiry-heading" className="sr-only">Enquiry form</h2>
            <EnquiryForm />
          </div>

          <aside className="space-y-10">
            {/* Direct contact — hairline meta rows */}
            <div>
              <h2 className="eyebrow flex items-center gap-3 text-foreground">
                Prefer direct contact?<span className="h-px w-8 bg-border" aria-hidden="true" />
              </h2>
              <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-[0_25px_70px_-55px_rgba(61,35,22,0.6)]">
                <ul className="divide-y divide-border">
                  {CONTACT_PLACEHOLDERS.email ? null : (
                    <li className="flex items-center gap-3 px-5 py-4">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden="true">
                        <Mail className="h-4 w-4" />
                      </span>
                      <a href={`mailto:${site.company.email}`} className="text-sm hover:underline">{site.company.email}</a>
                    </li>
                  )}
                  {CONTACT_PLACEHOLDERS.phone ? null : (
                    <li className="flex items-center gap-3 px-5 py-4">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden="true">
                        <Phone className="h-4 w-4" />
                      </span>
                      <a href={`tel:${site.company.phone.replace(/\s+/g, '')}`} className="text-sm hover:underline">{site.company.phone}</a>
                    </li>
                  )}
                  <li className="flex items-start gap-3 px-5 py-4">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden="true">
                      <MapPin className="h-4 w-4" />
                    </span>
                    <span className="text-sm text-muted-foreground">{site.company.location}</span>
                  </li>
                </ul>
                {(CONTACT_PLACEHOLDERS.email || CONTACT_PLACEHOLDERS.phone) && (
                  <p className="border-t border-border px-5 py-4 text-sm leading-relaxed text-muted-foreground">
                    The enquiry form is the fastest way to reach us — we review every message and reply using the contact method you choose.
                  </p>
                )}
                <p className="border-t border-border px-5 py-4 text-xs leading-relaxed text-muted-foreground">
                  Existing client or team member? Use the <a href="/login" className="underline hover:text-foreground">login page</a> to reach your workspace.
                </p>
              </div>
            </div>

            {/* What happens next — numbered spine */}
            <div>
              <h2 className="eyebrow flex items-center gap-3 text-foreground">
                What happens next<span className="h-px w-8 bg-border" aria-hidden="true" />
              </h2>
              <ol className="relative mt-5 space-y-6 border-l border-border pl-6">
                {NEXT_STEPS.map((s, i) => (
                  <li key={s.title} className="relative">
                    <span className="absolute -left-[2.25rem] flex h-6 w-6 items-center justify-center rounded-full border border-electric/30 bg-background text-[0.625rem] font-semibold tabular-nums text-electric" aria-hidden="true">
                      {i + 1}
                    </span>
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <s.icon className="h-4 w-4 text-electric" aria-hidden="true" />
                      {s.title}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                  </li>
                ))}
              </ol>
            </div>
          </aside>
        </div>
      </section>

      <section id="privacy" className="scroll-mt-20 border-t bg-secondary/45" aria-labelledby="privacy-heading">
        <div className="mx-auto max-w-6xl px-4 py-14 lg:px-6">
          <p className="eyebrow flex items-center gap-3 text-muted-foreground">Privacy<span className="h-px w-8 bg-border" aria-hidden="true" /></p>
          <h2 id="privacy-heading" className="mt-3 text-2xl font-bold tracking-tight">Privacy notice</h2>
          <p className="mt-4 max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground">{site.contact.privacy}</p>
          <p className="mt-4 max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground">
            Consent wording: by ticking the consent box you agree that {site.company.legalName} may store the details you submit and use them to respond to your enquiry. You can withdraw consent at any time by contacting us.
          </p>
        </div>
      </section>
    </>
  )
}
