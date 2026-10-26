import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site/site-header'
import { SiteFooter } from '@/components/site/site-footer'
import { ProjectConfigurator } from '@/components/site/configurator/configurator'
import { site } from '@/lib/site-content'

export const metadata: Metadata = {
  title: {
    default: `${site.company.name} — ${site.company.tagline}`,
    template: `%s · ${site.company.name}`,
  },
  description: site.company.valueProposition,
}

export default function PublicSiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site-dark relative flex min-h-screen flex-col bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[80] focus:rounded-md focus:bg-electric focus:px-4 focus:py-2 focus:text-black"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      {/* Genuine enquiry experience — available from every public page */}
      <ProjectConfigurator />
    </div>
  )
}
