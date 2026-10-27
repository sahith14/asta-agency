import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { ApiError } from './rbac'
import { MAX_UPLOAD_BYTES } from './constants'

// Uploads live OUTSIDE /public — they are never served statically.
// Access goes exclusively through the authorized /api/assets/[id]/download route.
const UPLOAD_DIR = path.join(process.cwd(), 'uploads')

export const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'video/mp4',
  'audio/mpeg',
])

// NOTE: image/svg+xml deliberately excluded (stored XSS vector).

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}

function safeExtension(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase()
  if (!/^\.[a-z0-9]{1,8}$/.test(ext)) return ''
  return ext
}

export async function saveUpload(
  file: File,
  ctx: { projectId: string }
): Promise<{ storedName: string; originalName: string; mimeType: string; sizeBytes: number }> {
  if (!file || typeof file === 'string') throw new ApiError(400, 'No file provided')
  if (file.size <= 0) throw new ApiError(400, 'Empty file')
  if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(413, 'File exceeds the 10MB limit')
  if (!ALLOWED_MIME_TYPES.has(file.type)) throw new ApiError(415, `File type "${file.type || 'unknown'}" is not allowed`)

  ensureUploadDir()
  const storedName = `${crypto.randomUUID()}${safeExtension(file.name)}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const target = getAssetPath(storedName) // validates no traversal
  fs.writeFileSync(target, buffer)
  return {
    storedName,
    originalName: path.basename(file.name).slice(0, 180) || 'upload',
    mimeType: file.type,
    sizeBytes: file.size,
  }
}

/** Resolve a stored asset path, guaranteeing it stays inside UPLOAD_DIR. */
export function getAssetPath(storedName: string): string {
  const resolved = path.resolve(UPLOAD_DIR, path.basename(storedName))
  if (!resolved.startsWith(path.resolve(UPLOAD_DIR))) throw new ApiError(400, 'Invalid asset path')
  return resolved
}

export function readAsset(storedName: string): Buffer {
  const p = getAssetPath(storedName)
  if (!fs.existsSync(p)) throw new ApiError(404, 'Asset file missing')
  return fs.readFileSync(p)
}
