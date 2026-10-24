/**
 * Test-credential rotation — gives the Founder a known, displayable set of login details.
 *
 * Security properties:
 * - Passwords are RANDOM per account (crypto.randomBytes), never a fixed pattern
 * - Written ONLY to the two gitignored files: .seed-credentials and .env (TEST_ACCOUNTS_JSON)
 * - NOT printed to stdout (console summary is emails/roles/names only)
 * - Hashed in DB with the exact same scrypt scheme as src/lib/auth.ts (salt:scrypt64hex)
 * - mustChangePassword forced false so test logins are friction-free
 * - All existing sessions revoked
 * - Rotation recorded in AuditLog (no secret material)
 *
 * Usage: bun scripts/set-test-credentials.ts
 */
import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync } from 'crypto'
import { readFileSync, writeFileSync } from 'fs'

const db = new PrismaClient()

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}
function strongPassword(): string {
  return randomBytes(9).toString('base64url') + 'aA1!'
}

type TestAccount = {
  email: string
  password: string
  name: string
  role: string
  userType: 'EMPLOYEE' | 'CLIENT_USER'
  clientName: string | null
}

async function main() {
  const [employees, clientUsers] = await Promise.all([
    db.employee.findMany({ orderBy: { role: 'asc' } }),
    db.clientUser.findMany({ include: { client: true }, orderBy: { name: 'asc' } }),
  ])

  if (employees.length === 0) {
    console.error('No employee accounts found — run scripts/seed.ts first.')
    process.exit(1)
  }

  const accounts: TestAccount[] = []

  for (const emp of employees) {
    const password = strongPassword()
    await db.employee.update({
      where: { id: emp.id },
      data: { passwordHash: hashPassword(password), mustChangePassword: false },
    })
    accounts.push({ email: emp.email, password, name: emp.name, role: emp.role, userType: 'EMPLOYEE', clientName: null })
  }

  for (const cu of clientUsers) {
    const password = strongPassword()
    await db.clientUser.update({
      where: { id: cu.id },
      data: { passwordHash: hashPassword(password), mustChangePassword: false },
    })
    accounts.push({ email: cu.email, password, name: cu.name, role: 'CLIENT', userType: 'CLIENT_USER', clientName: cu.client.name })
  }

  // Revoke every existing session so old cookies cannot survive rotation
  await db.session.deleteMany({})

  await db.auditLog.create({
    data: {
      actorType: 'SYSTEM',
      actorId: null,
      actorName: 'System (test-credential rotation)',
      action: 'TEST_CREDENTIALS_ROTATED',
      entityType: 'AUTH',
      entityId: null,
      summary: `Rotated passwords for ${accounts.length} accounts (${employees.length} employees, ${clientUsers.length} client users); all sessions revoked; values stored only in gitignored credential files.`,
      metadata: JSON.stringify({ employees: employees.length, clientUsers: clientUsers.length }),
    },
  })

  // ── .seed-credentials (gitignored) ────────────────────────────
  const lines = [
    'AgencyOS test credentials — rotated ' + new Date().toISOString(),
    'Displayed on /login while ENABLE_TEST_ACCOUNTS=true',
    '',
    ...accounts.map(a =>
      a.userType === 'EMPLOYEE'
        ? `STAFF  ${a.role.padEnd(17)} ${a.email.padEnd(26)} / ${a.password}`
        : `CLIENT (${a.clientName})${' '.repeat(Math.max(1, 18 - (a.clientName?.length ?? 0)))} ${a.email.padEnd(26)} / ${a.password}`,
    ),
    '',
  ]
  writeFileSync('.seed-credentials', lines.join('\n'), { mode: 0o600 })

  // ── .env (gitignored) — preserve existing non-secret lines ────
  const existing = readFileSync('.env', 'utf8')
    .split('\n')
    .filter(l => l.trim() && !l.startsWith('TEST_ACCOUNTS_JSON=') && !l.startsWith('ENABLE_TEST_ACCOUNTS='))
  const envContent = [
    ...existing,
    'ENABLE_TEST_ACCOUNTS=true',
    `TEST_ACCOUNTS_JSON=${JSON.stringify(accounts)}`,
    '',
  ].join('\n')
  writeFileSync('.env', envContent, { mode: 0o600 })

  console.log(`Rotated credentials for ${accounts.length} accounts:`)
  for (const a of accounts) {
    console.log(`  [${a.userType}] ${a.role.padEnd(17)} ${a.email.padEnd(26)} ${a.name}${a.clientName ? ` (${a.clientName})` : ''}`)
  }
  console.log('Passwords written ONLY to .env (TEST_ACCOUNTS_JSON) and .seed-credentials — both gitignored.')
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
