# AgencyOS — Deployment & Operations Runbook

This document is the operational reference for deploying AgencyOS to production
hosting, and for the database backup / recovery approach. It does not contain
any secrets — credentials live only in `.env` (gitignored, never committed).

---

## 0. Hosting: current status and the exact path to go live

**Status (verified in the development environment):** no hosting integration
exists yet — there is no git remote, no platform CLI (vercel / fly / railway /
render / netlify), no CI workflow, and no platform credentials. **The site has
therefore NOT been deployed to external hosting, and no public URL is claimed.**
The sandbox preview proxies only `localhost:3000` and is not a production site.

What IS prepared and committed so deployment is one authorization away:

| Artifact | Purpose |
| --- | --- |
| `Dockerfile` | Multi-stage build of the standalone server; mounts `/app/db` as a persistent volume for SQLite. **Prepared but not built locally** (Docker is unavailable in the sandbox) — run a smoke deploy first. |
| `docker-entrypoint.sh` | Applies the Prisma schema non-destructively at container start (refuses to run if a change would destroy data), then starts the server. |
| `.dockerignore` | Guarantees `.env`, `db/`, `backups/`, `.seed-credentials`, logs never enter the image. |
| `.env.production.example` | The exact environment variables a production host needs (demo accounts disabled). |

### Option A (recommended — smallest safe change): container host with a persistent volume, keep SQLite

Fly.io (Volumes), Railway (Volumes), Render (Disks), or any VPS + Docker.
**No database engine migration, no data migration, no schema change** — the
existing SQLite file and backup/restore tooling work as-is on a persistent
disk. Right-sized for a single-instance agency app.

Exact actions required from the owner (need your accounts, cannot be done from
this environment):
1. Create an account on the chosen platform (Fly.io / Railway / Render / VPS).
2. Put the repo on GitHub: `git remote add origin <url> && git push -u origin main`
   (needs your GitHub authorization) — or install the platform CLI locally and
   `fly deploy` / `railway up` from this machine.
3. Create a volume mounted at `/app/db` (Fly: `fly volumes create agencyos-data --size 3`).
4. Set env vars on the platform: `DATABASE_URL="file:/app/db/custom.db"`,
   `ENABLE_TEST_ACCOUNTS="false"` (leave `TEST_ACCOUNTS_JSON` unset).
5. Deploy (the Dockerfile is auto-detected; entrypoint applies the schema).
6. To start from today's data: stop the app, copy
   `backups/custom-2026-10-26-pre-prod-ready.db` over `/app/db/custom.db`
   via the platform's one-off shell / SFTP, start again. Otherwise start empty
   and create your real accounts via `/request-access`.
7. Smoke test the live URL (public pages → enquiry → staff inbox), then attach
   your domain and enable the platform's HTTPS.

### Option B: Vercel / serverless — requires a database migration first

Serverless filesystems are ephemeral, so SQLite cannot persist there. This
path means migrating to Turso (libSQL — closest to SQLite) or Postgres
( Neon / Supabase / Vercel Postgres): change the Prisma `provider`, verify the
schema maps 1:1, migrate data, and re-run all regression suites. This is a
deliberate, planned change that has deliberately **not** been done without your
sign-off. If you choose this path, say so explicitly and the migration will be
executed with a verified backup/recovery plan before any cutover.

### Email (independent of hosting choice)

No transactional email provider credentials exist in the environment. To enable
real email you need to: choose a provider (Resend / Postmark / SES), verify a
sending domain, and supply an API key as an environment variable on the host.
Then the notify step in `src/app/api/enquiries/route.ts` can be wired to it.
Until then, notifications are in-app only and the site says so honestly.

### Domain

No custom domain is configured. Use the platform's `*.fly.dev` /
`*.up.railway.app` / `*.onrender.com` URL first, verify it end-to-end, then
attach your real domain in the platform dashboard (a DNS change only you can
authorize — none is made here).

---

## 1. What this application is

- **Next.js 16 (App Router) + TypeScript**, standalone output (`output: "standalone"` in `next.config.ts`).
- **Prisma ORM + SQLite** (`db/custom.db`, connection string `DATABASE_URL="file:./custom.db"` in `.env`).
- Public marketing site at `/` (no login required) + staff dashboard `/app/*`
  and client portal `/portal/*` (session-cookie protected, role-based).
- Single deployable unit: the standalone server serves everything, including
  `public/` assets (copied into the standalone bundle by the build script).

## 2. Environment variables (required at startup)

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | **yes** | Prisma connection string. Currently `file:./custom.db`. The app **fails fast at startup** if this is missing or not a `file:` URL. |
| `ENABLE_TEST_ACCOUNTS` | no | When `true`, `/login` can display demo credentials (via `TEST_ACCOUNTS_JSON`). **Set to `false` or remove for production.** |
| `TEST_ACCOUNTS_JSON` | no | Demo account list for the login page. **Remove for production.** |

Rule: **never commit `.env`, never copy development secrets into production.**
Generate fresh credentials on the target host.

## 3. Build & run (any Node host)

```bash
bun install            # or npm ci / yarn install --frozen-lockfile
bun run db:generate    # generate the Prisma client
bun run db:push        # apply the schema to the target database
bun run build          # next build + copy static/public into .next/standalone
bun run start          # NODE_ENV=production bun .next/standalone/server.js
```

- The server listens on `PORT` (default 3000).
- `bun run build` must be run on (or for) the target platform — the development
  sandbox intentionally runs `next dev` only.
- Security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy,
  Permissions-Policy) are set in `next.config.ts`; TLS/HTTPS termination is the
  hosting platform's responsibility (enable it — the app uses `Secure`-ready
  session cookies and expects `X-Forwarded-Proto` from the proxy).

## 4. Database: backup & recovery (verified tooling)

### Backup
```bash
mkdir -p backups
bun scripts/backup-db.ts backups/custom-$(date +%F)-<label>.db
```
The script uses SQLite `VACUUM INTO` (consistent snapshot), then **verifies**
row counts per table against the source and prints sha256 checksums for both
files. A backup is only trustworthy when it ends with `RESULT: VERIFIED`.

### Recovery
```bash
pkill -f "next"                    # stop the app first
cp backups/custom-YYYY-MM-DD-<label>.db db/custom.db
bun run db:generate                # if the Prisma client version changed
bun run start                      # verify: /, /api/overview, staff login
```
Always take a fresh backup **before** any migration (`db:push`), data import,
or destructive operation.

### Known limitation — SQLite scope
SQLite (file-based) is the current engine. It is durable on a persistent disk
and survives app restarts, but:
- It is **not** shared/distributed: it lives on one machine's disk.
- If the host disk is ephemeral (e.g. container filesystem resets), backups in
  `backups/` are lost with it — push them off-machine (S3, volume snapshot, or
  the host's backup service) on a schedule.
- If multi-instance or heavy concurrent-write scaling is ever needed, migrate
  to Postgres via Prisma (`provider = "postgresql"` + migration). This is a
  deliberate, planned change — **not** something to do casually at launch.

## 5. Known operational limitations (honest list)

1. **Email delivery is NOT configured.** No transactional provider credentials
   exist in the environment. Enquiry notifications are in-app only; the public
   contact page explicitly tells visitors no automated confirmation email is
   sent. To add email: configure a verified provider (e.g. Resend/SES) with
   sender + API key in the environment, then wire the notify step in
   `src/app/api/enquiries/route.ts` — do not claim delivery before it is tested.
2. **Rate limiting is in-memory** (`src/lib/rate-limit.ts`): per-instance,
   per-process sliding windows. It is real protection for a single-instance
   deployment but is **not** globally persistent or distributed. A multi-instance
   deployment needs a shared store (e.g. hosted Redis) before the limits mean
   what they say.
3. **Contact details are placeholders and deliberately hidden.** The site does
   not publish `hello@agencyos.example` / the placeholder phone. When the real
   email/phone are available, update `src/lib/site-content.ts` (`site.company`);
   the placeholder-detection flags (`CONTACT_PLACEHOLDERS`) switch rendering on
   automatically once realistic values are present.
4. **Sessions are DB-backed** (`Session` table). Logging out invalidates the
   server-side session; rotating demo credentials revokes all sessions.
5. **Sandbox dev-server memory (dev mode only).** `next dev` (Turbopack) in the
   4GB sandbox accumulates memory under sustained request traffic and can hang
   (the kernel OOM-killed a 1.7GB instance during regression-suite runs).
   Restart with `pkill -9 -f "next dev"; (setsid bun run dev &)`. This is a
   **development-mode** characteristic (on-demand compilation + HMR); the
   production runtime is the pre-compiled standalone Node server
   (`.next/standalone/server.js`) and does not share this profile. If a
   production host ever shows memory pressure, cap the Node heap with
   `NODE_OPTIONS="--max-old-space-size=1024"` and size the instance ≥1GB.

## 6. Pre-deployment checklist (run in order)

1. `git status` clean; all work committed.
2. Verified DB backup: `bun scripts/backup-db.ts backups/<name>.db`.
3. `npx tsc --noEmit` — no type errors.
4. `bun run lint` — clean.
5. `bash tests/api-security-suite.sh` — expect 51 passed, 0 failed.
6. `bun scripts/verify-video-tracking.ts` — expect 67 passed, 0 failed.
7. `bun run build` succeeds on the target platform.
8. `.env` on the host contains only production values; `ENABLE_TEST_ACCOUNTS`
   removed/false; `.env`, `db/`, `backups/` are NOT in the deployed artifact
   (they are gitignored; the standalone bundle contains only `public/` assets).
9. Smoke test the live URL: public pages → enquiry submit → staff login →
   enquiry visible in `/app/enquiries`.

## 7. Regression suites

| Suite | Command | Expected |
| --- | --- | --- |
| Type check | `npx tsc --noEmit` | 0 errors |
| Lint | `bun run lint` | 0 errors |
| API security (auth, RBAC, isolation, abuse) | `bash tests/api-security-suite.sh` | 51 passed |
| Video production state machine | `bun scripts/verify-video-tracking.ts` | 67 passed |

The suites create clearly-labelled verify fixtures (e.g. the
"Audit Cafe (verify fixture)" client) which they reuse on subsequent runs —
this is intentional tooling state, not user data.
