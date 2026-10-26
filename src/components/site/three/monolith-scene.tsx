'use client'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE MONOLITH — real-time 3D hero scene
 * ─────────────────────────────────────────────────────────────────────────────
 * One cohesive concept: a chrome monolith on a dark reflective plain, ringed
 * by sculptural steel blades. Scroll progress drives a cinematic camera arc
 * around the structure; chapters shift material finish, lighting and blade
 * composition. Pointer input adds subtle parallax. A lightweight fresnel
 * shader gives the monolith its electric rim.
 *
 * Performance discipline:
 *  - low-poly geometry, zero textures, one procedurally generated env map
 *  - quality tier reduces blade count / DPR / antialias on weak devices
 *  - reduced-motion: static framing, no drift, no intro animation
 *  - resources are disposed on unmount (env map, shader material)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { motion as motionStore, type QualityTier } from '@/lib/site/motion'
import { useRoomEnvironment } from './use-room-environment'

const BG = new THREE.Color('#0d0c0a')
const ELECTRIC = new THREE.Color('#ffb03a')

/* ── Fresnel rim shader (the "lightweight custom shader") ─────────────────── */
const fresnelVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
  }
`
const fresnelFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.6);
    gl_FragColor = vec4(uColor * rim * uIntensity, rim * uIntensity);
  }
`

/* ── Procedural environment (believable chrome without external HDRIs) ────── */
function EnvironmentSetup() {
  useRoomEnvironment(1.1)
  return null
}

/* ── The monolith + fresnel shell + edge glow ─────────────────────────────── */
function Monolith({ quality }: { quality: QualityTier }) {
  const group = useRef<THREE.Group>(null)
  const slabRef = useRef<THREE.MeshStandardMaterial>(null)
  const glowRef = useRef<THREE.Mesh>(null)

  const fresnelMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: fresnelVertex,
        fragmentShader: fresnelFragment,
        uniforms: {
          uColor: { value: ELECTRIC.clone() },
          uIntensity: { value: 0.85 },
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    []
  )
  useEffect(() => () => fresnelMat.dispose(), [fresnelMat])

  const edgeGeo = useMemo(() => {
    const box = new THREE.BoxGeometry(1.35, 4.4, 0.55)
    const edges = new THREE.EdgesGeometry(box)
    box.dispose()
    return edges
  }, [])
  useEffect(() => () => edgeGeo.dispose(), [edgeGeo])

  useFrame(({ clock }) => {
    const p = motionStore.smooth
    const t = clock.elapsedTime
    const still = motionStore.reducedMotion

    if (group.current) {
      group.current.rotation.y = (still ? 0.35 : t * 0.07) + p * 1.25
      const s = 1 + Math.sin(p * Math.PI) * 0.04
      group.current.scale.setScalar(s)
    }
    if (slabRef.current) {
      // Finish shifts chapter to chapter: polished → brushed → polished
       
      slabRef.current.roughness = 0.16 + Math.sin(p * Math.PI) * 0.34
    }
    if (glowRef.current) {
      const m = glowRef.current.material as THREE.LineBasicMaterial
       
      m.opacity = 0.22 + Math.sin(p * Math.PI) * 0.2
    }
    // eslint-disable-next-line react-hooks/immutability -- imperative shader uniform animation
    fresnelMat.uniforms.uIntensity.value = 0.7 + Math.sin(p * Math.PI) * 0.7
  })

  return (
    <group ref={group} position={[0, 1.12, 0]}>
      <mesh castShadow={false}>
        <boxGeometry args={[1.35, 4.4, 0.55]} />
        <meshStandardMaterial
          ref={slabRef}
          color="#e9e6e1"
          metalness={1}
          roughness={0.18}
          envMapIntensity={1.25}
        />
      </mesh>
      {/* fresnel rim */}
      <mesh scale={[1.035, 1.012, 1.06]} material={fresnelMat}>
        <boxGeometry args={[1.35, 4.4, 0.55]} />
      </mesh>
      {/* electric edge lines */}
      <mesh ref={glowRef}>
        <primitive object={edgeGeo} attach="geometry" />
        <lineBasicMaterial color={ELECTRIC} transparent opacity={0.24} />
      </mesh>
    </group>
  )
}

/* ── Ring of sculptural blades ────────────────────────────────────────────── */
function BladeRing({ quality }: { quality: QualityTier }) {
  const count = quality === 'high' ? 14 : 9
  const radius = 3.6
  const group = useRef<THREE.Group>(null)
  const blades = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2
        const h = 1.7 + Math.sin(i * 2.4) * 0.85
        return { angle, h, x: Math.sin(angle) * radius, z: Math.cos(angle) * radius }
      }),
    [count]
  )

  useFrame(({ clock }) => {
    const p = motionStore.smooth
    const t = clock.elapsedTime
    if (!group.current) return
    group.current.rotation.y = (motionStore.reducedMotion ? 0 : t * 0.045) - p * 2.1
    group.current.children.forEach((child, i) => {
      const wave = motionStore.reducedMotion ? 0 : Math.sin(p * Math.PI * 2 + i * 0.7) * 0.3
      const target = 1 + wave
      child.scale.y += (target - child.scale.y) * 0.08
    })
  })

  return (
    <group ref={group}>
      {blades.map((b, i) => (
        <mesh key={i} position={[b.x, b.h / 2 - 1.35, b.z]} rotation={[0, b.angle, 0]}>
          <boxGeometry args={[0.045, b.h, 0.4]} />
          <meshStandardMaterial color="#b9b5af" metalness={1} roughness={0.28} envMapIntensity={1.1} />
        </mesh>
      ))}
    </group>
  )
}

/* ── Floor plain + drifting shards for depth ──────────────────────────────── */
function Stage() {
  const shards = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (!shards.current || motionStore.reducedMotion) return
    const t = clock.elapsedTime
    shards.current.children.forEach((s, i) => {
      s.rotation.y = t * 0.05 * (i % 2 === 0 ? 1 : -1) + i
      s.position.y = (i - 1) * 1.4 + Math.sin(t * 0.3 + i * 1.8) * 0.12
    })
  })
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.42, 0]}>
        <circleGeometry args={[26, 56]} />
        <meshStandardMaterial color="#141210" metalness={0.85} roughness={0.4} envMapIntensity={0.55} />
      </mesh>
      <group ref={shards}>
        {[[-4.6, 2.2, -2.4], [4.9, 3.1, -3.2], [-3.4, 2.6, 3.6]].map((pos, i) => (
          <mesh key={i} position={pos as [number, number, number]}>
            <boxGeometry args={[0.03, 1.5 + i * 0.5, 0.22]} />
            <meshStandardMaterial color="#8f8c87" metalness={1} roughness={0.35} envMapIntensity={0.9} />
          </mesh>
        ))}
      </group>
    </>
  )
}

/* ── Lighting ─────────────────────────────────────────────────────────────── */
function Lights() {
  const key = useRef<THREE.SpotLight>(null)
  useFrame(() => {
    // Key light warms subtly through the journey chapters.
    if (key.current) {
      const p = motionStore.smooth
      key.current.intensity = 240 + Math.sin(p * Math.PI) * 120
    }
  })
  return (
    <>
      <ambientLight intensity={0.22} />
      <spotLight
        ref={key}
        position={[5, 7, 4]}
        angle={0.55}
        penumbra={1}
        decay={2}
        distance={32}
        color="#fff3e2"
      />
      <directionalLight position={[-6, 4, -5]} intensity={2.2} color="#c9d2dd" />
      <pointLight position={[0, -0.6, 3.4]} intensity={14} distance={10} decay={2} color={ELECTRIC} />
    </>
  )
}

/* ── Camera rig: cinematic arc driven by scroll + pointer parallax ────────── */
function CameraRig() {
  const { camera } = useThree()

  const path = useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        [
          new THREE.Vector3(0, 1.05, 8.6), // 01 hero — frontal, low
          new THREE.Vector3(4.9, 2.7, 5.2), // 02 capabilities — three-quarter right
          new THREE.Vector3(-5.1, 1.7, 6.1), // 03 work — three-quarter left
          new THREE.Vector3(0.4, 3.6, 7.6), // exit — elevated wide
        ],
        false,
        'catmullrom',
        0.35
      ),
    []
  )
  const targets = useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        [
          new THREE.Vector3(0, 0.95, 0),
          new THREE.Vector3(0.5, 1.15, 0),
          new THREE.Vector3(-0.5, 0.85, 0),
          new THREE.Vector3(0, 1.5, 0),
        ],
        false,
        'catmullrom',
        0.35
      ),
    []
  )

  const intro = useRef(motionStore.reducedMotion ? 1 : 0)
  const pos = useMemo(() => new THREE.Vector3(), [])
  const look = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, delta) => {
    if (intro.current < 1) intro.current = Math.min(1, intro.current + delta / 1.5)
    const ease = 1 - Math.pow(1 - intro.current, 3)
    const p = motionStore.smooth

    path.getPoint(p, pos)
    targets.getPoint(p, look)

    // Entrance dolly + scale-in handled via intro ease
    // eslint-disable-next-line react-hooks/immutability -- imperative three.js vector math on a locally-owned scratch object
    pos.z += (1 - ease) * 3.2
     
    pos.y += (1 - ease) * 0.4

    // Pointer parallax (fine pointers only, motion allowed)
    if (!motionStore.isTouch && !motionStore.reducedMotion) {
      pos.x += motionStore.smoothPointerX * 0.55
      pos.y += -motionStore.smoothPointerY * 0.35
    }

    camera.position.lerp(pos, motionStore.reducedMotion ? 1 : 0.12)
    camera.lookAt(look)
  })
  return null
}

/* ── Scene root ───────────────────────────────────────────────────────────── */
export default function MonolithScene() {
  const quality = motionStore.quality
  return (
    <>
      <fogExp2 attach="fog" args={[BG.getHex(), 0.055]} />
      <EnvironmentSetup />
      <CameraRig />
      <Lights />
      <Monolith quality={quality} />
      <BladeRing quality={quality} />
      <Stage />
    </>
  )
}
