'use client'

/**
 * Shared R3F hook: builds a procedural studio environment (PMREM) so chrome
 * materials have believable reflections without any external HDRI asset.
 * Each Canvas context needs its own instance; disposal is automatic.
 */
import { useEffect } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

export function useRoomEnvironment(intensity = 1): void {
  const { gl, scene } = useThree()
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.06).texture
    // eslint-disable-next-line react-hooks/immutability -- assigning a generated env map to the three.js scene is the required imperative API
    scene.environment = envTex
     
    scene.environmentIntensity = intensity
    return () => {
       
      scene.environment = null
      envTex.dispose()
      pmrem.dispose()
    }
  }, [gl, scene, intensity])
}
