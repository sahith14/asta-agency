/**
 * Legacy route inventory — READ-ONLY analysis of /tmp/my-project vs active project.
 * For each legacy-only route file: exported HTTP methods, Prisma models touched,
 * auth helpers used. Emits a compact table for the reconciliation report.
 */
import { readdirSync, statSync, readFileSync } from "fs";
import path from "path";

const LEGACY = "/tmp/my-project/src/app/api";
const ACTIVE = "/home/z/my-project/src/app/api";

function walk(dir: string, base = ""): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const full = path.join(dir, e);
    const rel = base ? `${base}/${e}` : e;
    if (statSync(full).isDirectory()) out.push(...walk(full, rel));
    else if (e === "route.ts") out.push(rel.replace(/\/route\.ts$/, ""));
  }
  return out;
}

const legacyRoutes = walk(LEGACY).sort();
const activeRoutes = new Set(walk(ACTIVE));
const legacyOnly = legacyRoutes.filter((r) => !activeRoutes.has(r));

console.log(`legacy total: ${legacyRoutes.length}, active total: ${activeRoutes.size}, legacy-only: ${legacyOnly.length}\n`);

for (const r of legacyOnly) {
  const file = path.join(LEGACY, r, "route.ts");
  let src = "";
  try { src = readFileSync(file, "utf8"); } catch { console.log(`${r} | UNREADABLE`); continue; }

  const methods = [...src.matchAll(/export\s+(?:async\s+)?(?:const\s+)?(GET|POST|PATCH|PUT|DELETE)\s*=/g)].map((m) => m[1]).join("+") || "?";
  const models = [...new Set([...src.matchAll(/(?:db|prisma)\.([a-z][a-zA-Z]+)\.(?:findUnique|findFirst|findMany|create|createMany|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy)/g)].map((m) => m[1]))].sort().join(",") || "-";
  const auth = [...new Set([...src.matchAll(/(requireRole|requireUser|requireEmployee|requireClientScope|getSessionUser|getAuthUser|auth\(\))/g)].map((m) => m[1]))].join(",") || "NONE";
  const helpers = [...new Set([...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1].replace(/^\.\.\/+|^\.\//, "").replace(/^@\/lib\//, "@/lib/")))].slice(0, 6).join(" ");

  console.log(`${r}\n    methods=${methods} | models=${models} | auth=${auth}\n    imports=${helpers}`);
}
