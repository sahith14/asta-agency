/**
 * Idempotent dev bootstrap — self-heals the demo environment before the dev server starts.
 *
 * Wired into `bun run dev` (package.json) so the server can never come up in a state
 * where login is broken. This exists because sandbox session resets can wipe the
 * SQLite database file and gitignored credential files (.env additions, .seed-credentials).
 *
 * What it does (in order):
 *   1. Ensures the database schema exists — runs `prisma db push` if the schema is missing.
 *   2. If the database has NO employees → runs scripts/seed.ts, then
 *      scripts/set-test-credentials.ts (full demo rebuild).
 *   3. If the DB has accounts but the credentials recorded in .env (TEST_ACCOUNTS_JSON)
 *      are missing/malformed, or no longer match the scrypt hashes in the DB
 *      (partial sandbox wipe) → re-runs scripts/set-test-credentials.ts so the
 *      login-page test-account panel and the database always agree. Note: this also
 *      revokes all sessions, which is correct — the old plaintexts are gone anyway.
 *   4. Healthy environment → fast no-op (one COUNT + one scrypt verification).
 *
 * Security properties:
 *   - No secret material is ever printed or written to tracked files.
 *   - Reads/writes only gitignored files (.env, .seed-credentials).
 *   - Safe to run on every startup; it never touches data when everything matches.
 *
 * Usage: bun scripts/bootstrap-if-empty.ts  (invoked automatically by `bun run dev`)
 */
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { spawnSync } from 'child_process'
import { scryptSync, timingSafeEqual } from 'crypto'

const bun = process.execPath

function runScript(script: string, args: string[] = []): void {
  const result = spawnSync(bun, [script, ...args], { stdio: 'inherit' })
  if (result.status !== 0) {
    console.error(`[bootstrap] ${script} failed with exit code ${result.status}`)
    process.exit(result.status ?? 1)
  }
}

function parseEnvAccounts(): { flag: string | null; founderPassword: string | null } {
  try {
    let flag: string | null = null
    let founderPassword: string | null = null
    for (const line of readFileSync('.env', 'utf8').split('\n')) {
      const t = line.trim()
      if (t.startsWith('ENABLE_TEST_ACCOUNTS=')) {
        flag = t.slice('ENABLE_TEST_ACCOUNTS='.length).trim()
      } else if (t.startsWith('TEST_ACCOUNTS_JSON=')) {
        try {
          const parsed = JSON.parse(t.slice('TEST_ACCOUNTS_JSON='.length).trim())
          if (Array.isArray(parsed)) {
            const founder = parsed.find(
              (a: unknown): a is { email: string; password: string } =>
                typeof a === 'object' && a !== null &&
                (a as { email?: string }).email === 'founder@agencyos.local',
            )
            if (founder && typeof founder.password === 'string') founderPassword = founder.password
          }
        } catch {
          // malformed JSON — treated as missing below
        }
      }
    }
    return { flag, founderPassword }
  } catch {
    return { flag: null, founderPassword: null }
  }
}

function passwordMatches(password: string, storedHash: string): boolean {
  const [salt, hex] = storedHash.split(':')
  if (!salt || !hex) return false
  const calc = scryptSync(password, salt, 64)
  const expected = Buffer.from(hex, 'hex')
  return calc.length === expected.length && timingSafeEqual(calc, expected)
}

async function main(): Promise<void> {
  console.log('[bootstrap] Checking demo environment health…')
  const db = new PrismaClient()

  const tryCount = async (): Promise<number | null> => {
    try {
      return await db.employee.count()
    } catch {
      return null
    }
  }

  let count = await tryCount()

  if (count === null) {
    console.log('[bootstrap] Database schema missing — running prisma db push…')
    const push = spawnSync(bun, ['run', 'db:push'], { stdio: 'inherit' })
    if (push.status !== 0) {
      console.error('[bootstrap] prisma db push failed')
      process.exit(push.status ?? 1)
    }
    count = await tryCount()
    if (count === null) {
      console.error('[bootstrap] Database still unreachable after db push')
      process.exit(1)
    }
  }

  if (count === 0) {
    console.log('[bootstrap] Database is empty — rebuilding demo data (seed + test credentials)…')
    runScript('scripts/seed.ts')
    runScript('scripts/set-test-credentials.ts')
    console.log('[bootstrap] Demo environment rebuilt.')
  } else {
    const { flag, founderPassword } = parseEnvAccounts()
    let healthy = flag === 'true' && founderPassword !== null
    if (healthy && founderPassword) {
      const founder = await db.employee.findUnique({ where: { email: 'founder@agencyos.local' } })
      if (!founder || !passwordMatches(founderPassword, founder.passwordHash)) healthy = false
    }
    if (!healthy) {
      console.log('[bootstrap] Stored test credentials are missing or out of sync with the database — rotating…')
      runScript('scripts/set-test-credentials.ts')
      console.log('[bootstrap] Test credentials re-synced.')
    } else {
      console.log('[bootstrap] Environment healthy — nothing to do.')
    }
  }

  await db.$disconnect()
}

main().catch(e => {
  console.error('[bootstrap] Unexpected failure:', e)
  process.exit(1)
})
