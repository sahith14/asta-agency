import fs from 'fs'
import path from 'path'

const publicDir = path.join(process.cwd(), 'public')

/**
 * Server-side check that a public image file actually exists on disk.
 * Used to gracefully degrade to styled placeholders if media files are
 * missing (e.g. after an environment reset), so the public site never
 * shows broken images.
 */
export function publicFileExists(publicPath: string | null | undefined): boolean {
  if (!publicPath || !publicPath.startsWith('/') || publicPath.includes('..')) return false
  try {
    return fs.statSync(path.join(publicDir, publicPath)).isFile()
  } catch {
    return false
  }
}
