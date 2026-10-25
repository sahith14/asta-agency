import {
  Globe, Clapperboard, MonitorSmartphone, LayoutGrid, ShoppingCart, CalendarCheck,
  Gauge, Wrench, Film, UtensilsCrossed, Camera, Instagram, Building2, Megaphone, Scissors,
  type LucideIcon,
} from 'lucide-react'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PUBLIC SITE CONTENT — single source of truth
 * ─────────────────────────────────────────────────────────────────────────────
 * All company name, tagline, marketing copy, service descriptions, process
 * steps, packages and contact details live here so they can be updated in ONE
 * place without touching page components.
 *
 * EDITING GUIDE
 *  - Anything marked `// TODO:` is an editable placeholder. Replace it with
 *    real details before going live.
 *  - No awards, client logos, customer counts, testimonials or performance
 *    statistics are claimed anywhere. Add them only when real.
 *  - Packages: only the "Restaurant Monthly Reels" price mirrors the actual
 *    package configured in the platform (VideoPackage: £720/month) and is
 *    labelled indicative; every other package intentionally shows "Custom
 *    quote" because no public pricing has been approved.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const site = {
  company: {
    name: 'AgencyOS',
    // TODO: replace with the real trading name if different.
    legalName: 'AgencyOS Studio',
    tagline: 'Websites and videos, delivered by one studio.',
    // Short value proposition used in the hero and meta tags.
    valueProposition:
      'We design and build websites, web apps and e-commerce for growing businesses — and produce the brand, food and property videos that make them shine. Two crafts, one accountable team.',
    // TODO: replace with the real public email address.
    email: 'hello@agencyos.example',
    // TODO: replace with the real phone number, or remove phone entries if unused.
    phone: '+44 0000 000000',
    // TODO: replace with the real service area / location wording.
    location: 'United Kingdom — working with clients on-site and remotely',
    foundedLine: 'A studio built around long-term client relationships, not one-off projects.',
  },
  intro: {
    heading: 'One studio for your website and your video',
    body: [
      'AgencyOS is a two-division creative studio. Our web team designs and builds websites, custom applications and online stores. Our video team plans, films and edits brand films, food content, property tours and social reels.',
      'We work with restaurants and cafés, food and beverage brands, property professionals, corporate teams and other growing businesses that need their online presence to actually pull its weight — and need one accountable partner for both pixels and footage.',
      'Every project runs through the same operating platform our team uses internally: clear briefs, tracked deliverables, review rounds you can see, and delivery you can verify. You always know where things stand.',
    ],
    whyUs: [
      { title: 'Two crafts, one team', body: 'Website and video under one roof — consistent branding, one point of contact, no agency-to-agency handoffs.' },
      { title: 'Quality over volume', body: 'A deliberate project load, senior attention on every deliverable, and revisions built into the process.' },
      { title: 'Reliable execution', body: 'Scoped proposals, visible progress, tracked deadlines. You approve work before it ships.' },
      { title: 'Built for the long run', body: 'Maintenance, care plans and recurring content — we stick around after launch day.' },
    ],
  },
  divisions: [
    {
      slug: 'web-development',
      href: '/services/web-development',
      name: 'Website & Digital Services',
      shortName: 'Web & Digital',
      icon: Globe as LucideIcon,
      image: '/images/site/service-web.jpg',
      tagline: 'Design, build, launch and look after your corner of the internet.',
      intro:
        'From a first business website to custom portals and online stores, we design and build digital products that are fast, accessible and easy to maintain — then keep them that way.',
      services: [
        { icon: MonitorSmartphone, title: 'Business website design & development', body: 'Custom-designed, mobile-first websites that present your business clearly and convert visitors into enquiries.' },
        { icon: LayoutGrid, title: 'Custom web applications & portals', body: 'Client portals, booking tools, dashboards and internal tools built to fit how your business actually works.' },
        { icon: ShoppingCart, title: 'E-commerce websites', body: 'Online stores with a product catalogue, cart and checkout — set up around your products and fulfilment process.' },
        { icon: CalendarCheck, title: 'Booking & enquiry systems', body: 'Enquiry forms, reservation flows and scheduling experiences built into your website, tailored to your operations.' },
        { icon: Gauge, title: 'Redesigns & performance improvements', body: 'Modernise an ageing website: clearer structure, faster load times, better mobile experience, cleaner content.' },
        { icon: Wrench, title: 'Hosting, maintenance & support', body: 'Ongoing updates, backups, monitoring and small changes — a care plan so your site stays healthy after launch.' },
      ],
      deliverables: [
        'Discovery workshop and requirements summary',
        'Design concepts and revision rounds',
        'Responsive build for phone, tablet and desktop',
        'Content structure, forms and basic on-page SEO',
        'Launch checklist, testing and handover walkthrough',
        'Optional hosting, care plan and ongoing support',
      ],
      cta: 'Discuss your website project',
    },
    {
      slug: 'video-production',
      href: '/services/video-production',
      name: 'Video Production & Creative Services',
      shortName: 'Video & Creative',
      icon: Clapperboard as LucideIcon,
      image: '/images/site/service-video.jpg',
      tagline: 'Scroll-stopping video content, planned properly and delivered on time.',
      intro:
        'From a single brand film to a monthly reel package, we handle the whole pipeline — creative direction, filming, editing, revisions and delivery in the formats your channels need.',
      services: [
        { icon: Film, title: 'Business & brand videos', body: 'Films that tell your story: who you are, what you do, and why customers should care.' },
        { icon: UtensilsCrossed, title: 'Restaurant & café promotional videos', body: 'Menu highlights, atmosphere and service captured in footage that makes people hungry.' },
        { icon: Camera, title: 'Product & food photography/video', body: 'Studio-quality product shots and food content for menus, shops and campaigns.' },
        { icon: Instagram, title: 'Social media reels & short-form content', body: 'Vertical, platform-ready short videos — one-offs or recurring monthly packages.' },
        { icon: Building2, title: 'Real estate & property videos', body: 'Walkthroughs and neighbourhood features that help buyers and tenants picture themselves there.' },
        { icon: Megaphone, title: 'Promotional campaigns & content packages', body: 'Recurring content plans with scheduled shoots, so your channels never go quiet.' },
        { icon: Scissors, title: 'Editing, revisions & final delivery', body: 'Professional edit, colour and sound, structured revision rounds, and delivery in every format you need.' },
      ],
      deliverables: [
        'Creative brief and shot plan agreed before filming',
        'Professional shoot with experienced crew',
        'Edited master with colour grade and licensed audio',
        'Structured revision rounds with portal-based review',
        'Delivery in vertical and landscape formats as agreed',
        'Full usage rights for your channels, per your package',
      ],
      cta: 'Discuss your video project',
    },
  ] as const,

  process: {
    heading: 'How we work',
    intro: 'Seven steps from first hello to long-term support — adapted slightly depending on whether we are building your website or producing your video.',
    steps: [
      { n: 1, title: 'Initial enquiry', body: 'Tell us about your business and what you need through our contact form, by email or by phone. We reply with sensible next steps — no hard sell.', web: 'A quick call or email to understand your business and goals.', video: 'A quick call or email to understand your brand and channels.' },
      { n: 2, title: 'Discovery & requirements', body: 'We dig into your goals, audience, content and practical constraints, and identify anything that needs deciding early.', web: 'Sitemap, features, content sources and technical needs.', video: 'Creative direction, locations, people and deliverable formats.' },
      { n: 3, title: 'Proposal & scope confirmation', body: 'You receive a clear proposal: what is included, the schedule, revision rounds and the price. Work starts once you approve it.', web: 'Scope covers pages, features and care options.', video: 'Scope covers videos, shoot days and revision rounds.' },
      { n: 4, title: 'Planning & production', body: 'We plan the work and execute it — with progress you can see.', web: 'Design concepts, then the build, content and testing on a staging site.', video: 'Creative brief, shot list and call sheet, then the shoot, then the edit.' },
      { n: 5, title: 'Client review & revisions', body: 'You review the work and request changes within the agreed revision rounds. Feedback is structured so nothing gets lost.', web: 'Review the staging site page by page.', video: 'Review edits with timecoded comments in your client portal.' },
      { n: 6, title: 'Approval & final delivery', body: 'You sign off the final version. We hand over files, access and everything promised in the proposal.', web: 'Launch, DNS go-live checks and a handover walkthrough.', video: 'Final exports in all agreed formats with usage rights documented.' },
      { n: 7, title: 'Ongoing support', body: 'Where your package includes it, we stay on: maintenance, updates, hosting and recurring content so things keep working after handover.', web: 'Care plan: updates, backups, monitoring and small changes.', video: 'Recurring packages: scheduled shoots and fresh content every month.' },
    ],
  },

  packages: {
    heading: 'Packages',
    intro:
      'Indicative package structures to help you budget. Final pricing is always confirmed in a written proposal after we understand your scope — nothing here is a checkout page.',
    note: 'Prices shown are indicative and exclude VAT where applicable. Every package can be tailored.',
    web: [
      {
        name: 'Business Website',
        forWhom: 'Small businesses that need a polished, dependable online presence.',
        includes: ['Custom design (up to ~6 pages)', 'Mobile-first responsive build', 'Enquiry form & basic on-page SEO', 'Launch + handover walkthrough', '30-day post-launch fix window'],
        recurring: 'Optional hosting & care plan (monthly)',
        price: 'Custom quote',
      },
      {
        name: 'E-commerce Website',
        forWhom: 'Shops and makers selling online, with a product catalogue and checkout.',
        includes: ['Product catalogue & cart/checkout', 'Payment gateway setup', 'Order & fulfilment workflow basics', 'Staff training session', 'Launch + handover walkthrough'],
        recurring: 'Hosting, maintenance & support plan (monthly)',
        price: 'Custom quote',
      },
      {
        name: 'Web App / Client Portal',
        forWhom: 'Businesses that need a booking system, portal or custom tool, not just a website.',
        includes: ['Requirements workshop & specification', 'Interactive prototype for approval', 'Custom application build', 'User accounts & permissions', 'Documentation & training'],
        recurring: 'Support & iteration retainer (monthly)',
        price: 'Custom quote',
      },
      {
        name: 'Care & Maintenance Plan',
        forWhom: 'Existing websites that need to stay fast, secure and up to date.',
        includes: ['Updates & security patching', 'Backups & uptime monitoring', 'Small content changes each month', 'Performance check-ups', 'Priority support channel'],
        recurring: 'Billed monthly',
        price: 'Custom quote',
      },
    ],
    video: [
      {
        name: 'Restaurant Monthly Reels',
        forWhom: 'Restaurants and cafés that want fresh vertical content every month.',
        includes: ['6 edited vertical videos per month (9:16, 1080×1920)', '1 shoot day per month on location', '2 revision rounds', 'Delivery within ~7 days of the shoot', 'Full usage rights for your social channels'],
        recurring: 'Monthly rolling package',
        // Mirrors the actual VideoPackage configured in the platform (£720/month).
        price: 'From £720 / month',
      },
      {
        name: 'Brand Film',
        forWhom: 'Businesses that need one polished film to anchor their marketing.',
        includes: ['Creative brief & shot plan', '1 filming day on location', '1 master edit (up to ~2 minutes)', '2 revision rounds', 'Landscape + vertical cutdowns'],
        recurring: 'Optional: quarterly refresh shoots',
        price: 'Custom quote',
      },
      {
        name: 'Property Walkthrough',
        forWhom: 'Estate agents, landlords and developers marketing properties.',
        includes: ['1 filming visit per property', 'Guided walkthrough edit', 'Vertical cutdown for social', '1 revision round', 'Delivery within ~5 working days'],
        recurring: 'Multi-property rates available',
        price: 'Custom quote',
      },
      {
        name: 'Product & Food Content Day',
        forWhom: 'Product brands and food businesses building a content library.',
        includes: ['1 studio or on-site content day', 'Photo + video coverage of your products/menu', 'Edited highlight reel', 'Photo set, edited & retouched', '1 revision round'],
        recurring: 'Repeatable quarterly or monthly',
        price: 'Custom quote',
      },
    ],
  },

  about: {
    heading: 'About us',
    story: [
      'AgencyOS started from a simple observation: businesses were juggling a web agency, a videographer and a dozen freelancers — and nobody was accountable for the whole picture. We built one studio where the website and the video content are planned, produced and delivered by the same team, on the same platform.',
      'Today our web division and video division work side by side for restaurants, cafés, property professionals, corporate teams and other growing businesses. Shared planning means your website launch can coincide with your brand film; one account manager means nothing falls between two suppliers.',
    ],
    mission: 'To give growing businesses big-agency quality in website and video — delivered reliably, priced honestly, and supported long after launch.',
    values: [
      { title: 'Craft with purpose', body: 'Every page and every frame should earn its place. We sweat details because your customers notice them.' },
      { title: 'Say what we\'ll do, then do it', body: 'Clear proposals, honest timelines and visible progress. If something changes, you hear it from us first.' },
      { title: 'Clients for years, not invoices', body: 'We aim for long-term relationships — care plans, content packages and honest advice, even when it costs us a sale.' },
      { title: 'One accountable team', body: 'No outsourcing black boxes. You know who is building and filming, and they know your business.' },
    ],
    approach:
      'We keep a deliberate project load, work in reviewable stages, and put everything — briefs, deliverables, revisions, invoices — into one client portal you can check any time. You should never have to ask "where is my project?"',
  },

  contact: {
    heading: 'Discuss your project',
    intro: 'Tell us what you need. A real person reviews every enquiry and replies within two working days — there is no chatbot and no obligation.',
    // TODO: replace with real response-time commitment if different.
    privacy:
      'We use the details you provide solely to respond to your enquiry and prepare a proposal. We never sell or share your information with third parties for marketing. This demo environment does not send marketing emails. You can ask us to correct or delete your enquiry at any time by contacting us.',
    consentLabel: 'I agree that AgencyOS may store these details and contact me about my enquiry.',
    successNote:
      'Your enquiry has been saved and a member of our team will review it shortly. We have NOT sent an automated confirmation email — you will be contacted directly using the contact method you selected.',
    services: [
      'Website design & development',
      'E-commerce website',
      'Custom web app / portal',
      'Website redesign / performance',
      'Hosting & maintenance',
      'Video — brand film',
      'Video — restaurant / café promo',
      'Video — social reels package',
      'Video — property walkthrough',
      'Product & food photography/video',
      'Something else / not sure yet',
    ],
  },
} as const

export type SiteDivision = (typeof site.divisions)[number]

/** Portfolio categories shown as public filter chips — keep in sync with PortfolioItem.category values. */
export const PORTFOLIO_CATEGORIES = [
  { value: 'WEBSITE', label: 'Websites' },
  { value: 'RESTAURANT_VIDEO', label: 'Restaurant & food' },
  { value: 'REAL_ESTATE_VIDEO', label: 'Real estate' },
  { value: 'PRODUCT_PHOTO', label: 'Product content' },
  { value: 'BRAND_VIDEO', label: 'Brand films' },
] as const

export function categoryLabel(value: string): string {
  return PORTFOLIO_CATEGORIES.find(c => c.value === value)?.label ?? 'Other work'
}
