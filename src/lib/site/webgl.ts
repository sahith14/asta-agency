'use client'

/**
 * WebGL capability detection for the public-site 3D experience.
 * - `?webgl=off` provides a deterministic escape hatch (also used by QA to
 *   exercise the fallback path).
 * - Detection is cached per page load; failures fall back gracefully.
 */
let cached: boolean | null = null

export function webglAvailable(): boolean {
  if (typeof window === 'undefined') return false
  if (cached !== null) return cached

  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('webgl') === 'off') {
      cached = false
      return cached
    }
  } catch {
    /* URL parsing should never block detection */
  }

  try {
    const canvas = document.createElement('canvas')
    const gl =
      canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false }) ??
      canvas.getContext('webgl', { failIfMajorPerformanceCaveat: false })
    cached = !!gl
    // Lose the context immediately — we only probed capability.
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    cached = false
  }
  return cached
}
