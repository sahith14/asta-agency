import type { Metadata } from 'next'
import { site } from '@/lib/site-content'
import { DivisionDetail } from '@/components/site/division-detail'

export const metadata: Metadata = {
  title: 'Website & Digital Services',
  description: 'Business websites, custom web apps and portals, e-commerce, booking systems, redesigns, hosting and maintenance — designed, built and supported by one team.',
}

export default function WebDevelopmentPage() {
  return <DivisionDetail division={site.divisions[0]} />
}
