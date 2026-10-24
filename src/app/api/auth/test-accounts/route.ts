import { NextResponse } from 'next/server'
import { readFileSync, statSync } from 'fs'
import { resolve } from 'path'

export const dynamic = 'force-dynamic'

/**
 * Test/demo account directory for the login page.
 *
 * - Reads the gitignored .env file directly (server-side only) so credential
 *   rotations by scripts/set-test-credentials.ts take effect immediately.
 * - Gated by ENABLE_TEST_ACCOUNTS=true: when absent/false the endpoint answers 404
 *   and the login page renders nothing (production-safe default).
 * - Values originate exclusively from scripts/set-test-credentials.ts; no secret
 *   material is ever written to tracked files.
 */
interface TestAccount {
  email: string
  password: string
  name: string
  role: string
  userType: 'EMPLOYEE' | 'CLIENT_USER'
  clientName: string | null
}

let cache: { mtimeMs: number; enabled: boolean; accounts: TestAccount[] } | null = null

function loadConfig(): { enabled: boolean; accounts: TestAccount[] } {
  try {
    const envPath = resolve(process.cwd(), '.env')
    const mtimeMs = statSync(envPath).mtimeMs
    if (cache && cache.mtimeMs === mtimeMs) return cache
    let enabled = false
    let accounts: TestAccount[] = []
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('ENABLE_TEST_ACCOUNTS=')) {
        enabled = trimmed.slice('ENABLE_TEST_ACCOUNTS='.length).trim() === 'true'
      } else if (trimmed.startsWith('TEST_ACCOUNTS_JSON=')) {
        try {
          const parsed = JSON.parse(trimmed.slice('TEST_ACCOUNTS_JSON='.length).trim())
          if (Array.isArray(parsed)) accounts = parsed
        } catch {
          accounts = []
        }
      }
    }
    cache = { mtimeMs, enabled, accounts }
    return cache
  } catch {
    return { enabled: false, accounts: [] }
  }
}

export function GET() {
  const cfg = loadConfig()
  if (!cfg.enabled) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ accounts: cfg.accounts })
}
