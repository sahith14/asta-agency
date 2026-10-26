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
      <section className="border-b bg-gradient-to-b from-muted/70 to-background" aria-labelledby="contact-heading">
        <div className="mx-auto max-w-6xl px-4 py-14 lg:px-6 lg:py-20">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Contact</p>
          <h1 id="contact-heading" className="mt-2 text-balance text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            {site.contact.heading}
          </h1>
          <p className="mt-4 max-w-2xl text-pretty text-lg text-muted-foreground">{site.contact.intro}</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 lg:px-6 lg:py-16" aria-labelledby="enquiry-heading">
        <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr] lg:gap-14">
          <div>
            <h2 id="enquiry-heading" className="sr-only">Enquiry form</h2>
            <EnquiryForm />
          </div>

          <aside className="space-y-8">
            <div className="rounded-2xl border bg-card p-6">
              <h2 className="font-semibold">Prefer direct contact?</h2>
              <ul className="mt-4 space-y-3 text-sm">
                {CONTACT_PLACEHOLDERS.email ? null : (
                  <li className="flex items-center gap-2.5">
                    <Mail className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <a href={`mailto:${site.company.email}`} className="hover:underline">{site.company.email}</a>
                  </li>
                )}
                {CONTACT_PLACEHOLDERS.phone ? null : (
                  <li className="flex items-center gap-2.5">
                    <Phone className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <a href={`tel:${site.company.phone.replace(/\s+/g, '')}`} className="hover:underline">{site.company.phone}</a>
                  </li>
                )}
                <li className="flex items-start gap-2.5">
                  <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="text-muted-foreground">{site.company.location}</span>
                </li>
              </ul>
              {(CONTACT_PLACEHOLDERS.email || CONTACT_PLACEHOLDERS.phone) && (
                <p className="mt-4 text-sm text-muted-foreground">
                  The enquiry form is the fastest way to reach us — we review every message and reply using the contact method you choose.
                </p>
              )}
              <p className="mt-4 text-xs text-muted-foreground">
                Existing client or team member? Use the <a href="/login" className="underline hover:text-foreground">login page</a> to reach your workspace.
              </p>
            </div>

            <div className="rounded-2xl border bg-card p-6">
              <h2 className="font-semibold">What happens next</h2>
              <ol className="mt-4 space-y-4">
                {NEXT_STEPS.map((s, i) => (
                  <li key={s.title} className="flex gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden="true">
                      <s.icon className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{i + 1}. {s.title}</p>
                      <p className="text-sm text-muted-foreground">{s.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </aside>
        </div>
      </section>

      <section id="privacy" className="scroll-mt-20 border-t bg-muted/40" aria-labelledby="privacy-heading">
        <div className="mx-auto max-w-6xl px-4 py-12 lg:px-6">
          <h2 id="privacy-heading" className="text-xl font-bold tracking-tight">Privacy notice</h2>
          <p className="mt-3 max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground">{site.contact.privacy}</p>
          <p className="mt-4 max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground">
            Consent wording: by ticking the consent box you agree that {site.company.legalName} may store the details you submit and use them to respond to your enquiry. You can withdraw consent at any time by contacting us.
          </p>
        </div>
      </section>
    </>
  )
}
