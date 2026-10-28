'use client'

/**
 * Creative lab L-01 — Material study.
 * A genuinely interactive R3F experiment: visitors control roughness,
 * metalness and light temperature on a chrome form in real time.
 * Rendering pauses when the section leaves the viewport.
 */
import { useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame } from '@react-three/fiber'
import { motion as motionStore } from '@/lib/site/motion'
import { useRoomEnvironment } from './use-room-environment'
import { cn } from '@/lib/utils'

function EnvSetup() {
  useRoomEnvironment(1.2)
  return null
}

function ChromeForm({
  roughness,
  metalness,
  lightColor,
  spin,
}: {
  roughness: number
  metalness: number
  lightColor: string
  spin: boolean
}) {
  const group = useRef<THREE.Group>(null)
  const light = useRef<THREE.PointLight>(null)

  useFrame(({ clock }, delta) => {
    if (!group.current) return
    if (spin && !motionStore.reducedMotion) {
      group.current.rotation.y += delta * 0.5
      group.current.rotation.x = Math.sin(clock.elapsedTime * 0.3) * 0.18
    }
    if (light.current) light.current.color.set(lightColor)
  })

  return (
    <group ref={group} rotation={[0.35, 0.6, 0]}>
      <mesh>
        <torusKnotGeometry args={[1.05, 0.34, motionStore.quality === 'high' ? 160 : 90, 24]} />
        <meshStandardMaterial color="#e9e6e1" metalness={metalness} roughness={roughness} envMapIntensity={1.3} />
      </mesh>
      <pointLight ref={light} position={[3, 2.5, 3]} intensity={38} distance={16} decay={2} color={lightColor} />
      <directionalLight position={[-4, 2, -3]} intensity={1.6} color="#c9d2dd" />
      <ambientLight intensity={0.25} />
    </group>
  )
}

const LIGHTS = [
  { name: 'Oxblood', value: '#a8434d' },
  { name: 'Studio white', value: '#ffffff' },
  { name: 'Steel', value: '#c9d2dd' },
]

export default function MaterialLab({ active }: { active: boolean }) {
  const [roughness, setRoughness] = useState(0.16)
  const [metalness, setMetalness] = useState(1)
  const [lightColor, setLightColor] = useState(LIGHTS[0].value)
  const [spin, setSpin] = useState(true)

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="relative h-72 bg-[radial-gradient(ellipse_at_center,#191713_0%,#0d0c0a_100%)] sm:h-80">
        <Canvas
          frameloop={active ? 'always' : 'never'}
          dpr={[1, 1.5]}
          gl={{ antialias: false, alpha: true, powerPreference: 'high-performance' }}
          camera={{ fov: 38, position: [0, 0.4, 5.4] }}
        >
          <EnvSetup />
          <ChromeForm roughness={roughness} metalness={metalness} lightColor={lightColor} spin={spin} />
        </Canvas>
        <span className="absolute left-4 top-4 font-mono text-[0.6rem] tracking-widest text-white/40">
          L-01 · MATERIAL STUDY
        </span>
      </div>
      <div className="grid gap-5 p-5 sm:grid-cols-3 sm:p-6">
        <label className="block">
          <span className="eyebrow mb-2 flex justify-between text-muted-foreground">
            Roughness <span className="text-electric">{roughness.toFixed(2)}</span>
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={roughness}
            onChange={e => setRoughness(Number(e.target.value))}
            className="w-full accent-[var(--electric)]"
            aria-label="Material roughness"
          />
        </label>
        <label className="block">
          <span className="eyebrow mb-2 flex justify-between text-muted-foreground">
            Metalness <span className="text-electric">{metalness.toFixed(2)}</span>
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={metalness}
            onChange={e => setMetalness(Number(e.target.value))}
            className="w-full accent-[var(--electric)]"
            aria-label="Material metalness"
          />
        </label>
        <div>
          <span className="eyebrow mb-2 block text-muted-foreground">Key light</span>
          <div className="flex items-center gap-2" role="group" aria-label="Key light colour">
            {LIGHTS.map(l => (
              <button
                key={l.value}
                type="button"
                onClick={() => setLightColor(l.value)}
                aria-pressed={lightColor === l.value}
                aria-label={`Key light: ${l.name}`}
                className={cn(
                  'h-8 w-8 rounded-full border-2 transition-transform',
                  lightColor === l.value ? 'scale-110 border-electric' : 'border-transparent hover:scale-105'
                )}
                style={{ backgroundColor: l.value }}
              />
            ))}
            <button
              type="button"
              onClick={() => setSpin(s => !s)}
              aria-pressed={spin}
              className="ml-auto rounded-full border border-border px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground min-h-8"
            >
              {spin ? 'Spinning' : 'Static'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
