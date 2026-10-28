import type { Metadata } from 'next'
import { site } from '@/lib/site-content'
import { DivisionDetail } from '@/components/site/division-detail'

export const metadata: Metadata = {
  title: 'Video Production & Creative Services',
  description: 'Brand videos, restaurant and café promos, product and food content, social reels, property walkthroughs and recurring content packages — brief to final delivery.',
}

export default function VideoProductionPage() {
  return <DivisionDetail division={site.divisions[1]} />
}
