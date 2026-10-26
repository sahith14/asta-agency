import Link from 'next/link'
import { Clapperboard, Mail, Phone, MapPin } from 'lucide-react'
import { site, CONTACT_PLACEHOLDERS } from '@/lib/site-content'

export function SiteFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="mt-auto border-t bg-muted/40">
      <div className="mx-auto max-w-6xl px-4 py-12 lg:px-6">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2 font-bold">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Clapperboard className="h-4 w-4" aria-hidden="true" />
              </span>
              {site.company.name}
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{site.company.tagline}</p>
            <p className="mt-3 text-xs text-muted-foreground">{site.company.foundedLine}</p>
          </div>

          <nav aria-label="Services">
            <h2 className="text-sm font-semibold">Services</h2>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li><Link href="/services/web-development" className="hover:text-foreground">Website &amp; Digital Services</Link></li>
              <li><Link href="/services/video-production" className="hover:text-foreground">Video Production &amp; Creative</Link></li>
              <li><Link href="/services" className="hover:text-foreground">All services</Link></li>
              <li><Link href="/#packages" className="hover:text-foreground">Packages &amp; pricing</Link></li>
            </ul>
          </nav>

          <nav aria-label="Company">
            <h2 className="text-sm font-semibold">Company</h2>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li><Link href="/about" className="hover:text-foreground">About us</Link></li>
              <li><Link href="/portfolio" className="hover:text-foreground">Our work</Link></li>
              <li><Link href="/#process" className="hover:text-foreground">Our process</Link></li>
              <li><Link href="/contact" className="hover:text-foreground">Contact &amp; privacy</Link></li>
            </ul>
          </nav>

          <div>
            <h2 className="text-sm font-semibold">Get in touch</h2>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {!CONTACT_PLACEHOLDERS.email && (
                <li className="flex items-center gap-2">
                  <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <a href={`mailto:${site.company.email}`} className="hover:text-foreground">{site.company.email}</a>
                </li>
              )}
              {!CONTACT_PLACEHOLDERS.phone && (
                <li className="flex items-center gap-2">
                  <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <a href={`tel:${site.company.phone.replace(/\s+/g, '')}`} className="hover:text-foreground">{site.company.phone}</a>
                </li>
              )}
              <li className="flex items-start gap-2">
                <MapPin className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{site.company.location}</span>
              </li>
            </ul>
            <div className="mt-4 flex gap-3 text-sm">
              <Link href="/login" className="font-medium text-foreground hover:underline">Client Login</Link>
              <span aria-hidden="true" className="text-muted-foreground">·</span>
              <Link href="/login" className="text-muted-foreground hover:text-foreground">Staff Login</Link>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} {site.company.legalName}. All rights reserved.</p>
          <p>
            <Link href="/contact#privacy" className="hover:text-foreground">Privacy notice</Link>
            <span aria-hidden="true"> · </span>
            <span>Website &amp; video production studio</span>
          </p>
        </div>
      </div>
    </footer>
  )
}
