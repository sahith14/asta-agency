'use client'

/**
 * The R3F Canvas root — this whole file is the dynamic-import boundary so the
 * three.js bundle never blocks first paint. Never render DOM elements inside
 * <Canvas>; DOM overlays live in scene-canvas.tsx.
 */
import { Canvas } from '@react-three/fiber'
import MonolithScene from './monolith-scene'
import { motion as motionStore } from '@/lib/site/motion'

export default function MonolithCanvas({ renderOn }: { renderOn: boolean }) {
  return (
    <Canvas
      frameloop={renderOn ? 'always' : 'never'}
      dpr={[1, motionStore.quality === 'high' ? 1.75 : 1.25]}
      gl={{
        antialias: motionStore.quality === 'high',
        alpha: true,
        powerPreference: 'high-performance',
      }}
      camera={{ fov: 34, near: 0.1, far: 60, position: [0, 1.05, 8.6] }}
      onCreated={({ gl }) => {
        gl.toneMappingExposure = 1.12
      }}
    >
      <MonolithScene />
    </Canvas>
  )
}
