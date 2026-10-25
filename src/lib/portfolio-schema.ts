import { z } from 'zod'

/** Shared validation for portfolio item payloads (used by both portfolio routes). */
export const CATEGORIES = ['WEBSITE', 'RESTAURANT_VIDEO', 'REAL_ESTATE_VIDEO', 'PRODUCT_PHOTO', 'BRAND_VIDEO', 'OTHER'] as const

const urlish = z.string().trim().max(300).refine(
  v => v === '' || v.startsWith('/') || /^https?:\/\//i.test(v),
  'Must be a URL or a path starting with /'
).optional()

export const portfolioSchema = z.object({
  title: z.string().trim().min(2).max(120),
  category: z.enum(CATEGORIES),
  division: z.enum(['WEB', 'VIDEO']).default('WEB'),
  summary: z.string().trim().min(10).max(300),
  description: z.string().max(4000).optional(),
  thumbnailUrl: urlish,
  mediaUrl: urlish,
  projectUrl: urlish,
  featured: z.boolean().default(false),
  published: z.boolean().default(false),
  isDemo: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(9999).default(0),
})
