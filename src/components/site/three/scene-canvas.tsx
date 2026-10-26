'use client'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SCENE CANVAS — lifecycle owner for the 3D hero experience
 * ─────────────────────────────────────────────────────────────────────────────
 *  - mounts the R3F canvas only after WebGL capability passes
 *  - lazily code-splits the scene (never blocks first paint/readability)
 *  - pauses the render loop when the journey scrolls off-screen or the tab
 *    is hidden (no background GPU burn)
 *  - fades the canvas out past the 3D journey and swaps in nothing — later
 *    chapters are solid panels
 *  - renders a CSS-only static composition when WebGL is unavailable
 *    (`?webgl=off` forces this path — used by QA too)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { initMotion, motion } from '@/lib/site/motion'
import { webglAvailable } from '@/lib/site/webgl'

const MonolithCanvas = dynamic(() => import('./monolith-canvas'), {
  ssr: false,
  loading: () => <LoadingPlate />,
})

function LoadingPlate() {
  // Coherent loading state — quiet, on-brand, no fake progress bar.
  return (
    <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
      <div className="h-40 w-[2px] animate-pulse bg-gradient-to-b from-transparent via-electric/70 to-transparent" />
    </div>
  )
}

/** CSS-only monolith composition for no-WebGL visitors. */
function StaticMonolith() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      <div
        className="absolute left-1/2 top-1/2 h-[64vh] w-[22vh] -translate-x-1/2 -translate-y-[58%] rounded-[2px]"
        style={{
          background:
            'linear-gradient(105deg, #d9d5cf 0%, #6f6c67 30%, #f2efe9 50%, #5c5955 72%, #c9c5bf 100%)',
          boxShadow: '0 40px 120px rgba(0,0,0,0.8), inset 0 0 40px rgba(255,176,58,0.08)',
          transform: 'translateX(-50%) translateY(-58%) perspective(900px) rotateY(-14deg)',
        }}
      />
      <div className="absolute bottom-0 left-0 right-0 h-[38vh] bg-gradient-to-t from-black via-black/70 to-transparent" />
      <div className="absolute bottom-[36vh] left-1/2 h-px w-[70vw] -translate-x-1/2 bg-electric/20" />
    </div>
  )
}

export function SceneCanvas() {
  const [webgl, setWebgl] = useState<boolean | null>(null)
  const [renderOn, setRenderOn] = useState(true)
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const off = initMotion()
    // Detect WebGL on the next frame — avoids synchronous setState in effect
    // and gives the page one paint before scene bootstrapping begins.
    const id = requestAnimationFrame(() => setWebgl(webglAvailable()))
    return () => {
      cancelAnimationFrame(id)
      off()
    }
  }, [])

  // Fade + render gating: one passive scroll listener, direct style writes,
  // state flips only when crossing the render threshold.
  useEffect(() => {
    if (webgl === null) return
    if (!webgl) return

    let rendering = true
    const onScroll = () => {
      const host = hostRef.current
      if (!host) return
      const vh = window.innerHeight
      const end = motion.journeyEnd
      const y = window.scrollY
      const fade = Math.min(1, Math.max(0, (y - (end - vh * 0.9)) / (vh * 0.9)))
      host.style.opacity = String(1 - fade)
      host.style.visibility = fade >= 1 ? 'hidden' : 'visible'
      const shouldRender = y < end + vh * 0.4 && !document.hidden
      if (shouldRender !== rendering) {
        rendering = shouldRender
        setRenderOn(shouldRender)
      }
    }
    const onVisibility = () => onScroll()
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [webgl])

  return (
    <div
      ref={hostRef}
      className="pointer-events-none fixed inset-0 z-0"
      aria-hidden="true"
      data-testid="scene-canvas"
    >
      {webgl === false ? (
        <StaticMonolith />
      ) : webgl ? (
        <>
          <MonolithCanvas renderOn={renderOn} />
          {/* vignette keeps edge typography readable over the scene */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_52%,rgba(8,8,7,0.55)_100%)]" />
        </>
      ) : (
        <LoadingPlate />
      )}
    </div>
  )
}
