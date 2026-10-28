import Link from 'next/link'
import { Mail, Phone, MapPin } from 'lucide-react'
import { site, CONTACT_PLACEHOLDERS } from '@/lib/site-content'

/**
 * Footer — night cinematic close for the public site.
 * Uses the `.night` token flip so every semantic class inside resolves to
 * the dark palette; hairlines, editorial wordmark and studio annotations.
 */
export function SiteFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="night ambient-night grain relative mt-auto border-t border-border bg-background text-foreground">
      <div className="relative mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:px-12 lg:py-16">
        {/* editorial wordmark */}
        <p aria-hidden="true" className="pointer-events-none select-none text-[clamp(2.6rem,9vw,7rem)] font-extrabold uppercase leading-none tracking-tight text-foreground/[0.07]">
          {site.company.name}
        </p>

        <div className="mt-10 grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5 font-bold">
              <span className="relative flex h-8 w-[18px] items-stretch overflow-hidden rounded-[3px]" aria-hidden="true">
                <span
                  className="h-full w-full"
                  style={{
                    background:
                      'linear-gradient(105deg, #dedad4 0%, #6f6c67 32%, #f4f1eb 50%, #5c5955 70%, #cbc7c1 100%)',
                  }}
                />
                <span className="absolute inset-y-0 right-0 w-[2px] bg-electric/90" />
              </span>
              {site.company.name}
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{site.company.tagline}</p>
            <p className="mt-3 text-xs text-muted-foreground">{site.company.foundedLine}</p>
          </div>

          <nav aria-label="Services">
            <h2 className="eyebrow text-electric">Services</h2>
            <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
              <li><Link href="/services/web-development" className="transition-colors hover:text-foreground">Website &amp; Digital Services</Link></li>
              <li><Link href="/services/video-production" className="transition-colors hover:text-foreground">Video Production &amp; Creative</Link></li>
              <li><Link href="/services" className="transition-colors hover:text-foreground">All services</Link></li>
              <li><Link href="/#packages" className="transition-colors hover:text-foreground">Packages &amp; pricing</Link></li>
            </ul>
          </nav>

          <nav aria-label="Company">
            <h2 className="eyebrow text-electric">Company</h2>
            <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
              <li><Link href="/about" className="transition-colors hover:text-foreground">About us</Link></li>
              <li><Link href="/portfolio" className="transition-colors hover:text-foreground">Our work</Link></li>
              <li><Link href="/#process" className="transition-colors hover:text-foreground">Our process</Link></li>
              <li><Link href="/contact" className="transition-colors hover:text-foreground">Contact &amp; privacy</Link></li>
            </ul>
          </nav>

          <div>
            <h2 className="eyebrow text-electric">Get in touch</h2>
            <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
              {!CONTACT_PLACEHOLDERS.email && (
                <li className="flex items-center gap-2">
                  <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <a href={`mailto:${site.company.email}`} className="transition-colors hover:text-foreground">{site.company.email}</a>
                </li>
              )}
              {!CONTACT_PLACEHOLDERS.phone && (
                <li className="flex items-center gap-2">
                  <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <a href={`tel:${site.company.phone.replace(/\s+/g, '')}`} className="transition-colors hover:text-foreground">{site.company.phone}</a>
                </li>
              )}
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{site.company.location}</span>
              </li>
            </ul>
            <div className="mt-5 flex gap-3 text-sm">
              <Link href="/login" className="font-medium text-foreground transition-colors hover:text-electric">Client Login</Link>
              <span aria-hidden="true" className="text-muted-foreground">·</span>
              <Link href="/login" className="text-muted-foreground transition-colors hover:text-foreground">Staff Login</Link>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} {site.company.legalName}. All rights reserved.</p>
          <p>
            <Link href="/contact#privacy" className="transition-colors hover:text-foreground">Privacy notice</Link>
            <span aria-hidden="true"> · </span>
            <span>Website &amp; video production studio</span>
          </p>
        </div>
      </div>
    </footer>
  )
}
