# AgencyOS — Phase 6 Production-Readiness Audit

**Date:** Phase 6 delivery · **Scope:** security, reliability, operations, privacy
**Method:** code inspection of every route/lib + executed test suite (`tests/phase6-security.ts`, 121 checks, results in `docs/PHASE6-TEST-RESULTS.txt`).

> Honest context: the repository contained only the framework scaffold before Phase 6 — no prior phases existed in code. Phases 0–5 capabilities (auth, RBAC, clients, projects, demos, tasks, tickets, finance, audit) were materialized additively as part of this delivery and are covered by the same audit.

---

## 1. Authentication & credentials

| Area | Status | Evidence / notes |
|---|---|---|
| Password storage | ✅ PASS | scrypt (64-byte, per-user random salt), timing-safe compare (`src/lib/auth.ts`) |
| Default credentials | ⚠️ ACTION | Seed accounts use documented demo passwords (`scripts/seed.ts`, report §Credentials). Founder account keeps `mustChangePassword=false` for the demo; **change all seeded passwords before real use**. Users created via Team & Users always get a forced password change on first sign-in. |
| Password reset | ✅ PASS (honest) | Self-service request records an audit entry + notifies the Founder; **email delivery is not connected**, so the Founder performs manual resets (Team & Users → Reset password; one-time shown password, sessions invalidated). `/forgot-password` states this honestly. |
| Session security | ✅ PASS | 256-bit random tokens in DB, HttpOnly + SameSite=Lax + Secure-in-production cookie, 7-day expiry, lazy purge of expired sessions, other sessions invalidated on password change, all sessions killed on deactivation/reset. |
| Brute force | ✅ PASS | Login failures rate-limited 10 / 5 min / IP → 429 (test §10). Successful logins never counted. |
| User enumeration | ✅ PASS | Uniform `Invalid email or password`; forgot-password returns identical text for known/unknown emails. |

## 2. Authorization (RBAC) & data isolation

| Area | Status | Evidence |
|---|---|---|
| Server-side enforcement | ✅ PASS | Every API route opens with `requireUser/requireRole/requireEmployee` (`src/lib/rbac.ts`); UI hiding is never the control. Default-deny. |
| Cross-client isolation | ✅ PASS | Portal queries always filter by the session's `clientId`; foreign IDs → **404** (no existence leak); `?clientId=` spoofing → 403 (tests §1). |
| Employee restrictions | ✅ PASS | Developer: assigned projects only; manager: no finance/team/audit; finance: no demos/tasks/team (tests §3). |
| Founder super-user | ✅ PASS | FOUNDER bypasses every restriction server-side, incl. portal `?clientId=` views (audited as `PORTAL_VIEW_AS_FOUNDER`) (tests §4). |
| Privilege escalation | ✅ PASS | Clients/employees cannot reach `/api/team`; no self role-change; only FOUNDER changes roles (tests §8). |
| Audit trail | ✅ PASS | `AuditLog` (actor, role, action, entity, result ALLOWED/DENIED/SUCCESS/FAILURE, IP) on auth + all sensitive mutations, including DENIED events. |
| Approval audit | ✅ PASS | `ApprovalEvent` records actor/role/action/timestamp/resulting-action for preview authorization, client approval, scope review, change approval/rejection/conversion, deployment. |

## 3. Input validation & upload security

| Area | Status | Evidence |
|---|---|---|
| Input validation | ✅ PASS | Zod schemas on every mutating endpoint; unknown/oversized fields rejected; 400 with issue list. |
| File uploads | ✅ PASS | Stored **outside** `/public` under `./uploads` with random UUID names; 10 MB cap; MIME allowlist (images/PDF/Office/zip/mp4); **SVG excluded** (stored-XSS vector); extension sanitized. |
| Asset serving | ✅ PASS | Single authenticated path `/api/assets/[id]/download` with role/ownership checks; anonymous → 401, foreign client → 404 (tests §6). Path-traversal-proof resolution. |
| Upload rate limit | ✅ PASS | 20 uploads / min / user. |
| Security headers / CSRF | ⚠️ PARTIAL | SameSite=Lax cookies + JSON-only APIs give baseline CSRF protection. No explicit CSRF tokens; no CSP/X-Frame-Options headers configured. Acceptable for same-site API usage; add headers before public exposure. |

## 4. Secrets & configuration

| Area | Status | Evidence |
|---|---|---|
| Secrets in code | ✅ PASS | No credentials/API keys in source; `.env` holds only `DATABASE_URL`. |
| Secret management | ⚠️ NOTE | No secret manager; `.env` is plaintext by platform convention. For production: rotate DATABASE_URL, keep `.env` out of backups of code. |
| Query logging | ✅ FIXED | Prisma `log:['query']` was leaking bound params (incl. password-hash lookups) to stdout — removed during this audit. |
| Build hygiene | ⚠️ NOTE | `next.config.ts` sets `ignoreBuildErrors: true` (platform default). `tsc --noEmit` is clean for app code; recommend turning strict fails back on for production builds. |

## 5. Data, backup & recovery

| Area | Status | Notes |
|---|---|---|
| Database | SQLite at `db/custom.db` (platform convention). Single-file; adequate for this scale. |
| Backup procedure | ⚠️ MANUAL | **No automated backups configured.** Procedure: with app stopped — `cp db/custom.db backups/custom-$(date +%F).db` (+ copy `uploads/`). Restore: stop app, replace file, `bunx prisma generate`, restart. Automate before real client data is stored. |
| Migrations | ✅ PASS | Additive `prisma db push` used; schema is the source of truth. For production: switch to `prisma migrate deploy` with committed migration files. |
| Rollback | ⚠️ MANUAL | Redeploy previous standalone build + restore DB snapshot; no automated rollback pipeline. |

## 6. Reliability & scheduled jobs

| Area | Status | Notes |
|---|---|---|
| Scheduled jobs | ⚠️ NONE | No cron jobs exist (no invoice-chasing or maintenance reminders run automatically). Manual operational process; document before relying on it. |
| Duplicate-event handling | ✅ PASS | Notifications idempotent via unique `dedupeKey` (P2002-safe); demo/CR transitions guarded by conditional `updateMany` + 409 on races. |
| Error logging | ✅ BASIC | API errors logged server-side with uniform 500 (no stack leaks). **No external error alerting** (email/Sentry not connected) — honest limitation. |
| Rate limiter scope | ⚠️ NOTE | In-memory, per-process, resets on restart — fine for single-instance deployment; use shared store when scaling out. |

## 7. Privacy, retention & deletion

| Area | Status | Notes |
|---|---|---|
| Client data scope | ✅ PASS | Portal returns only own-business records; internal notes and internal replies never cross the portal API boundary (tests §1/§6). |
| Deletion workflows | ⚠️ MANUAL | User deactivation (sessions killed) exists; no hard-delete/GDPR erasure routine. Deletion = founder action via DB with backup first; document retention policy. |
| Audit retention | ⚠️ OPEN | AuditLog grows unbounded; add retention/archive policy before long-term production use. |
| Payment data | ✅ PASS | No card data stored anywhere; only method labels + references. Payment gateway not connected — portal shows an honest "not connected" state (test §7). |

## 8. Unconnected external integrations (honest register)

| Integration | State | Where surfaced |
|---|---|---|
| Email delivery (SMTP/transactional) | **Not connected** — no reset links, no email notifications; in-app bell is the channel of record | `/forgot-password`, Portal/Settings notes |
| Payment gateway (Stripe/GoCardless…) | **Not connected** — `PAYMENT_GATEWAY_URL` unset → billing portal shows unavailable state; bank-transfer verification workflow is the live path | `/portal/billing` |
| External calendar sync | Not part of Phase 6; not present, not claimed | — |
| Uptime/monitoring service | **Not connected** — maintenance SOP checks are evidence-based manual entries, never fabricated | `/app/tickets/maintenance`, portal reports |

## 9. Deployment instructions

```bash
# 1. Install & prepare
bun install
bunx prisma generate && bunx prisma db push        # or: prisma migrate deploy
bun scripts/seed.ts                                 # demo data (SKIP in production)

# 2. Production build (standalone)
bun run build
bun run start                                       # serves .next/standalone on :3000

# 3. Required before real use
#  - change/remove all seeded passwords (Team & Users → reset)
#  - configure automated DB backups (§5)
#  - set PAYMENT_GATEWAY_URL when a gateway is contracted
#  - connect email delivery or keep founder-mediated resets
```

Rollback: stop server → restore previous build dir + DB snapshot → restart. Test suite rerun: `bun scripts/seed.ts && bun tests/phase6-security.ts`.

## 10. Known limitations summary

1. No email channel — password resets are founder-mediated; notifications in-app only.
2. No payment gateway — honest unavailable state; bank-transfer verification workflow instead.
3. No automated backups / scheduled jobs / external alerting.
4. In-memory rate limiting; single-instance only.
5. Seeded demo credentials are documented and must be rotated before real use.
6. No CSRF tokens/CSP yet (SameSite=Lax + JSON APIs as baseline).
7. Demo `demoUrl` values are external placeholders (e.g. `https://demo.…example.com`) — real previews must be hosted by the agency and linked per project.
