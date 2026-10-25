/**
 * Public-site portfolio seeding — clearly-labelled SAMPLE projects only.
 * Idempotent: items are matched by title and updated/created as needed.
 * Demo items must NEVER be attributed to real clients — titles stay generic.
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

export const DEMO_PORTFOLIO_ITEMS = [
  {
    title: 'Restaurant Website Rebuild',
    category: 'WEBSITE',
    division: 'WEB',
    summary: 'A fast, mobile-first restaurant website with menus, booking enquiries and local SEO foundations.',
    description: 'Sample project showing our typical restaurant build: custom design, menu structure, enquiry and booking flows, and a care plan for updates. Placeholder content throughout.',
    thumbnailUrl: '/images/site/work-website.jpg',
    featured: true, published: true, isDemo: true, sortOrder: 1,
  },
  {
    title: 'Café Monthly Reels Package',
    category: 'RESTAURANT_VIDEO',
    division: 'VIDEO',
    summary: 'Six vertical reels from one shoot day — menu highlights, atmosphere and barista craft for social channels.',
    description: 'Sample of a recurring monthly content package: a single filming day, edited into six 9:16 vertical videos with two revision rounds and delivery within a week.',
    thumbnailUrl: '/images/site/work-restaurant-reel.jpg',
    featured: true, published: true, isDemo: true, sortOrder: 2,
  },
  {
    title: 'Property Walkthrough Video',
    category: 'REAL_ESTATE_VIDEO',
    division: 'VIDEO',
    summary: 'A natural-light interior walkthrough with a vertical cutdown for social listings.',
    description: 'Sample property tour showing steady gimbal movement, room-by-room flow and delivery formats for portals and social media.',
    thumbnailUrl: '/images/site/work-realestate.jpg',
    featured: false, published: true, isDemo: true, sortOrder: 3,
  },
  {
    title: 'Product Content Day',
    category: 'PRODUCT_PHOTO',
    division: 'VIDEO',
    summary: 'Studio product photography plus an edited highlight reel for a small beverage brand.',
    description: 'Sample content day output: a photo set, product beauty shots and a 30-second highlight reel, all editable to brand guidelines.',
    thumbnailUrl: '/images/site/work-product.jpg',
    featured: false, published: true, isDemo: true, sortOrder: 4,
  },
] as const

export async function seedPortfolio(client: PrismaClient = db): Promise<void> {
  for (const item of DEMO_PORTFOLIO_ITEMS) {
    const existing = await client.portfolioItem.findFirst({ where: { title: item.title } })
    if (existing) {
      await client.portfolioItem.update({ where: { id: existing.id }, data: { ...item } })
    } else {
      await client.portfolioItem.create({ data: { ...item } })
    }
  }
}

async function main() {
  await seedPortfolio()
  console.log(`Portfolio seed complete (${DEMO_PORTFOLIO_ITEMS.length} sample items, idempotent).`)
}

if (process.argv[1] && process.argv[1].endsWith('seed-portfolio.ts')) {
  main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
}
