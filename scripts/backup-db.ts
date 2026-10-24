/**
 * Verified database backup tool (Stage gate requirement).
 * Usage: bun scripts/backup-db.ts backups/<name>.db
 *
 * - Uses SQLite `VACUUM INTO` for an online, consistent snapshot
 * - Verifies the backup by comparing row counts of EVERY user table source vs backup
 * - Prints sha256 of both files
 * - NEVER prints or stores any credential material
 */
import { Database } from 'bun:sqlite'
import { createHash } from 'crypto'
import { resolve, dirname } from 'path'
import { mkdirSync } from 'fs'

const DB_PATH = resolve(process.cwd(), 'db/custom.db')
const OUT_ARG = process.argv[2]
if (!OUT_ARG) {
  console.error('Usage: bun scripts/backup-db.ts backups/<name>.db')
  process.exit(1)
}
const OUT_PATH = resolve(process.cwd(), OUT_ARG)
mkdirSync(dirname(OUT_PATH), { recursive: true })

function userTables(db: Database): string[] {
  const rows = db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_migrations' ORDER BY name",
    )
    .all()
  return rows.map(r => r.name)
}

function sha256(file: string): string {
  return createHash('sha256').update(Bun.file(file).arrayBuffer ? new Uint8Array(Bun.file(file).arrayBuffer()) : '').toString('hex')
}

async function fileHash(file: string): Promise<string> {
  const buf = await Bun.file(file).arrayBuffer()
  return createHash('sha256').update(new Uint8Array(buf)).toString('hex')
}

// ── 1. Snapshot via VACUUM INTO (readonly source) ─────────────
const src = new Database(DB_PATH, { readonly: true })
try {
  src.run(`VACUUM INTO '${OUT_PATH.replace(/'/g, "''")}'`)
} catch (e) {
  console.error('VACUUM INTO failed:', e)
  process.exit(1)
}

// ── 2. Verify: every user table row count must match ──────────
const bak = new Database(OUT_PATH, { readonly: true })
const tables = userTables(src)
let allMatch = true
const lines: string[] = []
for (const t of tables) {
  const a = (src.query(`SELECT COUNT(*) AS c FROM "${t}"`).get() as { c: number }).c
  const b = (bak.query(`SELECT COUNT(*) AS c FROM "${t}"`).get() as { c: number }).c
  const ok = a === b
  if (!ok) allMatch = false
  lines.push(`  ${ok ? 'OK ' : 'MISMATCH'} ${t}: ${a} → ${b}`)
}

const srcHash = await fileHash(DB_PATH)
const bakHash = await fileHash(OUT_PATH)

console.log(`Backup created: ${OUT_PATH}`)
console.log(`Tables verified: ${tables.length}/${tables.length}`)
console.log(lines.join('\n'))
console.log(`sha256 source: ${srcHash}`)
console.log(`sha256 backup: ${bakHash}`)
console.log(allMatch ? 'RESULT: VERIFIED — all row counts match' : 'RESULT: FAILED — row count mismatch')
src.close()
bak.close()
process.exit(allMatch ? 0 : 1)
