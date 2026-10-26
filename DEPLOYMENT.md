# AgencyOS — Deployment & Operations Runbook

This document is the operational reference for deploying AgencyOS to production
hosting, and for the database backup / recovery approach. It does not contain
any secrets — credentials live only in `.env` (gitignored, never committed).

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
