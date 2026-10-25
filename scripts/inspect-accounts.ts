/// <reference types="bun-types" />
/**
 * READ-ONLY account inspector — prints all auth-capable accounts and key table counts.
 * Never prints password hashes or any credential material.
 * Usage: bun scripts/inspect-accounts.ts
 */
import { Database } from 'bun:sqlite'
import { resolve } from 'path'

const DB_PATH = resolve(process.cwd(), 'db/custom.db')
const db = new Database(DB_PATH, { readonly: true })

console.log('── Employees ──')
const emps = db
  .query<{ id: string; email: string; name: string; role: string; isActive: number; mustChangePassword: number }, []>(
    'SELECT id, email, name, role, isActive, mustChangePassword FROM Employee ORDER BY role, name',
  )
  .all()
for (const e of emps) console.log(`${e.role.padEnd(18)} ${e.email.padEnd(28)} ${e.name}  active=${e.isActive} mcp=${e.mustChangePassword}  id=${e.id}`)

console.log('\n── Client portal users ──')
const cus = db
  .query<{ id: string; email: string; name: string; clientId: string; isActive: number; mustChangePassword: number; clientName: string }, []>(
    'SELECT cu.id, cu.email, cu.name, cu.clientId, cu.isActive, cu.mustChangePassword, c.name AS clientName FROM ClientUser cu JOIN Client c ON c.id = cu.clientId ORDER BY c.name, cu.name',
  )
  .all()
for (const u of cus) console.log(`CLIENT ${u.clientName.padEnd(26)} ${u.email.padEnd(28)} ${u.name}  active=${u.isActive} mcp=${u.mustChangePassword}  id=${u.id}`)

console.log('\n── Clients ──')
const cls = db.query<{ id: string; name: string }, []>('SELECT id, name FROM Client ORDER BY name').all()
for (const c of cls) console.log(`${c.name.padEnd(28)} id=${c.id}`)

console.log('\n── Table row counts ──')
const tables = db
  .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_migrations' ORDER BY name")
  .all()
for (const t of tables) {
  const c = (db.query(`SELECT COUNT(*) AS c FROM "${t.name}"`).get() as { c: number }).c
  if (c > 0) console.log(`${t.name}: ${c}`)
}
db.close()
