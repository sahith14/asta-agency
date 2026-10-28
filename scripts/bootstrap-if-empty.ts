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
 *      are missing/malformed, or ANY advertised demo account is missing its scrypt
 *      match in the DB (partial sandbox wipe) → re-runs scripts/set-test-credentials.ts
 *      so the login-page test-account panel and the database always agree. Note: this
 *      also revokes all sessions, which is correct — the old plaintexts are gone anyway.
 *      Accounts that rotation CANNOT heal (a missing or inactive advertised account)
 *      are reported loudly with remediation guidance instead of being silently ignored.
 *   4. Healthy environment → fast no-op (one COUNT + one scrypt verification per
 *      advertised account).
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

interface AdvertisedAccount {
  email: string
  password: string
  role: string
  userType: string
}

function parseEnvAccounts(): { flag: string | null; accounts: AdvertisedAccount[] } {
  try {
    let flag: string | null = null
    let accounts: AdvertisedAccount[] = []
    for (const line of readFileSync('.env', 'utf8').split('\n')) {
      const t = line.trim()
      if (t.startsWith('ENABLE_TEST_ACCOUNTS=')) {
        flag = t.slice('ENABLE_TEST_ACCOUNTS='.length).trim()
      } else if (t.startsWith('TEST_ACCOUNTS_JSON=')) {
        try {
          const parsed: unknown = JSON.parse(t.slice('TEST_ACCOUNTS_JSON='.length).trim())
          if (Array.isArray(parsed)) {
            accounts = parsed.filter(
              (a: unknown): a is AdvertisedAccount =>
                typeof a === 'object' && a !== null &&
                typeof (a as { email?: unknown }).email === 'string' &&
                typeof (a as { password?: unknown }).password === 'string' &&
                typeof (a as { role?: unknown }).role === 'string' &&
                typeof (a as { userType?: unknown }).userType === 'string',
            )
          }
        } catch {
          // malformed JSON — treated as missing below
        }
      }
    }
    return { flag, accounts }
  } catch {
    return { flag: null, accounts: [] }
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
    const { flag, accounts } = parseEnvAccounts()

    // Verify EVERY advertised demo account, not just one: sandbox events can
    // partially restore state, leaving any single account broken while the rest work.
    type Problem = { email: string; kind: string }
    const problems: Problem[] = []
    let credentialDrift = false

    if (flag !== 'true' || accounts.length === 0) {
      credentialDrift = true
    } else {
      for (const acc of accounts) {
        const email = acc.email.toLowerCase()
        if (acc.userType === 'EMPLOYEE') {
          const emp = await db.employee.findUnique({ where: { email } })
          if (!emp) { problems.push({ email, kind: 'missing staff account' }); continue }
          if (!emp.isActive) { problems.push({ email, kind: 'inactive account' }); continue }
          if (emp.role !== acc.role) { problems.push({ email, kind: `role mismatch (DB: ${emp.role})` }); continue }
          if (!passwordMatches(acc.password, emp.passwordHash)) {
            problems.push({ email, kind: 'password no longer matches DB hash' })
            credentialDrift = true
          }
        } else {
          const cu = await db.clientUser.findUnique({ where: { email } })
          if (!cu) { problems.push({ email, kind: 'missing portal account' }); continue }
          if (!cu.isActive) { problems.push({ email, kind: 'inactive account' }); continue }
          if (!passwordMatches(acc.password, cu.passwordHash)) {
            problems.push({ email, kind: 'password no longer matches DB hash' })
            credentialDrift = true
          }
        }
      }
    }

    if (credentialDrift) {
      console.log('[bootstrap] Stored test credentials are missing or out of sync with the database — rotating…')
      runScript('scripts/set-test-credentials.ts')
      console.log('[bootstrap] Test credentials re-synced (all sessions revoked).')
    } else if (problems.length === 0) {
      console.log(`[bootstrap] Environment healthy — nothing to do. (${accounts.length} demo accounts verified)`)
    }

    // Problems rotation cannot heal (missing/inactive accounts) must never be silent.
    const unhealed = problems.filter(p => p.kind !== 'password no longer matches DB hash')
    if (unhealed.length > 0) {
      console.error('[bootstrap] WARNING — advertised demo accounts that credential rotation cannot fix:')
      for (const p of unhealed) console.error(`[bootstrap]   - ${p.email}: ${p.kind}`)
      console.error('[bootstrap]   Remedy: restore db/custom.db from a backup in backups/, or run "bun run demo:reset" for a full demo rebuild (recreates demo data).')
    }
  }

  await db.$disconnect()
}

main().catch(e => {
  console.error('[bootstrap] Unexpected failure:', e)
  process.exit(1)
})
