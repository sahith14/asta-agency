# AgencyOS — Project Reconciliation Report (Pre-Phase-7 Checkpoint)

**Date:** 2026-10-22 · **Scope:** canonical-project determination, legacy-build reconciliation, security verification, backup verification, git hygiene, restoration plan
**Status:** ✅ Checkpoint complete · **No data deleted · No database reset · No modules rebuilt · Phase 7 NOT started · Nothing merged**
**Awaiting:** Founder review and approval of the restoration plan (§10) before any restoration work begins.

---

## 1. Executive summary

| Question | Answer |
|---|---|
| Which repo/DB does the active preview use? | **`/home/z/my-project` @ git `main`** (checkpoint commits `7edf650`–`738b1d5`), served by `next dev -p 3000`, DB **`db/custom.db`** (SQLite, 22 tables). Verified via process list, `.env`, `dev.log`, and live browser/curl checks. |
| Do Phases 0–5 exist elsewhere? | **No separate Phase 0–5 implementation or database exists anywhere on this machine.** The active project's foundation was built additively as part of Phase 6 (documented honestly in `worklog.md`). A **larger, unfinished legacy build** from the previous session (Oct 22, 02:25–03:25 UTC) survives **only** as orphaned files in `/tmp/my-project` (chimera — see §3). |
| Is the legacy copy authoritative? | **No.** It is not running, has no `node_modules`, its shared files were overwritten by the canonical build, its Prisma schema was replaced, and some of its routes import helpers that no longer exist in it. It is **reference material only**. |
| Is the data safe? | Yes. First verified backup created and **restore-tested in isolation** (§9). Legacy build's own DB was destroyed by the workspace reset between sessions and is unrecoverable (it contained only build-in-progress test data; see §12 risks). |
| Any real secrets exposed in git history? | **No** (§8). Demo passwords were committed by design and have been **rotated with full verification** (§7). |
| Founder access & isolation verified? | **Yes** — all modules, desktop browser + API matrix (§5). |
| Can Phase 7 start? | **Not yet** — awaiting Founder review of this report and the staged restoration plan (§11). |

---

## 2. Canonical project determination

**Confirmed canonical:** `/home/z/my-project`

Evidence:
- Process: `bun run dev` → `next dev -p 3000` runs from `/home/z/my-project` (verified via `ps`, started 09:16 UTC).
- `.env`: `DATABASE_URL=file:/home/z/my-project/db/custom.db` (both copies' `.env` point **here** — even `/tmp/my-project/.env`).
- `dev.log` shows the live preview traffic (founder dashboard, portal pages, portal APIs — all 200).
- Git: branch `main` @ `7edf650` (checkpoint commit); history: `2cf5f3a` (initial scaffold, 04:28) → `7f6ba6a` (Phase 6 delivery, 10:48) → `bd106b9` (platform auto-commit) → `7edf650` (untrack runtime files).
- DB: `db/custom.db`, 364,544 bytes, 22 tables, 6 users, seeded Phase 6 dataset.

**The `/tmp/my-project` copy:**
- Created Oct 21 19:27 by an incremental platform mirror; refreshed with canonical files through 10:47–10:48.
- Not running (no `node_modules`, no `.next`, no `dev.log`).
- **Protective archive created:** `/home/z/legacy-agencyos-pre-phase6-20261022.tar.gz` (44 MB, 2,331 files) — safe from `/tmp` wipes. The `/tmp` copy itself is **untouched** (nothing deleted, per instruction).

---

## 3. What the legacy build actually is

Timeline (all evidence-based, from file mtimes + git):

| When | Event |
|---|---|
| Oct 21 19:27 → Oct 22 03:25 | Previous session (the one that ran out of context) built a **larger AgencyOS** on the same scaffold: 163 API routes, ~30 additional Prisma models (Website, Domain, Deployment, Document, ServicePlan, Quote, Incident, Meeting, Brief, EmailAccount…), Gmail OAuth, monitoring, billing gateway with plans/quotes/allocations. Smoke tests exist (`.smoke/billing-smoke.ts`, 39 KB). |
| Oct 22 ~04:28 | Workspace was reset to the bare scaffold; platform committed it as `2cf5f3a` ("Initial commit", 0 API files). **The legacy build was wiped from the working tree and its DB (same path `db/custom.db`) was destroyed.** Not in git. |
| Oct 22 09:16–10:47 | Current session rebuilt the app from scaffold as the Phase 6 "compressed foundation" (61 routes, 22 models) — the active, fully tested system. |
| Oct 22 10:47–10:48 | Platform mirror refreshed `/tmp/my-project` with canonical files (schema 09:26, auth 09:27, rbac 09:28, seed 09:37, tests 10:44, docs 10:45, worklog 10:47, DB 10:47) **without deleting** legacy-only files. |

Result: `/tmp/my-project` is a **chimera** — canonical Phase 6 base + orphaned legacy routes. Proof it cannot run or compile as-is:
- Its `prisma/schema.prisma` is the canonical 22-model schema; legacy routes reference ~30 models that don't exist in it.
- `documents/route.ts` imports `requireModule`/`requireFounder` from `@/lib/rbac` — exports that exist in **neither** the legacy nor the canonical `rbac.ts` (they lived in the old rbac that was overwritten mid-refactor).
- Field names in legacy code (`client.businessName`, `user.displayName`) don't exist in the canonical schema (`name`).

**Legacy schema file: unrecoverable** (overwritten before any snapshot/archive). Any restoration must reconstruct models from code usage — field-by-field auditing is part of the plan (§11).

---

## 4. Legacy route inventory — all 102 routes missing from the active project

Legend: **models** = Prisma models the route touches (legacy expectations, not current schema); **auth** = guard found in the route body (`withAuth`/`requireRole` wrappers from the legacy `@/lib/api` layer).

### 4.1 Billing suite (parallel to the active `/api/finance` — 17 routes)
| Route | Methods | Legacy models touched |
|---|---|---|
| `billing/gateway/status` | GET | – (gateway config probe) |
| `billing/invoices` | GET+POST | client, invoice, project, quote, subscription, website |
| `billing/invoices/[id]` | GET+PATCH | invoice, project, website |
| `billing/invoices/[id]/issue` | POST | invoice (DRAFT→ISSUED lifecycle) |
| `billing/invoices/[id]/void` | POST | invoice, paymentAllocation |
| `billing/jobs/run` | POST | – (billing job runner) |
| `billing/payments` | GET+POST | client, payment |
| `billing/payments/[id]` | GET+PATCH | payment |
| `billing/payments/[id]/fail` | POST | payment |
| `billing/payments/[id]/flag-refund` | POST | payment (+notify) |
| `billing/payments/[id]/refund` | POST | payment |
| `billing/payments/[id]/verify` | POST | payment |
| `billing/plans` | GET+POST | servicePlan |
| `billing/plans/[id]` | GET+PATCH+DELETE | servicePlan |
| `billing/quotes` | GET+POST | client, project, quote, website |
| `billing/quotes/[id]` | GET+PATCH | client, project, quote, website |
| `billing/quotes/[id]/status` | POST | quote |
| `billing/settings` | GET+PUT | – (billing settings) |
| `billing/subscriptions` | GET+POST | client, servicePlan, subscription, subscriptionEvent, website |
| `billing/subscriptions/[id]` | GET+PATCH | invoice, servicePlan, subscription, subscriptionEvent, website |
| `billing/subscriptions/[id]/renew` | POST | subscription |
| `billing/subscriptions/[id]/status` | POST | subscription, subscriptionEvent |
| `billing/summary` | GET | – (aggregate) |

*(22 routes; over-represented in heading — see counts in §6.)*

### 4.2 Website & operations platform (the largest missing subsystem)
| Route | Methods | Legacy models touched |
|---|---|---|
| `websites` | GET+POST | client, project, website |
| `websites/[id]` | GET+PATCH+DELETE | client, task, website |
| `websites/[id]/domains` | POST | domain, website |
| `websites/[id]/restore` | POST | website (soft-delete restore) |
| `domains/[id]` | DELETE | domain |
| `deployments` | GET+POST | deployment, project, website |
| `deployments/[id]` | GET+PATCH | deployment |
| `deployments/[id]/status` | POST | deployment |
| `projects/[id]/websites` | POST+DELETE | project, projectWebsite, task, website |
| `projects/[id]/status` | PATCH | project, task |
| `monitoring/checks` | GET | healthCheck |
| `monitoring/checks/run` | POST | website (external URL probe) |
| `monitoring/configs` | GET | incidentWebsite, website |
| `monitoring/configs/[websiteId]` | PUT | monitorConfig, website |
| `monitoring/domains` | GET | domain |
| `monitoring/domains/check` | POST | domain (external probe) |
| `monitoring/summary` | GET | backgroundJobRun, domain, healthCheck, incident, monitorConfig, website |
| `incidents` | GET+POST | incident, user, website |
| `incidents/[id]` | GET+PATCH | healthCheck, incident, incidentEvent, ticket, user |
| `incidents/[id]/notes` | POST | incident, incidentEvent |
| `incidents/[id]/status` | POST | incident |
| `incidents/[id]/tickets` | POST | incident, incidentEvent, ticket |
| `incidents/[id]/tickets/[ticketId]` | DELETE | incident, incidentEvent, ticket |
| `jobs` | GET | backgroundJobRun |
| `jobs/run` | POST | – (monitoring + notification sweep jobs) |
| `maintenance/schedules` | GET+POST | maintenanceSchedule |
| `maintenance/schedules/[id]` | GET+PATCH+DELETE | maintenanceSchedule |
| `maintenance/runs` | GET+POST | maintenanceRun, maintenanceSchedule, user, website |
| `maintenance/runs/[id]` | GET+PATCH | document, maintenanceRun, user |
| `maintenance/runs/[id]/items/[itemId]` | PUT | maintenanceChecklistItem, maintenanceRun, document |
| `maintenance/runs/[id]/report` | GET | deployment, healthCheck, incidentWebsite, maintenanceRun |
| `maintenance/runs/[id]/status` | POST | maintenanceRun |
| `maintenance/runs/generate` | POST | maintenanceRun, maintenanceSchedule |

### 4.3 Communications (Gmail / email ingestion — 12 routes)
| Route | Methods | Legacy models touched | Notes |
|---|---|---|---|
| `gmail/oauth/start` | GET | – | Hand-rolled Google OAuth (node:crypto, no npm OAuth dep) |
| `gmail/oauth/callback` | GET(? ) | emailAccount | `getSessionUser` guard |
| `gmail/status` | GET | emailAccount | |
| `gmail/disconnect` | POST | emailAccount | Uses `@/lib/secret-box` (AES-256-GCM token vault) |
| `gmail/sync` | POST | emailAccount | External Gmail API calls |
| `gmail/sync/runs` | GET | emailAccount, emailSyncRun | |
| `emails` | GET | emailMessage | |
| `emails/[id]` | GET | emailMessage | |
| `emails/[id]/match` | POST | client, emailMatchRule, emailMessage, ticket, ticketMessage | Auto-link emails→tickets |
| `tickets/[id]/messages` | GET+POST | ticket, ticketMessage | **Different ticket model than active** (`ticket`/`ticketMessage` vs `SupportTicket`/`TicketReply`) |
| `tickets/[id]/messages/[messageId]` | GET+PATCH+DELETE | ticket, ticketMessage | |
| `tickets/[id]/messages/[messageId]/send` | POST | emailAccount, emailMessage, ticket, ticketMessage | Sends real email via Gmail |
| `tickets/[id]/messages/[messageId]/reconcile` | POST | emailAccount, ticket, ticketMessage | |

### 4.4 Delivery workflow (briefs / meetings / contacts)
| Route | Methods | Legacy models touched |
|---|---|---|
| `briefs` | GET+POST | brief, client, project |
| `briefs/[id]` | GET+PATCH | brief, meeting, project |
| `briefs/[id]/handover` | POST | brief, client, user (+notify) |
| `briefs/[id]/status` | POST | brief (+notify) |
| `meetings` | GET+POST | brief, client, meeting |
| `meetings/[id]` | GET+PATCH | meeting (+notify) |
| `meetings/[id]/cancel` | POST | meeting (+notify) |
| `meetings/[id]/outcome` | POST | meeting (+notify) |
| `meetings/availability` | GET | meeting |
| `contacts/[id]` | PATCH+DELETE | contact |
| `clients/[id]/contacts` | POST | client |
| `milestones/[id]` | PATCH+DELETE | milestone — **duplicate** of active `projects/[id]/milestones/[mid]` |

### 4.5 Documents
| Route | Methods | Legacy models touched |
|---|---|---|
| `documents` | GET+POST | client, document, project, projectWebsite, website (multipart upload, MIME allowlist, 10 MB cap — reuses `@/lib/storage`) |
| `documents/[id]` | GET+PATCH+DELETE | client, document, project, projectWebsite, website |
| `documents/[id]/download` | GET | document, project, projectWebsite (authenticated file stream) |

### 4.6 Platform utilities & duplicates
| Route | Methods | Notes |
|---|---|---|
| `dashboard` | GET | Aggregate over 18 models — **duplicate** of active founder dashboard data |
| `activity` | GET | Activity feed (separate from current `AuditLog`) |
| `search` | GET | Global search over client, contact, project, task, ticket, website |
| `settings` | GET+PATCH | Key-value `Setting` model |
| `settings/sample-data` | POST+DELETE | Bulk demo-data generator/deleter (**dangerous — excludes from restore**) |
| `auth/profile` | PATCH | **Duplicate** of `PATCH`-able profile fields in active `/api/team/[id]` + `/api/auth/password` |
| `users` | GET+POST | **Duplicate** of active `/api/team` |
| `users/[id]` | GET+PATCH | **Duplicate** of active `/api/team/[id]` |
| `notifications/[id]/read` | POST | Uses **existing** Notification model — additive endpoint |
| `notifications/read-all` | POST | Uses **existing** Notification model — additive endpoint |
| `tasks/[id]/comments` | GET+POST | task, taskComment — additive |
| `integrations/connections` | GET+POST | providerConnection (secret-box) |
| `integrations/connections/[id]` | PATCH+DELETE | providerConnection |
| `integrations/github/repo` | GET | External GitHub API |
| `integrations/github/webhook` | POST(?) | webhookEvent — inbound webhook (signature-verified) |
| `integrations/status` | GET | providerConnection, webhookEvent |

---

## 5. Implementation comparison (legacy vs active)

| Dimension | Active (canonical) | Legacy (`/tmp` remnants) | Compatibility verdict |
|---|---|---|---|
| **npm dependencies** | `package.json` | **Byte-identical** — legacy used zero extra packages (Gmail OAuth hand-rolled on `node:crypto` + `fetch`; GitHub via `fetch`) | ✅ No dependency work needed |
| **Password/session auth** | scrypt + DB sessions, HttpOnly cookie (`auth.ts`) | `auth.ts` **byte-identical** (canonical overwrote it) | ✅ Same session cookie, same `getSessionUser` — legacy routes would authenticate against the active user/session tables |
| **RBAC primitives** | `rbac.ts` (requireUser/requireRole/requireEmployee/withApi…) | `rbac.ts` **byte-identical** — but legacy routes import `requireModule`/`requireFounder` which **no longer exist** in it | ⚠️ Same primitives, missing two helpers to reconstruct during port |
| **API wrapper** | `withApi` + plain `ok(data)` JSON | Legacy `@/lib/api.ts` `withAuth` + `{ok:true,data}` envelope + `parseQuery` list semantics | ⚠️ Different envelope/wrapper — normalize during port (or port the small `api.ts` alongside) |
| **Audit/activity** | `AuditLog` via `logAudit` | `logActivity` → separate `Activity` model | ⚠️ Two audit streams — decide merge vs parallel |
| **Client field names** | `Client.name/contactName` | `client.businessName` (+website relations) | ❌ Hard conflict — code adaptation required (recommended over schema renames) |
| **User field names** | `User.name` | `user.displayName` | ❌ Hard conflict — adapt code |
| **Ticket model** | `SupportTicket`/`TicketReply` | `ticket`/`ticketMessage` (+email send/reconcile) | ❌ Different model names — email-ingest port needs mapping layer |
| **Invoice/Payment/Subscription** | Phase 6 shapes (`finance/*`) | Richer shapes (+`quote`, `servicePlan`, `paymentAllocation`, `subscriptionEvent`, issue/void lifecycle) | ⚠️ Overlap + extension — needs merge design, not blind port |
| **Website entity** | none | `website`, `projectWebsite`, `domain`, `monitorConfig`, `healthCheck`, `incident*`, `deployment` all hang off Website | ➕ Purely additive (new tables) but a large new subsystem |
| **Database data** | Live seeded Phase 6 dataset | Legacy DB destroyed in workspace reset; `/tmp/db/custom.db` is a copy of the **canonical** seeded DB | ➕ No data migration needed — only schema + code |
| **Frontend** | 29 pages (active, tested) | Legacy pages overwritten by canonical — legacy APIs have **no UI consumer** in the active app | ⚠️ Every restored API needs UI work or headless acceptance |
| **Runnability of `/tmp` copy** | Running, tested | Not runnable: no node_modules, missing helpers, schema mismatch | ❌ Reference only |

---

## 6. Feature reconciliation matrix

### ✅ Already present in the active project (no action)
Authentication & sessions · password rotation/reset (founder-mediated) · team & user management · clients · projects + milestones + deliverables · demos + preview authorization + client approval + change feedback · change requests (review→scope→approve→convert) · tasks · support tickets + replies (client portal) · maintenance reports · subscriptions · invoices · payments (record/verify/refund with evidence) · billing questions · finance overview · assets (secure upload/download) · notifications (idempotent) · audit log · approval events (P6-3 workflow) · deployment approval (`/api/projects/[id]/deploy`) · client portal (overview/projects/demos/billing/support/assets) · founder super-user scope.

### ❌ Missing (legacy-only capabilities)
1. **Billing gateway suite**: service plans, quotes, invoice draft→issue→void lifecycle, payment fail/refund-flag, billing settings, gateway status probe, billing job runner, billing summary.
2. **Website & ops platform**: website registry, per-project website links, domains, operational deployment records, documents library, uptime monitoring (health checks, configs, external probes), incident management with timeline/notes/ticket links, background job runner + job history, maintenance schedules + checklist runs (schedule→run→report pipeline).
3. **Communications**: Gmail OAuth connect/sync/status/disconnect, email inbox with client/ticket matching rules, ticket messaging with outbound email send + reconciliation.
4. **Delivery workflow**: briefs with handover, meetings with outcomes/cancellation/availability, contacts (per-client people), client restore (soft-delete).
5. **Platform utilities**: global search, activity feed, settings key-value store, notification read/read-all endpoints, task comments.

### ♻️ Safe to restore (additive schema, no overlap, compatible auth, no external service required)
| Priority | Feature | Why safe |
|---|---|---|
| 1 | `notifications/[id]/read` + `read-all` | Zero schema change (existing Notification model) |
| 1 | `tasks/[id]/comments` | One new table (`TaskComment`), existing Task |
| 1 | `search` | Read-only over existing models (needs website/contact guards until Stage 3) |
| 2 | `settings` | One new table (`Setting`); also required later by secret-box fallback |
| 2 | `documents` (+download) | New `Document` table + existing `storage.ts`; needs field adaptation (drop `website` refs until Stage 3) |
| 2 | `contacts` | New `Contact` table + `clients/[id]/contacts` |
| 2 | `briefs` (+handover/status) | New `Brief` table; reuses notify |
| 2 | `meetings` (+cancel/outcome/availability) | New `Meeting` table (adapt `brief` relation as nullable) |
| 2 | `activity` | New `Activity` table (decision: merge into AuditLog instead — recommend **merge** to avoid dual audit streams) |
| 2 | `jobs` + `jobs/run` | New `BackgroundJobRun` table; runner calls only internal jobs |
| 3 | `websites` + `domains` + `projects/[id]/websites` | Additive Website/Domain tables — gateway to Stage 3 subsystem |
| 3 | `incidents` (+notes/status/tickets) | Additive Incident tables (depends on Website) |
| 3 | `monitoring/*` | Additive tables; makes **outbound URL probes** (network egress — verify in sandbox before claiming) |
| 3 | `maintenance/schedules` + `runs` | Additive; design decision to align with active MaintenanceReport (recommend: schedules/runs FEED MaintenanceReport) |
| 3 | `deployments` | Additive; **must be reconciled** with active P6-3 deployment approval — recommend: Deployment records created only via approved deployments |

### 🔀 Needs design decision before restoration (overlap or risk)
- **Billing suite vs active finance module** — two invoice/payment/subscription implementations must not coexist. Recommendation: keep `/api/finance` as the operational source of truth; port only the missing pieces (ServicePlan catalog, Quotes, Invoice issue/void lifecycle, SubscriptionEvent history, billing settings) as extensions of the **finance** module, not a parallel `/api/billing`.
- **Legacy ticket messaging/email** — requires mapping `ticketMessage`→`TicketReply` + email-account infra (Stage 4).
- **`settings/sample-data`** — bulk delete/create over clients/tasks; exclude from restoration (demo tooling, data-risk).
- **`users` / `auth/profile` / `dashboard` / `milestones/[id]`** — duplicates of active functionality; **do not restore** (would create parallel write paths over the same records).
- **`clients/[id]/restore` + `websites/[id]/restore`** — imply soft-delete columns on/around existing models; needs migration design, not blind port.

### 🌐 External-integration gated (cannot be claimed working here)
- **Gmail OAuth + email sync/send** — needs Google OAuth client credentials + `AGENCYOS_TOKEN_SECRET` (AES-256-GCM key, design already correct in legacy `secret-box.ts`) + network egress. Restore behind the established honest "not connected" pattern until real credentials are provided.
- **GitHub integrations/webhook** — needs repo access + webhook secret.
- **Payment gateway** — legacy had `gateway/status` probe; active portal already shows the honest unavailable state; keep until a gateway is contracted.

---

## 7. Credential rotation & account recovery verification (completed)

| Account | Rotation path | Verified |
|---|---|---|
| founder@agencyos.co.uk | Self-service change (`POST /api/auth/password`) | Old pw 401 · new pw 200 · **other sessions revoked** (old browser session → /login) |
| manager / dev / finance / jordan | Founder-mediated reset (`POST /api/team/[id]/reset-password`, generated 16-char, `mustChangePassword=true`, all sessions revoked) | Old pw 401 · new pw 200 with forced-change flag |
| marta@anchorinn.co.uk | Full recovery loop **end-to-end**: temp login → forced `/change-password` → set own password → portal access | Temp pw 401 after change · new pw 200 · `mustChangePassword=false` |

- Forgot-password flow verified live: request recorded, `PasswordResetToken` row (1 h), founder notification, `AUTH_PASSWORD_RESET_REQUEST` audit entry, honest "email not connected" response, no user enumeration.
- Known gap (honest): `PasswordResetToken` rows have **no consumer endpoint** — recovery is founder-mediated by design; tokens are inert. Documented; no security exposure (tokens cannot be used).

## 8. Git hygiene & secret exposure audit (completed)

Actions taken (commit `7edf650`):
- `git rm --cached .env db/custom.db` — **local runtime files preserved** (verified: files exist, server 200).
- `.gitignore` now covers `db/`, `*.db`, `backups/` (`.env*` was already ignored).

History findings (3 commits scanned: `2cf5f3a`, `7f6ba6a`, `bd106b9`):
- `.env` in history contained **only** `DATABASE_URL=file:/home/z/my-project/db/custom.db` — a local file path, **not a credential**. No API keys, tokens, or private keys anywhere in history.
- Plaintext **demo** passwords existed in tracked `scripts/seed.ts`, `tests/phase6-security.ts`, `worklog.md` — **neutralized**: all six seeded passwords were rotated this session (old passwords verified 401).
- `db/custom.db` remains in history (`7f6ba6a`, `bd106b9`) — contains demo data only + scrypt hashes of now-invalid passwords. Optional follow-up: history rewrite (`git filter-repo`) if the Founder wants a clean history — destructive, not performed.
- New rotated credentials are **kept out of git** — stored in gitignored `backups/CREDENTIALS-2026-10-22.txt`.
- ⚠️ Standing caveat: running `bun scripts/seed.ts` (e.g., before re-running the 124-check suite) resets all accounts to the old documented demo passwords — **any reseed must be followed by re-rotation**.

## 9. Backup & restore verification (completed)

- **Backup created:** `backups/custom-2026-10-22-pre-phase7.db` (online `VACUUM INTO` consistent snapshot of the live DB; sha256 recorded; `backups/` gitignored).
- **Restore verified in ISOLATION** (never against the active DB):
  1. Copied to `/tmp/restore-verify/restored.db` → `PRAGMA integrity_check` = **ok**; 22 tables / 6 users / 3 clients / 2 projects / 4 invoices; founder row present.
  2. **Prisma ORM operated on the restored copy** (isolated `DATABASE_URL`): relational reads OK; write+delete probe OK.
  3. `prisma db push` against the copy: **"already in sync"** — backup conforms to the current schema exactly.
  4. Active DB byte-identical before/after (sha256 `b202823…` unchanged).
- **Restore runbook (production):** stop app → `cp backup.db db/custom.db` → `bunx prisma generate` (if needed) → start → verify `/login` + dashboard counts. Also back up `uploads/` (currently empty).
- **Still open:** no *automated* backup schedule exists (single manual verified backup so far).

## 10. Security verification summary (this checkpoint)

- **Founder unrestricted access:** browser walk of all 12 sidebar modules + maintenance + finance + team + audit + settings — all render real data; dashboard stats match DB exactly (3 clients / 2 projects / 2 tickets / £678.00); founder portal view with client-scope selector works; API 200s incl. cross-client portal scope.
- **Client isolation:** marta → own data only (portal list scoped, foreign project **404**, internal APIs **403**, `/app` → `/portal` redirect).
- **Employee restrictions:** dev/manager **403** on finance/team/audit; dev **403** on portal APIs; finance read-projects **200** (by RBAC design), team **403**.
- **Unauthenticated:** 401 across tested APIs.
- **Phase 6 suite:** 124/124 (existing artifact `docs/PHASE6-TEST-RESULTS.txt`). Not re-run in this checkpoint — it requires reseeding, which was forbidden ("do not reset the database").

## 11. Staged restoration plan (PROPOSAL — awaiting Founder approval)

**Ground rules:** active Phase 6 portal, security controls and DB are preserved at every stage · legacy source is read as reference, never copied wholesale · every stage starts with a fresh verified backup and ends with a Founder checkpoint.

- **Stage 0 — DONE (this checkpoint):** backup + isolated restore-verify · rotation + recovery verification · legacy archive (`/home/z/legacy-agencyos-pre-phase6-20261022.tar.gz`) · git untracking · this report.
- **Stage 1 — Decision gate (no code):** Founder approves scope: which of §6 groups to restore, the billing-merge recommendation, the audit-vs-activity merge, deployment-records alignment, and exclusion list (`sample-data`, duplicate user/profile/dashboard/milestone routes). Output: approved scope note appended to worklog.
- **Stage 2 — Low-risk additive platform (proposed):** Setting · TaskComment · notifications read/read-all · Contact · Brief · Meeting · BackgroundJobRun/jobs · Documents (adapted) · global search. Schema: additive `db push`; **zero changes to existing tables**. Field adaptations (`businessName`→`name`, `displayName`→`name`, `{ok,data}`→plain) applied per-route during port. Regression gate: `tsc --noEmit`, `bun run lint`, full 124-check suite (accepting documented reseed + re-rotation), new module smoke checks, browser spot checks, sticky-footer/layout checks.
- **Stage 3 — Website & operations platform (proposed):** Website/ProjectWebsite/Domain → Deployments (gated by the existing approval workflow) → Incidents → Monitoring (+ real outbound probes) → Maintenance schedules/runs feeding the existing MaintenanceReport. UI work required (legacy pages are gone) — build fresh pages in the active design system. Regression gate: same as Stage 2 + cross-module regression (portal isolation suites §1/§6 of the test file).
- **Stage 4 — External integrations (only with real credentials):** Gmail/email ingest + ticket messaging send, GitHub integrations, payment gateway, email delivery. Implemented with the honest not-connected pattern until secrets exist in `.env`; verified against sandbox/test tenants only.
- **Every stage checkpoint:** verified DB backup · 124/124 suite · lint+tsc clean · worklog entry · Founder sign-off before the next stage.

## 12. Data risks & open items

1. `/tmp/my-project` is volatile (may be wiped with `/tmp`) — protective archive exists; **do not delete the `/tmp` copy** until Founder approves (per instruction).
2. No automated backup schedule yet — recommend a daily `VACUUM INTO` + upload-dir copy job once Stage 1+ begins.
3. Legacy DB (old build's data) unrecoverable — accepted: it held only build-in-progress test data; no client data ever existed in it.
4. Dual audit streams risk (AuditLog vs Activity) — recommend merge in Stage 2.
5. Reseed caveat: seed restores old demo passwords → re-rotation required after any reseed (documented in credentials file).
6. `PasswordResetToken` consumer endpoint absent (honest gap, inert tokens).
7. In-memory rate limiting / no CSP/CSRF tokens / no automated rollback — carried from Phase 6 audit (`docs/PRODUCTION-READINESS.md`), unchanged.

## 13. Artifacts produced by this checkpoint

| Artifact | Purpose |
|---|---|
| `docs/RECONCILIATION-REPORT.md` | This report |
| `backups/custom-2026-10-22-pre-phase7.db` | Verified consistent DB snapshot |
| `backups/CREDENTIALS-2026-10-22.txt` | Rotated credentials (gitignored) |
| `/home/z/legacy-agencyos-pre-phase6-20261022.tar.gz` | Legacy build archive (protective) |
| `tests/legacy-route-inventory.ts` | Reproducible route-inventory analysis |
| `tests/checkpoint-db-inspect.ts` | Read-only DB inspector used for verification |
| Git `7edf650` | Untrack `.env`/`db/custom.db`, gitignore hardening |

---

**Bottom line:** one canonical project (`/home/z/my-project`), one database (`db/custom.db`), one authoritative worklog; the legacy build is archived reference material with real, partially-portable features; all security controls verified live; nothing has been deleted, merged, or restored. **Phase 7 remains blocked pending Founder review of §6 and §11.**
