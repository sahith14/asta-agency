/**
 * Checkpoint DB inspector — READ-ONLY.
 * Opens both candidate databases with bun:sqlite and dumps tables + row counts + users.
 * Used by the pre-Phase-7 integrity checkpoint. Does not write anything.
 */
import { Database } from "bun:sqlite";

const dbs: Array<[string, string]> = [
  ["HOME (active preview)", "/home/z/my-project/db/custom.db"],
  ["TMP copy", "/tmp/my-project/db/custom.db"],
];

for (const [label, path] of dbs) {
  console.log(`\n=================== ${label}: ${path} ===================`);
  let db: Database;
  try {
    db = new Database(path, { readonly: true });
  } catch (e) {
    console.log("CANNOT OPEN:", e);
    continue;
  }

  const tables = db
    .query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%' ORDER BY name")
    .all() as Array<{ name: string }>;

  console.log(`Tables (${tables.length}):`);
  for (const t of tables) {
    let count = 0;
    try {
      count = (db.query(`SELECT COUNT(*) as c FROM "${t.name}"`).get() as { c: number }).c;
    } catch {
      count = -1;
    }
    console.log(`  ${t.name.padEnd(24)} ${count}`);
  }

  // Users detail (roles + password hash format + status)
  try {
    const users = db
      .query("SELECT id, email, name, role, mustChangePassword, clientId, substr(passwordHash,1,20) as hashPrefix, createdAt FROM User ORDER BY role, email")
      .all() as Array<Record<string, unknown>>;
    console.log("\nUsers:");
    for (const u of users) {
      console.log(
        `  ${String(u.email).padEnd(30)} role=${String(u.role).padEnd(15)} mustChange=${String(u.mustChangePassword)} clientId=${u.clientId ?? "-"} hash=${String(u.hashPrefix)}… created=${String(u.createdAt).slice(0, 19)}`
      );
    }
  } catch (e) {
    console.log("User table read failed:", e);
  }

  // Sessions + reset tokens
  for (const t of ["Session", "PasswordResetToken"]) {
    try {
      const rows = db
        .query(`SELECT COUNT(*) as c FROM "${t}"`)
        .get() as { c: number };
      console.log(`${t}: ${rows.c} rows`);
    } catch {
      /* table may not exist */
    }
  }

  db.close();
}
