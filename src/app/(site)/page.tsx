import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { publicFileExists } from '@/lib/site-media'
import { categoryLabel } from '@/lib/site-content'
import { SceneCanvas } from '@/components/site/three/scene-canvas'
import { ChapterRail } from '@/components/site/chapter-rail'
import { HeroChapter } from '@/components/site/chapters/hero'
import { CapabilitiesChapter, type VideoPanel } from '@/components/site/chapters/capabilities'
import { ShowroomChapter, type ShowroomItem } from '@/components/site/chapters/showroom'
import { CraftChapter } from '@/components/site/chapters/craft'
import { BuildChapter } from '@/components/site/chapters/build'
import { ConversationChapter } from '@/components/site/chapters/conversation'

export const metadata: Metadata = {
  title: 'ASTAS agency — We make digital feel different.',
  description:
    'Immersive websites, cinematic video and digital experiences built to make brands impossible to ignore. Website & digital services and video production, delivered by one studio.',
}

export const dynamic = 'force-dynamic'

const VIDEO_PANEL_SOURCES = [
  { src: '/images/site/service-video.jpg', cat: 'Commercial films', note: 'Crew-led shoots with a cinematic grade.' },
  { src: '/images/site/work-restaurant-reel.jpg', cat: 'Restaurant & café reels', note: 'Vertical content that makes people hungry.' },
  { src: '/images/site/work-product.jpg', cat: 'Product & food content', note: 'Studio-grade stills and motion for menus and shops.' },
  { src: '/images/site/work-realestate.jpg', cat: 'Property walkthroughs', note: 'Spaces presented so buyers picture themselves there.' },
]

const COMPARE_IMAGE = '/images/site/work-website.jpg'

export default async function HomePage() {
  const works = await db.portfolioItem.findMany({
    where: { published: true },
    orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
    take: 9,
  })

  const showroomItems: ShowroomItem[] = works.map(w => {
    const isVideo = !!w.mediaUrl && /\.(mp4|webm|mov)$/i.test(w.mediaUrl)
    return {
      id: w.id,
      title: w.title,
      category: w.category,
      categoryLabel: categoryLabel(w.category),
      summary: w.summary,
      description: w.description,
      thumbnailUrl: w.thumbnailUrl,
      thumbOk: publicFileExists(w.thumbnailUrl),
      mediaUrl: w.mediaUrl,
      isVideo,
      projectUrl: w.projectUrl,
      isDemo: w.isDemo,
    }
  })

  const videoPanels: VideoPanel[] = VIDEO_PANEL_SOURCES.map(p => ({
    ...p,
    ok: publicFileExists(p.src),
  }))

  return (
    <div className="relative">
      {/* Real-time 3D journey — fixed behind the first chapters */}
      <SceneCanvas />
      <ChapterRail />

      <div className="relative z-10">
        {/* 01 — Enter the studio */}
        <HeroChapter />

        {/* 02 — Discover the capabilities */}
        <CapabilitiesChapter videoPanels={videoPanels} />

        {/* 03 — Explore the work (DB-backed showroom) */}
        <ShowroomChapter items={showroomItems} />

        {/* 04 — Experience the craft (the 3D journey resolves here) */}
        <CraftChapter compareImage={COMPARE_IMAGE} compareOk={publicFileExists(COMPARE_IMAGE)} />

        {/* 05 — Build a project (genuine configurator) */}
        <BuildChapter />

        {/* 06 — Start a conversation */}
        <ConversationChapter />
      </div>
    </div>
  )
}
