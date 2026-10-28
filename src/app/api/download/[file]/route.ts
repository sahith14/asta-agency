import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TEMPORARY dev utility — archive download fallback
 * ─────────────────────────────────────────────────────────────────────────────
 * Streams prebuilt workspace archives that live OUTSIDE the project directory
 * (/home/z/*.zip), as a reliable fallback for the platform's workspace-download
 * feature, which has been failing ("Failed to fetch").
 *
 * Security posture:
 *  - GET only, no methods exported besides GET
 *  - strict whitelist of two fixed absolute paths — no user-controlled path
 *    segments ever touch the filesystem (the [file] param is only a lookup key)
 *  - no DB, no auth surface, nothing mutable — pure read of two static files
 *
 * REMOVE THIS ROUTE before any production deployment — it exists purely so the
 * owner can retrieve the codebase from the sandbox preview URL.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const FILES: Record<string, { path: string; name: string }> = {
  source: {
    path: '/home/z/asta-agency-source.zip',
    name: 'asta-agency-source.zip',
  },
  workspace: {
    path: '/home/z/asta-agency-workspace-full.zip',
    name: 'asta-agency-workspace-full.zip',
  },
}

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params
  const entry = FILES[file]
  if (!entry) {
    return new Response('Not found', { status: 404 })
  }
  try {
    const info = await stat(entry.path)
    const body = Readable.toWeb(createReadStream(entry.path)) as unknown as ReadableStream<Uint8Array>
    return new Response(body, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': String(info.size),
        'Content-Disposition': `attachment; filename="${entry.name}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch {
    return new Response('Archive unavailable', { status: 404 })
  }
}
