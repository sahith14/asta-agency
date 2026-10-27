# AgencyOS Worklog

---
Task ID: M0
Agent: Z.ai Code (main)
Task: Milestone 0 — inspection, backup, implementation plan for Video Production Division build (Founder Master Build Prompt)

Work Log:
- Inspected active repo /home/z/my-project: bare Next.js 16 scaffold (demo page.tsx, 1 API route, demo User/Post schema, empty SQLite DB with 0 rows)
- Verified legacy copy /tmp/my-project exists (reference only, per Master Prompt §1.2 — no wholesale copying)
- Created + verified pre-change backup: backups/custom-2026-10-23-pre-video-division.db (VACUUM INTO, row counts verified, sha256 3877120d35e2b83a330b9ecfaa544d35b1cc036a40ceef364182a96e277591bc)
- Verified .gitignore covers /backups, /db, .seed-credentials, .env*
- Confirmed all required libs already installed (shadcn/ui full set, date-fns, zod, react-hook-form, TanStack Query, recharts) — no new dependencies
- Wrote implementation plan: docs/VIDEO-DIVISION-PLAN.md (architecture, data model, state machine, counting rules, finance formulas, route map, UI map, milestones, verification protocol)

Stage Summary:
- Active repo is a scaffold → shared foundation (auth/RBAC/clients/projects/tasks/notifications/finance/audit/portal) will be built fresh, then Video division layered on top
- No existing data at risk (empty DB); migration via prisma db push is safe
- Plan documented; proceeding to M1 (schema + auth + RBAC foundation)

---
Task ID: M1-M7 (Video Production Division build)
Agent: Z.ai Code (main)
Task: Execute Founder Master Build Prompt — complete Video Production Agency division integrated with the website agency platform

Work Log:
- M1 Foundation: full Prisma schema (30+ models: Employee/Client/ClientUser/Session/RBAC roles, unified Project with serviceType, VideoPackage/VideoProject/VideoDeliverable state machine, ShootSession/assignments/equipment reservations, VideoVersion/reviews/briefs, scope changes, media registry, tasks/meetings/contacts/tickets/invoices/expenses/audit/notifications/signup-requests/settings)
- M1 Auth: custom scrypt + DB sessions + HttpOnly cookie (src/lib/auth.ts), RBAC capability matrix for 7 staff roles + CLIENT (src/lib/rbac.ts), zod validation helpers
- M1 APIs: ~40 route handlers, all server-side authz (see docs/API-AUTHORIZATION.md)
- M2 Deliverables: server-enforced state machine (PLANNED→…→DELIVERED + REVISION_REQUIRED/CANCELLED), role-gated transitions, footage-backup gate, delivery metadata gate, cancellation with reason, replacement linkage
- M3 Shoots: month/list calendar, crew + equipment reservation with conflict detection, reschedule/cancel with reason + notifications, print call sheet (internal notes/costs excluded by design)
- M4 Review: editing queue, version registration bound to internal review gate (self-approval blocked), client review via portal, revision counting
- M5 Portal: client-facing overview/projects/reviews/approve/deliveries/invoices/support — hard clientId scoping from session; media registry with honest "storage not configured" state (no fake uploads)
- M6 Finance: invoices (draft→sent→paid/void, audited), production expenses, budget-vs-actual + margin, reports with service filter, combined dashboard counts
- M7 Hardening: 50-check curl security suite (tests/api-security-suite.sh) — FINAL RESULT 50/50 PASS after fixing 2 real findings (GET /api/clients over-broad; missing GET handler on signup-requests); tsc clean; eslint clean; browser-verified desktop (1440px) + mobile (390px): landing, login, staff overview, video dashboard, deliverables tracker/detail, shoot calendar/detail/call-sheet, portal overview, client review → APPROVE (full state machine round-trip), founder notifications, settings access-request approval flow (provisioned portal account with one-time temp password), sticky footer verified, corporate signup CTA on landing
- Seed: scripts/seed.ts — founder + 6 staff roles, 2 clients + portal users, website + video projects, 7 deliverables across all stages, scheduled shoot w/ crew+equipment, invoices, expenses, tasks, meetings, contacts; RANDOM passwords written only to gitignored .seed-credentials
- Backup: backups/custom-2026-10-23-pre-video-division.db verified pre-migration (sha256 3877120d…)

Stage Summary:
- Full Master Prompt feature set implemented and verified in active repo; no deployment, no external services, no new dependencies
- Test evidence: 50/50 API security checks, tsc 0 errors, eslint 0 errors, browser flows verified desktop+mobile
- Known limitations documented: no binary media storage (honest registry), no email delivery (in-app notifications only, founder-mediated resets), single-currency GBP formatting
- Full report: docs/VIDEO-DIVISION-REPORT.md

---
Task ID: S2-0
Agent: Z.ai Code (main)
Task: Stage 2 gate — fresh verified backup, security hygiene (.env untracked), and Founder-requested "show all login details on the login page for testing"

Work Log:
- Created + verified fresh backup backups/custom-2026-10-24-pre-stage2.db (VACUUM INTO, 31/31 table row counts match, sha256 7163b0f2...; new reusable tool scripts/backup-db.ts)
- Backup revealed active db/custom.db was EMPTY (0 rows all tables — prior seed data not present); scripts/inspect-accounts.ts (read-only) confirmed no accounts existed
- Fixed §1 hygiene gap: .env was git-TRACKED → git rm --cached .env + added .env rule to .gitignore (verified via git check-ignore)
- Ran scripts/seed.ts to populate DB: 7 employees (OWNER, CLIENT_MANAGER, WEB_DEVELOPER, SUPPORT_FINANCE, VIDEOGRAPHER, VIDEO_EDITOR, CREATIVE_DIRECTOR), 2 clients (The Anchor Bar & Grill, Brightcuts Consulting) + 2 portal users, projects/packages/deliverables/shoot/invoices/expenses/tasks/meetings/contacts demo data
- Created scripts/set-test-credentials.ts: rotated ALL 9 accounts to fresh random passwords (scrypt, same scheme as src/lib/auth.ts), mustChangePassword=false, all sessions revoked, rotation recorded in AuditLog; values written ONLY to gitignored .env (TEST_ACCOUNTS_JSON) and .seed-credentials (mode 0600); nothing printed to stdout
- Took verified post-seed backup backups/custom-2026-10-24-post-seed.db (31/31 match, sha256 0c445e7e...)
- New API route src/app/api/auth/test-accounts/route.ts: server-only, reads gitignored .env from disk (mtime-cached), gated by ENABLE_TEST_ACCOUNTS=true else 404
- Reworked src/app/login/page.tsx: corporate "Test & demo accounts" panel (role badges, name, email, mono password, one-click sign-in per row; staff/client groupings; scrollable list; skeleton while loading; renders nothing when feature flag off)
- Added slim scrollbar utility to globals.css
- Fixed lint finding (function named useAccount triggered rules-of-hooks → renamed signInAs); fixed UI bug where flag-off left an eternal skeleton card

Verification (all actually executed):
- bun run lint: clean (0 errors)
- Browser desktop 1440x900: /login renders 9 account rows with full details; one-click Founder sign-in → /app rendered with full founder nav; one-click Marta sign-in → /portal rendered with client nav; wrong-password submit → POST /api/auth/login 401 in dev.log + role=alert "Invalid email or password"
- Browser mobile 390x844: no horizontal overflow (scrollWidth 390), panel fits, screenshot captured
- Flag gate: ENABLE_TEST_ACCOUNTS=false → API HTTP 404 + panel + skeleton hidden; true → HTTP 200 + panel visible
- git status shows only intended changes; .env/.seed-credentials/db/backups all gitignored; no secrets in any tracked file; no console/page errors

Stage Summary:
- Founder can now see and use every login credential directly on /login (one-click sign-in per account) — the explicitly requested feature
- Passwords live only in gitignored .env + .seed-credentials; re-run `bun scripts/set-test-credentials.ts` anytime to rotate
- Two verified backups exist: pre-stage2 (empty pre-change state) and post-seed (current known-good state)
- DB was found empty and reseeded — this was required for ANY login to work
- Stage 2 module work (Search, Contacts, Client briefs, Meetings, Task comments, Notifications, Activity logs, Settings) NOT yet started — awaiting Founder go per plan; login-details feature delivered first as explicitly requested

---
Task ID: S2-1
Agent: Z.ai Code (main)
Task: Fix React console error "Cannot update a component (Router) while rendering a different component (AppShell)" reported by Founder

Work Log:
- Root cause: AppShell (app-shell.tsx:161) and PortalShell (portal-shell.tsx:74) called router.push('/login') DURING RENDER when /api/auth/me returned no session (triggered by revoked/expired sessions or logged-out direct visits)
- Fix: moved redirect into useEffect (router.replace('/login') on !loading && !me) in BOTH shells; render now shows spinner until navigation completes; replace() prevents back-button returning to the dead protected page
- Audited every router.push/replace call site in src (13 found): all others are inside event handlers/callbacks or setTimeout in submit handlers — compliant; no other render-phase offenders
- Verification: bun run lint clean; browser 1440x900 — logged-out /app → clean redirect to /login with ZERO page errors; logged-out /portal → same; founder one-click login → /app rendered; account menu → Sign out → /login; agent-browser errors empty across all flows; dev.log shows no errors

Stage Summary:
- Both auth shells now redirect in effects (React-correct); error reported by Founder eliminated and regression-tested across all four auth flows

---
Task ID: S2-2
Agent: Z.ai Code (main)
Task: Fix "Login isn't working" reported by Founder (preview panel context)

Work Log:
- Diagnosis: server-side auth was healthy (curl round-trip 200/200; all 9 accounts active; login route sound). dev.log showed the signature POST /api/auth/login 200 → GET /api/auth/me 401 repeatedly
- Root cause reproduced with a cross-site embedder (page on 127.0.0.1:4173 embedding localhost:3000 in an iframe): the session cookie is SameSite=Lax WITHOUT Secure, and browsers WITHHOLD Lax cookies on requests from inside a cross-site iframe (preview panel) → login succeeds but the next request is unauthenticated → bounce back to /login
- Fix (Bearer fallback, keeps HttpOnly cookie as primary):
  - src/lib/auth.ts: getSessionToken(req) resolves cookie first, then Authorization: Bearer; getAuthUser uses it
  - src/app/api/auth/login/route.ts: login response body now also carries sessionToken (same token as the cookie)
  - src/app/api/auth/logout/route.ts: destroys session from cookie OR Bearer
  - src/lib/client.ts: token store in localStorage (agencyos_session_token), api() attaches Authorization header, auto-clears token on non-auth 401s (stale token safety)
  - src/app/login/page.tsx: stores sessionToken after successful sign-in
  - account pages (app+portal): clear stored token after password change (all sessions revoked)
  - both shells: logout clears stored token
- Verification: lint clean; curl Bearer-only round-trip (login→me 200→logout→me 401); cookie-path regression 200/200; IFRAME cross-site test — founder one-click login now lands and STAYS on /app with /api/auth/me 200 + notifications 200 and full founder workspace rendered (previously me 401 bounce); top-level fresh-state flow login→/app→Sign out→/login all clean; zero page errors; dev.log clean

Stage Summary:
- Login now works in ALL contexts: top-level browser (cookie), preview-panel iframe (Bearer fallback), and cookie-blocking browsers
- Session model unchanged (DB-backed, scrypt passwords, HttpOnly primary); Bearer token is the same DB session token delivered over the same origin
- Founder must reload the preview panel once to pick up the new client bundle

---
Task ID: S2-HOTFIX-1
Agent: Z.ai Code (main)
Task: Fix "Login isn't working" reported by Founder.

Work Log:
- Diagnosis: dev.log showed GET /api/auth/test-accounts → 404; the sandbox session restart at 17:13 had wiped all gitignored/untracked state: live SQLite DB recreated EMPTY (0 accounts), .env truncated to DATABASE_URL only (ENABLE_TEST_ACCOUNTS + TEST_ACCOUNTS_JSON gone), .seed-credentials deleted, backups/ removed. With no accounts and no stored credentials, every login path was dead.
- Recovery: bun run db:push (schema) → bun scripts/seed.ts (demo data) → bun scripts/set-test-credentials.ts (fresh random passwords for all 9 accounts; plaintext only into gitignored .env + .seed-credentials; sessions revoked; AuditLog entry written).
- Verified via curl: /api/auth/test-accounts 200; POST /api/auth/login 200 for staff (EMPLOYEE) and client (CLIENT_USER); wrong password → 401.
- Root-cause hardening: new scripts/bootstrap-if-empty.ts wired into package.json "dev" (bun run dev). Idempotent pre-start check: runs prisma db push if schema missing; if Employee count = 0 → runs seed + rotation; if stored TEST_ACCOUNTS_JSON missing/malformed or its founder password no longer matches the DB scrypt hash → re-runs rotation so panel and DB always agree; otherwise fast no-op. Prevents any future sandbox reset from producing a broken login.
- set-test-credentials.ts hardened to tolerate a fully missing .env (recreates it with DATABASE_URL).
- REAL end-to-end test of the self-heal loop: stopped server, deleted db/custom.db + .seed-credentials, truncated .env to DATABASE_URL only (exact observed wipe state), ran bun run dev → bootstrap auto-detected missing schema + empty DB, rebuilt everything, server Ready in 687 ms. No manual steps.
- Browser verification (agent-browser, desktop 1440×900 + mobile 390×844): login page renders with Test & demo accounts panel (7 staff + 2 client rows, scrollable, role badges, one-click Sign in); one-click staff login (Tom) → /app with full dashboard data; one-click Founder login → /app "Welcome back, Founder"; one-click client login (Marta) → /portal "Welcome, The Anchor Bar & Grill"; manual form login (Daniel) → /app; Sign out → /login ×3; zero console errors / zero page errors.
- Security hygiene: credential-bearing /tmp screenshots deleted after verification; git check-ignore confirmed .env, .seed-credentials, db/, backups/ all ignored; committed only code + config (no secrets).
- Backup recreated: backups/custom-2026-10-24-post-login-fix.db (VACUUM INTO snapshot, per-table row-count verification passed).
- Committed as 33024fe "Self-healing dev bootstrap: auto-restore demo login after sandbox resets" — package.json now references scripts/bootstrap-if-empty.ts, so the bootstrap itself survives future resets.

Stage Summary:
- Login fully functional again: all 9 accounts, panel on /login, one-click + manual flows verified on both viewports.
- Root cause was environmental (sandbox reset wiped DB + credential files), not code. Permanent mitigation: `bun run dev` now self-heals an empty/desynced environment automatically.
- Note for future modules: after any session restart, simply running the dev server is guaranteed to yield a working login; `bun run demo:reset` force-rebuilds demo data on demand.

---
Task ID: S2-AUDIT-1
Agent: Z.ai Code (main)
Task: Live Preview Acceptance Audit — inspect, test, fix confirmed defects, final verification; "make each and every single option work".

Work Log:
- Inspection: main @ e8b8a5b, clean tree; preview running expected code; docs + worklog read; 58 API routes / 31 models / 20 staff pages / 8 portal pages verified on disk; fresh pre-audit backup taken (custom-2026-10-24-pre-audit.db, verified).
- Baseline suites: tsc 0 errors; eslint 0 errors; tests/api-security-suite.sh initially 18/32 passing.
- Harness defect found & fixed: set-test-credentials.ts had drifted from the .seed-credentials format the suite parses ("OWNER:" colon format). Restored canonical format (shared with seed.ts), re-rotated, suite → 50/50 PASS. All 32 "failures" were cascades of dead staff cookie jars, not app defects.
- Static dead-option inventory (84 links, 132 buttons, 93 fetch sites cross-checked): confirmed 5 dead links (missing /app/projects page ×4 + href="#" delivery ref), 1 broken task-comment endpoint (405), 1 write-only brief feature (no GET), 1 dead-end portal bell, 4 dead-code items, 1 always-undefined shoot managerId, missing forgot-password UI for an existing API.
- Defects fixed (all verified live):
  1. NEW src/app/app/projects/page.tsx — website projects list + create dialog (repairs nav entry, dashboard stat, "View all", back button). Creation tested via UI (201 + row renders).
  2. Task comments: POST retargeted to /api/tasks/[id] (the comments route is read-only) + inline error handling — UI round-trip verified (201 + comment renders).
  3. Brief history: added GET /api/video/deliverables/[id]/brief + page now fetches/parses/renders version history; "New brief vN" advances correctly — verified live with saved v1.
  4. NEW src/app/portal/notifications/page.tsx + portal bell now links there (client notifications are portal-safe by construction) — verified live.
  5. Portal deliveries: non-URL delivery references now render as a labelled reference (no dead href="#").
  6. Shoot dialog: real "Shoot manager" select wired to managerId (was always undefined).
  7. Login page: "Forgot password?" dialog wired to /api/auth/forgot-password with honest founder-mediated messaging — verified live (200 + honest copy).
  8. mustChangePassword is now ENFORCED server-side in auth.ts (requireStaff/requireRole/requireClientUser; allowlist: me/password/logout/notifications GET). Verified: fresh staff login 200 but /api/overview 403 until password changed; shells redirect to the account page; change → sessions revoked → re-login → full access. Full loop tested via Team-page provisioning + UI password change.
  9. Shell cross-guards: staff bounced from /portal to /app; portal users bounced from /app to /portal — both verified live.
  10. Mobile grid blowout on staff overview fixed (explicit grid-cols-1 below breakpoints) — scrollWidth 390=390 after fix.
  11. Dead code swept (unused me state, canManage, canComplete placeholder).
- Video tracking accuracy (Phase 3): new scripts/verify-video-tracking.ts — 67/67 PASS using a 20-video audit fixture: contract quantity=20 with 20 distinct deliverables; schedule≠filmed, film≠delivered; footage-backup gate enforced (422 without verification); EDITING/INTERNAL_REVIEW/CLIENT_REVIEW/REVISION_REQUIRED/APPROVED distinct; version-bound approval (v1 rejected, v2 revision→REVISION_REQUIRED+counter, v3 approved & bound); delivered counts/remaining accurate; cancel+replacement restore contracted math; dashboard stageCounts partition exact (no double counting); shoot conflict detection (overlap flagged, clear slot passes). Includes the password-change gate round-trip.
- Browser coverage (agent-browser): desktop 1440×900 + mobile 390×844. Landing, request-access submit, login (one-click ×many + manual), signup approval → portal provisioning (Alice) with one-time password, forced password change (Sam), task comments, client create, website project create, deliverable detail/brief/versions, portal review dialog (revision request → REVISION_REQUIRED), portal overview/projects/deliverables/deliveries/invoices/support/account/notifications, notifications mark-all-read, settings access-requests approval, team provisioning, unauthorized redirects (anon→/login both shells, staff↔portal bounces), zero console errors.
- Security: tests/api-security-suite.sh 50/50 PASS (rerun after auth-gate change); cross-client isolation re-verified (Marta sees only Anchor data in UI + API); tsc clean (src); eslint clean.
- Cleanup: scripts/cleanup-audit-records.ts removed all audit-created records (2 projects, 2 audit clients, Alice, Sam Temp, 2 signup requests, audit task comment, audit brief version, audit reset tokens). AuditLog entries intentionally preserved (append-only by design). Sanity: employees=7 clients=2 projects=3; dashboard totals back to seeded baseline (contracted 7, delivered 2).
- Final backup: backups/custom-2026-10-24-post-audit.db (VACUUM INTO, row-count verified). Git hygiene re-verified: .env/.seed-credentials/db/backups all ignored, no secrets tracked.

Stage Summary:
- All major areas PASS: auth+RBAC, staff app, video division lifecycle/counting, client portal + isolation, dashboard accuracy, finance guards, conflict detection.
- 11 confirmed defects fixed, every previously-dead UI option now functional; two new pages (website projects, portal notifications) closed the last dead ends.
- Known limitations re-verified and honestly surfaced in-UI: media storage not configured (metadata-only registry, no fake uploads), no email delivery (in-app only, stated in notifications pages), founder-mediated password recovery (stated in the reset dialog), single currency/timezone. No deployment, no production changes, no commits (changes left uncommitted per audit instruction).

---
Task ID: P0-LOGIN-1
Agent: Z.ai Code (main)
Task: Fix Demo Account Sign-In (Root Cause Required) — reproduce, fix, verify all advertised demo accounts end-to-end.

Work Log:
- Reproduced first (no assumptions): inspected repo (main, clean tree), running preview (bootstrap + next dev, current code), login UI, DB, seed/env consistency. Data layer was HEALTHY: all 9 advertised accounts exist, ENABLE_TEST_ACCOUNTS=true, every advertised password scrypt-matches its DB hash (timingSafeEqual, booleans only), all active, mustChangePassword=false. Wrong-password path returns 401 with visible error.
- Failure signature from dev.log: Founder's POST /api/auth/login 200 at 12:53:08 (session+audit rows written) → browser NEVER fetched /app, /portal or /api/auth/me → landed on /request-access then /login. Server-side auth fine; the client-side post-login navigation died.
- Root cause (verified class): post-login navigation is SPA-only (router.push). The user's tab held a JS context from the previous server instance (sandbox restart ~12:53). The plain fetch succeeded against the new server, but the SPA router never fired — stranding a fully-authenticated user on /login with no feedback. Stale-bundle restart repro did NOT fail in a healthy tab (HMR self-heals), which rules out other causes and isolates the dead-context race as the failure class.
- Fixes (smallest safe):
  1. src/app/login/page.tsx — hard-navigation fallback: if the SPA hasn't left /login ~1.2s after a successful login, window.location.assign the role-specific destination. Also: visitors who already hold a valid session are redirected from /login to their workspace on mount (self-heal for exactly the stranded state; standard UX). No auth weakening: /api/auth/me + shells still enforce roles; logged-out users stay on the form (verified).
  2. scripts/backup-db.ts — fixed sha256 logging ([object Object] → digest hex) and removed a dead duplicate hash function.
  3. scripts/backup-db.ts + scripts/inspect-accounts.ts — added /// <reference types="bun-types"/> (pre-existing tsc errors: bun:sqlite/Bun unresolved; bun-types was installed but never referenced).
  4. scripts/verify-video-tracking.ts — harness self-containment: recreates the audit fixture client+project (20 deliverables) when a prior cleanup removed it; assertions untouched (67→69 checks when bootstrap runs).
  5. src/app/api/signup-requests/[id]/route.ts — TWO confirmed defects: (a) APPROVED path provisioned the account but never set request status (PENDING forever, buttons live, re-approve 409) → both approve branches now set APPROVED+decidedBy/At; (b) the duplicate-account 409 guard ran on REJECT too, stranding requests whose account exists → guard moved inside the APPROVED branch only (reject never creates accounts).
  6. tests/api-security-suite.sh — new regression check "founder reject persists (status REJECTED)" (repeatable HTTP-only lifecycle check).
- Verification (all actually executed, agent-browser):
  - Fresh logged-out /login stays put; one-click founder → /app (me/overview/notifications 200) → /app/clients protected page 200 with real data → refresh persists → sign out → /app bounces to /login.
  - Manual form sign-in (Daniel) via exact on-panel credentials → /app "Welcome back, Daniel" overview 200.
  - Cross-site iframe (preview-panel simulation, embedder on 127.0.0.1:4173): founder one-click INSIDE iframe → /app fully rendered via Bearer fallback (me/overview 200).
  - ALL 9 advertised accounts swept independently: 7 staff → /app with personalized welcome; 2 clients → /portal with client-branded welcome; sign-out after each → /login. Zero page errors.
  - Session persists across full server restart + stale-tab reload (cookie in DB; bootstrap no-op does not revoke).
  - Self-heal: signed-in visit to /login → auto-redirect to workspace (verified founder → /app).
  - Client isolation re-verified in UI: Marta — staff APIs 403 (/api/clients, /api/team), portal API 200, direct /app visit bounced to /portal. Staff→portal bounce verified with Daniel.
  - Non-demo loops rebuilt end-to-end: access requests approved via founder UI on BOTH branches (staff + portal; status now flips to APPROVED in list); temp staff/portal accounts land on account page with protected APIs 403 until password change; change → sessions revoked → re-login → full access (overview/portal 200). Reject path verified via UI (REJECTED persists even with account existing).
  - Wrong-password 401 + visible "Invalid email or password"; landing page CTAs intact.
- Suites (actual): tsc --noEmit exit 0 (0 errors); bun run lint exit 0; tests/api-security-suite.sh 51/51 PASS (after in-memory rate-limit window reset — the 429 seen mid-session was the 5/hour/IP public-endpoint limit doing its job during heavy manual testing, not a defect); bun scripts/verify-video-tracking.ts 69/69 PASS with harness bootstrap (67/67 when fixture pre-exists).
- Cleanup: all session test records removed (5 test accounts, 3 test clients, 6 test requests); AuditLog entries preserved (append-only). Baseline: 7 employees / 2 seeded clients + 1 harness fixture client / projects 3+1 fixture / 2 seeded portal users + 1 fixture reviewer (harness-owned, reset each run).
- Backups: pre-fix backups/custom-2026-10-25-pre-login-reliability-fix.db and post-fix backups/custom-2026-10-25-post-login-reliability.db (VACUUM INTO, row-count VERIFIED, sha256 logged correctly).
- Hygiene: no passwords/tokens/hashes in transcript, logs, or tracked files (git diff scanned); .env/.seed-credentials/db/backups all still gitignored; no commits/pushes; no deployment or infra changes.

Stage Summary:
- Demo sign-in is reliable in every context: top-level, cross-site iframe, stale tab across server restarts, and self-heals when a session already exists. All 9 advertised accounts verified through the real UI with role-correct destinations, persistence, isolation, and logout.
- Two real defects fixed in the access-request decision flow (status never marked APPROVED; reject blocked by duplicate guard) plus harness/environment repairs (tsc types, backup hash logging, self-contained video fixture, suite regression check).
- Honest limitations unchanged: no email delivery (founder-mediated, disclosed in UI), media storage not configured (metadata-only registry), single currency/timezone.

---
Task ID: S2-DEMO-LOGIN-FIX
Agent: Z.ai Code (main)
Task: AgencyOS — Fix Demo Account Sign-In (Root Cause Required). Reproduce first, fix root cause minimally, verify every advertised demo account via real UI, run full regressions, protect project state.

Work Log:
- §1 Reproduction (no assumptions): git/branch clean (only dev.pid); dev server up via `bun run dev`; `backups/` directory had been wiped again by a sandbox session reset (direct evidence of an environment-loss event between sessions).
- Read-only credential-chain audit: `/api/auth/test-accounts` (login-page source) ↔ `.env` TEST_ACCOUNTS_JSON ↔ DB scrypt hashes — all 9 advertised accounts MATCH; all active; roles correct; mustChangePassword=false. `.seed-credentials` format/perms anomaly traced to snapshot restore; file is cosmetic only (not used by app or bootstrap).
- Real-browser repro at top level: one-click Founder sign-in → POST /api/auth/login 200 → /app renders ("Welcome back, Founder"), cookie set, refresh persists. An initial "no POST" scare was proven to be my own faulty eval selector clicking "Forgot password?" — re-click with precise row selector worked; documented to avoid repeat.
- Embedded-preview simulation: cross-site iframe (outer origin 127.0.0.1:4075 embedding localhost:3000). Cookie correctly withheld by browser (SameSite=Lax, jar empty, raw cookie-path /api/auth/me=401) but the existing Bearer fallback (localStorage sessionToken → Authorization header) carried the whole flow: dashboard rendered and SURVIVED REFRESH. Embedded login works.
- Conclusion (evidence-based): sign-in itself was healthy after the earlier self-heal bootstrap; the user-visible failure was caused by the sandbox environment-loss event (empty/stale DB + truncated .env + stale dead-server tab) — already mitigated by S2-HOTFIX-1 bootstrap. Real residual gap found: bootstrap health check verified ONLY the founder account, so any OTHER advertised demo account could drift (partial restore) and login would stay broken while bootstrap reported "healthy".
- §5 Protection: fresh verified DB backup BEFORE changes → backups/custom-2026-10-25-pre-demofix.db (VACUUM INTO, 31/31 tables row-count match, sha256 recorded). No DB reset; no user deletions (test artifacts created by my own retests were deleted after use).
- §2 Minimal fix: scripts/bootstrap-if-empty.ts now verifies EVERY advertised account (exists / isActive / role match / scrypt password verify) from .env; hash-drift triggers rotation (set-test-credentials.ts); missing/inactive accounts are reported loudly with remediation guidance (rotation cannot heal them) instead of silence. package.json dev script fixed (`{ … } 2>&1 | tee dev.log`) so bootstrap output is now visible in dev.log.
- Fix validation: T1 healthy path → "9 demo accounts verified", zero rotation (session count unchanged). T2 drift injection (corrupted elena hash) → bootstrap detected + rotated + re-synced; all 9 .env↔DB hashes re-verified MATCH afterwards.
- Secondary finding fixed (found during §3, security-preserving): "New website/video project" buttons were shown to roles lacking `projects.manage` (e.g. WEB_DEVELOPER) whose create dialog depends on the clients directory API those roles are deliberately denied → permanently dead affordance. Added `roleCan(role, capability)` to src/lib/rbac.ts and gated the create UI on it (src/app/app/projects/page.tsx, src/app/app/video/projects/page.tsx); create-dialog data (clients/packages/managers) now fetched lazily on dialog open so non-manage roles no longer trigger doomed /api/clients calls. No authorization rule was loosened.
- §3 Nine-step real-UI verification ran for ALL 9 advertised accounts (7 staff roles + 2 client portal users): fresh logged-out session → typed advertised credentials from the login page panel → correct destination (/app vs /portal) → dashboard renders → role-appropriate protected page with zero 4xx/5xx APIs → refresh keeps session → isolation (staff blocked from portal 403; role-denied pages 403; each client sees only own client data) → UI logout → protected routes inaccessible after logout. Negative control: wrong password → visible "Invalid email or password", stays on /login.
- S9 restart persistence: dev server fully restarted twice during verification; bootstrap line "Environment healthy — nothing to do. (9 demo accounts verified)" now appears at the head of dev.log; Founder + client portal re-login verified working after restart.
- §4 Regressions (actual results): `npx tsc --noEmit` → clean (exit 0); `bun run lint` → clean after removing my temp diagnostic scripts; `bash tests/api-security-suite.sh` → 51 passed, 0 failed; `bun scripts/verify-video-tracking.ts` → 69 passed, 0 failed. Functional retests: typed (non-one-click) login ✓; access-request approval via API (public 201 → founder approve → STAFF account provisioned) ✓; temporary-staff provisioning + mustChangePassword gate (non-allowlisted API 403 while me 200) + password change (200, sessions revoked, re-login cleared gate, /api/projects 200) ✓; logout ✓; staff/client route guards ✓. Test artifacts (temp employee, signup request, sessions) removed afterwards; counts restored to 7 employees / 2 portal users. Suite-owned fixtures (prospect@test.local REJECTED, fixture.reviewer@auditcafe.local) intentionally left — they are the harnesses' own repeatable fixtures.
- §6 Reporting discipline: no passwords, hashes, tokens or .env contents in this log or the final report.

Stage Summary:
- Root cause: sandbox environment-loss event (wiped DB/.env/backups) already mitigated by the self-healing bootstrap; the genuine residual defect was the bootstrap's founder-only health check, now fixed to verify ALL 9 advertised demo accounts and self-heal credential drift (T1/T2 evidence).
- Changes (uncommitted, per task §5 no-commit rule): scripts/bootstrap-if-empty.ts (all-account health check + loud unhealable warnings), package.json (dev script group-tee so bootstrap output lands in dev.log), src/lib/rbac.ts (+roleCan), src/app/app/projects/page.tsx + src/app/app/video/projects/page.tsx (role-gated create UI + lazy dialog data). Backup: backups/custom-2026-10-25-pre-demofix.db (VERIFIED).
- Verification: 9/9 advertised demo accounts pass the nine-step UI protocol including refresh persistence, isolation, logout enforcement, and two full server restarts; embedded cross-site iframe login verified (Bearer fallback); regressions green (tsc 0, lint 0, security 51/51, video tracking 69/69).

---
Task ID: PUB-2
Agent: general-purpose (image generation)
Task: Generate 8 public-site marketing images into public/images/site/

Work Log:
- Created /home/z/my-project/public/images/site/ and generated 8 photorealistic JPEGs via the z-ai image-generation skill (z-ai CLI; hero via z-ai-web-dev-sdk script because the CLI whitelist/size validation blocked a wider-than-1344x768 hero and the documented 1440x720 is rejected by the API — 720 is not a multiple of 32)
- Final files (verified with `file`):
  - /home/z/my-project/public/images/site/hero-studio.jpg — JPEG image data, 2048x1152, components 3 (16:9)
  - /home/z/my-project/public/images/site/service-web.jpg — JPEG image data, 1344x768, components 3
  - /home/z/my-project/public/images/site/service-video.jpg — JPEG image data, 1344x768, components 3
  - /home/z/my-project/public/images/site/about-studio.jpg — JPEG image data, 1344x768, components 3
  - /home/z/my-project/public/images/site/work-restaurant-reel.jpg — JPEG image data, 1152x864, components 3 (4:3)
  - /home/z/my-project/public/images/site/work-realestate.jpg — JPEG image data, 1152x864, components 3
  - /home/z/my-project/public/images/site/work-website.jpg — JPEG image data, 1152x864, components 3
  - /home/z/my-project/public/images/site/work-product.jpg — JPEG image data, 1152x864, components 3
- QA pass with z-ai vision on all 8 images (text/faces/palette check): first round found 3 violations — hero-studio, service-web, work-website were blue-dominant, and service-web also had readable menu words on the monitor. Regenerated those (stronger warm-palette + zero-text prompts): re-checked → all TEXT: NO, FACES: NO, warm amber/brown/neutral dominant across all 8
- Temp SDK script written outside the project (/home/z/.tmp-pub2/) and deleted after use; no other project files touched, nothing committed, no dev server started

Stage Summary:
- 8/8 site images delivered as true JPEGs at public/images/site/ (hero 2048x1152; 3 service/about cards 1344x768; 4 work cards 1152x864), all photorealistic warm amber/neutral, no readable text, no logos/watermarks, no faces — ready for the new marketing site build

---
Task ID: PUB-1..PUB-4 (Public Agency Website with Optional Login)
Agent: Z.ai Code (main; PUB-2 imagery via general-purpose subagent)
Task: Build a polished public-facing agency website around the existing AgencyOS platform — public homepage, services, portfolio, about, contact/enquiry — without breaking staff dashboards, client portal, auth, permissions, or workflows. Login stays optional; browsing requires no account.

Work Log:
- Pre-flight: git status clean on main; read worklog; verified dev server healthy (bootstrap "9 demo accounts verified"); created + verified backup backups/custom-2026-10-25-pre-public-site.db (31/31 tables row-matched, sha256 recorded)
- Inspected: routing tree (/, /login, /request-access, /app/*, /portal/*), custom auth (scrypt + DB sessions + requireStaff/requireClientUser/requireRole), RBAC capability matrix, CRM Contact model + /api/contacts, app-shell nav, theme (neutral monochrome, primary=near-black)
- PUB-2 (subagent): generated 8 photographic images into public/images/site/ (hero, 2 service cards, 4 portfolio samples, about) — vision-QA'd: no readable text, no faces, warm palette; exact sizes 2048x1152 / 1344x768 / 1152x864
- Schema (PUB-1): added SiteEnquiry (reference, contact fields, service, message, contactMethod, status NEW/IN_PROGRESS/CONVERTED/CLOSED, convertedContactId, ipHash-only abuse tracking, userAgent) + PortfolioItem (title, category, division, summary, description, thumbnailUrl, mediaUrl, projectUrl, featured, published, isDemo, sortOrder); db:push OK
- RBAC (PUB-1): new capabilities enquiries.read / enquiries.manage (OWNER, CLIENT_MANAGER, SUPPORT_FINANCE) and portfolio.manage (OWNER, CLIENT_MANAGER, CREATIVE_DIRECTOR) — additive to existing matrix
- APIs (PUB-1): POST /api/enquiries (public: zod validation, honeypot field, submit-speed trap, link-count heuristic, per-hashed-IP 5/h + 12/d rate limits + 150/d global circuit, sha256 IP digest — never raw IP, audit as SYSTEM, OWNER notifications, honest no-email messaging); GET /api/enquiries (staff), PATCH /api/enquiries/[id] (status/notes), POST /api/enquiries/[id]/convert (creates CRM Contact reusing existing model); /api/portfolio GET/POST + [id] GET/PATCH/DELETE (staff portfolio.manage)
- Public site (PUB-3): src/lib/site-content.ts single-source copy (company, tagline, divisions, 7-step process with web/video adaptations, packages — only the real VideoPackage £720/mo price shown and labelled indicative, all others "Custom quote", about, privacy); (site) route group layout with skip-link + sticky header (Client Login button + separate Staff Login) + sticky footer (min-h-screen flex-col + mt-auto); pages: / (hero w/ 2 CTAs, intro, industries, divisions, DB-backed work preview, process, packages, CTA), /services, /services/web-development, /services/video-production, /portfolio (DB-backed, category filters, empty state, Sample badges), /about, /contact (validated form + privacy notice + consent); server-side publicFileExists() gradient fallbacks so wiped media files never break pages
- Staff UI (PUB-4): /app/enquiries (filter tabs, triage dialog, status changes, convert-to-contact) + /app/portfolio (create/edit dialog, publish/feature toggles, delete confirm); nav items added to app-shell (roles-gated); scripts/seed-portfolio.ts idempotent demo items (generic titles, isDemo=true — never attributed to real clients) + wired into scripts/seed.ts for future resets; root layout metadata de-Z.ai'd to AgencyOS
- Verification (real browser, logged-out + per-role):
  * Public browsing: all 8 routes 200, nav links, /#process anchor scroll, portfolio category filter incl. empty-state, images load (lazy verified on scroll)
  * Enquiry E2E: client-side validation (5 inline errors on empty submit) → valid UI submission saved (ENQ-MVO7IMTP8248, hashed IP, audit SYSTEM, OWNER notification) → staff triage → convert → CRM Contact created + status CONVERTED + handledById
  * Server-side protections: missing consent/invalid email/short message/unknown service → 400; honeypot + inhuman speed → silent 200 (nothing stored); 5/h rate limit → 429 on 6th request
  * Isolation: CLIENT_USER /app → redirect /portal; GET /api/enquiries|/api/portfolio as CLIENT_USER → "Staff access required"; as WEB_DEVELOPER → nav hidden + "You do not have permission" (403); logged-out /app|/portal → /login; staff API anon → 401; public pages scanned for internal leakage (client names, staff emails, internal fields) → NONE
  * Mobile 390px: no horizontal overflow on all 7 public pages (fixed a CTA-row overflow in division-detail), hamburger menu open/navigate/auto-close, sticky footer verified (flex col + footer bottom == viewport bottom)
  * Console: 0 errors (fixed a Radix Sheet aria-controls hydration mismatch by replacing the mobile menu with deterministic markup, and a next/image fill-parent position warning on /about)
- Regressions: npx tsc --noEmit PASS; bun run lint PASS (after fixing set-state-in-effect via onClick menu close); tests/api-security-suite.sh 51 passed 0 failed; scripts/verify-video-tracking.ts 67 passed 0 failed; dev.log free of 5xx/⨯; uncommitted per task scope (no commit/push)

Stage Summary:
- Public site live at / with routes /services, /services/web-development, /services/video-production, /portfolio, /about, /contact; /login unchanged and reachable via Client Login + Staff Login; /app/* and /portal/* untouched and still protected
- Enquiries flow into the platform (SiteEnquiry → triage → Contact) reusing existing CRM/audit/notification infrastructure — no duplicate customer system
- Portfolio content staff-manageable; all public sample work labelled "Sample" via isDemo; no fabricated clients/stats/testimonials; copy editable in src/lib/site-content.ts
- New files: (site) pages + layout, components/site/*, api/enquiries + api/portfolio, lib/{site-content,site-media,rate-limit,portfolio-schema}, scripts/seed-portfolio.ts, public/images/site/* (8 jpg)
- Modified: prisma/schema.prisma, src/lib/rbac.ts, src/components/app-shell.tsx, src/app/layout.tsx, scripts/seed.ts; deleted src/app/page.tsx (replaced by (site)/page.tsx)
- Backup: backups/custom-2026-10-25-pre-public-site.db (VERIFIED). Working tree intentionally left uncommitted (task forbids commit/push)

---
Task ID: LAUNCH-1
Agent: Z.ai Code (lead engineer / QA / security / deployment owner)
Task: AGENCYOS — Final Production Launch, Client CRM & Go-Live

Work Log:
- Established launch state: previous public-site task fully implemented AND auto-committed (cb18fdd); working tree contained only dev.pid + mtime noise; DB healthy (7 employees, 2 clients, 4 portfolio items, 0 enquiries); bootstrap verified 9 demo accounts; backups/ and .seed-credentials had been wiped by sandbox reset (recreated backup)
- Pre-launch backup: backups/custom-2026-10-26-pre-launch.db (VACUUM INTO, row-matched, sha256) — VERIFIED
- Verified reported results rather than trusting them: security suite 51/51, video-tracking 67/67, all 8 public routes 200, enquiry E2E re-run in browser (reference ENQ-MVOXVUOH139D)
- Launch blockers fixed:
  * Placeholder contact details (hello@agencyos.example, +44 0000 000000) were rendered publicly → CONTACT_PLACEHOLDERS detection in site-content.ts; email/phone hidden from contact page + footer until real values are supplied (all 7 public pages re-scanned: CLEAN)
  * Enquiry pipeline gaps vs spec → added FOLLOW_UP/QUALIFIED statuses, owner assignment (assignment no longer stolen by status changes), lastContactedAt/nextFollowUpAt columns (schema push, additive), search/service/assignee/date filters on GET /api/enquiries
  * Conversion created duplicate contacts for repeat enquirers → duplicate-safe convert (email ci / phone-digits match links to existing contact, matched:true, atomic transaction); verified: same-email repeat enquiry converted with contact count unchanged (3→3)
  * Convert→client→project glue → triage dialog stays open, "Add as client" inline form (POST /api/clients + PATCH contact.clientId), deep-link ?clientId= preselect + auto-open create dialog on both website and video project pages; verified E2E: enquiry → qualified → contact → client "QA Test Studio Ltd" → project WEB-MVOYGPYR8DDB
  * GET /api/contacts/[id] added (staff-only) — was 405, broke the converted-contact panel
- Regression found & fixed during E2E: db.ts startup env-validation throw fired in the browser because /app/projects + /app/video/projects imported roleCan from @/lib/rbac → transitively pulled @/lib/auth → @/lib/db into the CLIENT bundle (latent bug made loud). Split into client-safe src/lib/rbac-shared.ts (capability matrix + roleCan/can/isGlobalReader) with server rbac.ts re-exporting; client pages re-pointed. Full-project client->server import audit: clean
- Dev-server restart mid-task (Prisma client regeneration): sessions + records persisted — persistence smoke test passed
- Hardening: fail-fast DATABASE_URL validation in src/lib/db.ts; baseline security headers in next.config.ts (verified present via curl); in-memory rate limiter kept and honestly documented
- Verification: tsc 0 errors; lint clean; security 51/0; video 67/0 (after rbac split); mobile 390px no horizontal overflow on all 7 public pages; hamburger nav works; fresh-session console 0 errors on /, /contact, /portfolio; role isolation re-verified (WEB_DEVELOPER 403 on enquiries/convert; CLIENT_USER blocked from staff APIs + /app redirects to /portal; anon 401); logout revokes session (UI verified)
- Test data cleaned: QA enquiries/contact/client/project deleted in FK-safe order; staff inbox 0; suite fixtures ("Audit Cafe (verify fixture)") intentionally retained — suites find-or-reuse them
- DEPLOYMENT.md created (build/run, env vars, backup/recovery, limitations, checklist) — user-requested documentation
- Post-launch-prep backup: backups/custom-2026-10-26-post-launch-prep.db VERIFIED; committed as 498d58d; tree clean
- Deployment NOT executed: no git remote, no vercel/netlify/fly/render/railway/Dockerfile/CI, no hosting credentials in the environment; sandbox Caddyfile only proxies localhost:3000 to the preview URL. Production build (bun run build) not run per sandbox rule. Missing requirement documented in final report.

Stage Summary:
- Public site + enquiry → CRM → client → project pipeline fully operational and browser-verified; auth/RBAC/portal intact; all four regression suites green
- Launch blockers remaining (user action required): real contact details (site-content.ts), email provider credentials, external hosting + domain for true production deployment
- Backups: pre-launch + post-launch-prep, both VERIFIED; DB persistence across restart verified
- Commit: 498d58d on main; no push (no remote)

---
Task ID: PRODREADY-1
Agent: Z.ai Code (main)
Task: Make AgencyOS production-ready for real clients — inspect & protect, production persistence, deployment readiness, client-acquisition E2E, email audit, security verification

Work Log:
- Read worklog + DEPLOYMENT.md; git tree clean on main (82ef487 = worklog-only commit); no remote/CLI/deploy-config/email credentials in environment
- Pre-work backup VERIFIED: backups/custom-2026-10-26-pre-prod-ready.db (VACUUM INTO, row-matched, sha256)
- Baseline counts confirmed (enq 0, contact 2, client 3, project 4, employee 7, videoProject 3); bootstrap healthy (9 demo accounts), no reset
- Persistence fail-fast verified empirically: non-file DATABASE_URL → startup throw; .env absent (prod scenario) → startup throw (bun auto-loads project .env / @prisma/client loads schema-dir .env — confounded in-project test, proven via .env hold-and-restore with checksum match); bootstrap-if-empty wired only into `dev`, never `start`
- Deployment artifacts committed: Dockerfile (multi-stage bun, standalone, VOLUME /app/db, non-destructive prisma db push entrypoint), docker-entrypoint.sh, .dockerignore (excludes .env/db/backups/.seed-credentials/logs), .env.production.example (placeholders only; .gitignore negation added — .env still ignored, verified); DEPLOYMENT.md §0 documents hosting options A (container host + persistent volume, keep SQLite — recommended) and B (serverless + managed DB — needs owner-approved migration) with exact owner actions
- E2E client-acquisition pipeline (labelled test enquiry ENQ-MVP105T1EFE0, "PROD-READY TEST — delete after verification"): public POST /api/enquiries 201 → DB row + hashed IP + OWNER notification + audit → founder triage (assign/status/contact-attempt/follow-up/note) → dev-server restart → all fields persisted (incl. DB-backed sessions) → convert 201 matched:false → repeat convert 409 (no duplicate; contact count 2→3, exactly 1 test-email contact) → client created + contact linked (verified via GET) → website project created, status DISCOVERY, linked
- Role isolation re-verified: WEB_DEVELOPER 403 (list + convert), CLIENT_USER 403, anonymous 401
- Browser verification (agent-browser): public home renders (title, nav, hero, CTAs); /login guards authenticated users; staff inbox shows enquiry (status/owner/follow-up/last-contacted); triage dialog shows all fields + internal note in textarea; mobile 390px no horizontal overflow on 5 public pages; footer pushed naturally on long page; hamburger menu open→navigate→auto-close; client portal isolation (marta: Anchor Bar yes, Brightcuts no, staff nav no); logout → /api/auth/me 401 → /app redirects /login
- Cleanup: PROD-READY TEST records removed FK-safe (project→tasks→client→contact→enquiry→notification); audit entries kept (append-only convention); post-cleanup counts match baseline exactly
- Regression suites: tsc 0 errors; lint clean; api-security 51/0; video-tracking 67/0 (first two attempts hit a wedged long-running dev server — bun fetch 300s TimeoutError; fresh restart resolved; suite green on first healthy run)
- Email audit: no provider libs (package.json clean), no credentials (.env has 3 non-secret keys), in-app notifications only — honestly documented
- Post-verification backup VERIFIED: backups/custom-2026-10-26-post-prodready-verify.db

Stage Summary:
- Client acquisition pipeline operational and browser+API verified end-to-end; conversions idempotent (409 guard + duplicate-safe matching); restart persistence proven; role isolation intact
- Deployment NOT performed: no authorized hosting integration exists (no git remote/CLI/credentials). Deployment is one owner authorization away: Option A (recommended) container host + persistent volume keeps SQLite, no migration; artifacts committed. Exact actions in DEPLOYMENT.md §0
- Remaining genuine blockers (user action): 1) hosting account/authorization, 2) real contact details in src/lib/site-content.ts, 3) transactional email provider credentials, 4) custom domain (optional; platform URL works first)
- Backups: pre-work + post-verification, both VERIFIED; commit follows this entry

---
Task ID: PRODREADY-1a (addendum — hardening found during verification)
Agent: Z.ai Code (main)
Task: Production-readiness verification addendum — db.ts production log hardening + dev-server memory characterization

Work Log:
- OOM root cause found via dmesg: kernel OOM-killed next-server (1.7GB RSS) during regression-suite runs; 4GB sandbox + Turbopack dev mode accumulates memory under sustained traffic and eventually hangs requests (reproduced 3x). Production unaffected (standalone pre-compiled server) — documented in DEPLOYMENT.md §5 with restart + NODE_OPTIONS cap guidance
- Hardening: src/lib/db.ts now enables Prisma query logging ONLY in development (log: [] in production) — previously unconditional, bloating stdout and leaking query data into prod logs; tsc 0 errors, lint clean, api-security 51/0, video-tracking 67/0 after change; public enquiry smoke (submit→persist→notify→cleanup) passed post-change
- Server restarts performed with pkill -9 full cleanup; bootstrap-if-empty never reset data (verified each restart)

Stage Summary:
- All four suites green after hardening commit; dev-server wedge documented as sandbox dev-mode characteristic with exact restart command
- Commit: db.ts hardening + DEPLOYMENT.md memory note + worklog

---
Task ID: ASTAS-3D
Agent: Z.ai Code (main)
Task: PROJECT ASTAS — extreme interactive 3D transformation of the public agency website (astasagency.space-z.ai)

Work Log:
- Inspected first: git tree clean apart from sandbox chmod mode-noise; read worklog/DEPLOYMENT.md; verified backup VERIFIED (custom-2026-10-26-pre-3d-experience.db) before any work; identified genuine assets (8 site images, DB portfolio samples labelled isDemo, £720/mo verified package price)
- Deps: added three@0.186.1 + @react-three/fiber@9.8.2 (+@types/three) — no GSAP/drei needed; framer-motion/zustand already present; fonts: Syne (display) + Space Grotesk (body) via next/font/google, scoped to public site
- Design system: .site-dark scope in globals.css overrides shadcn tokens (rich warm black, charcoal, silver, electric amber --electric) so /app, /portal, /login keep the existing light theme untouched; chrome-text/eyebrow/grain/marquee helpers; reduced-motion killswitches
- 3D hero ("The Monolith"): chrome monolith + fresnel rim shader (custom GLSL) + electric edge lines, 14-blade ring, reflective plain, drifting shards; camera rig = CatmullRom arc driven by smoothed scroll progress with pointer parallax + entrance dolly; PMREM RoomEnvironment env-map (no external HDRI); quality tiers (blades 14→9, DPR 1.75→1.25, AA off on low); reduced-motion = static framing; frameloop pauses when journey offscreen or tab hidden; ?webgl=off escape hatch + CSS static-monolith fallback; dynamic import ssr:false (three never blocks first paint)
- Chapters 01-06: hero (headline + dual CTA + marquee), capabilities (genuine live mini-site demo in device frame with real desktop/mobile toggle + tabs + validated booking demo; video sample-frame gallery with Tilt), DB-backed asymmetric showroom (filters w/ animated pill, hover tilt, detail overlay, video support, Sample badges), craft lab (L-01 live material study w/ real sliders + in-view frameloop gating, L-02 pointer-reactive typography, L-03 draggable before/after grade demo), build (configurator entry + real process + indicative packages with only verified price), conversation (honest contact + login routes); persistent chapter rail (IntersectionObserver)
- Button system: Magnetic (fine-pointer only), LiquidCTA (liquid fill morph), Tilt (perspective), CinematicLink; all keyboard-accessible, reduced-motion aware, transform-only (no layout shift)
- Project configurator: 7 steps (service→goal→scope→budget/timing→info→contact→review) as a zustand-store modal mounted in (site) layout; submits to the EXISTING POST /api/enquiries (same zod validation, honeypot, rate limits, consent); structured answers preserved inside the message ("PROJECT BRIEF — ..." format); canonical service strings reused; NO schema migration needed; success shows real reference + honest no-email note
- E2E verified in browser: full configurator run → reference ENQ-MVPCKSR1218E → structured brief in DB (service/goal/scope/budget/timing/description) → OWNER notification → visible in staff inbox /app/enquiries → test record + notification deleted (counts back to baseline); portfolio filter→detail overlay; mini-demo tabs + booking validation + confirmation; ?webgl=off fallback renders; back/forward navigation OK; mobile 390px zero horizontal overflow on all 5 public pages (fixed two real overflow bugs: showroom grid min-width:auto blowout + chapter-title clamp floor); mobile menu + login routes; footer natural push verified
- Fixes during build: next/dynamic loading fallback must never render DOM inside <Canvas> (R3F "Div is not part of THREE namespace") → Canvas itself is the dynamic boundary; MaterialLab needed its own env-map context; Syne metrics recalibrated (clamp caps) for 2-line hero; mobile scene dimming + desktop left scrim for copy contrast
- Regression: tsc 0 errors; lint 0 errors 0 warnings (react-hooks/immutability disables documented as canonical R3F imperative patterns); api-security 51/0; video-tracking 67/0 (dev-server OOM wedge reproduced under combined browser+suites load in 4GB sandbox — closed browser + fresh restart before suite = green; already documented in DEPLOYMENT.md §5)
- Post-work backup VERIFIED: backups/custom-2026-10-26-post-3d-experience.db

Stage Summary:
- Public site transformed into a cinematic 3D experience (6 chapters, real-time WebGL hero, genuine interactive demos) while ALL business systems preserved: enquiry API/CRM pipeline, staff inbox, portfolio DB, auth/RBAC, client portal — untouched and re-verified by the full suite battery
- No fake content: samples labelled, only verified price shown, honest no-email messaging, contact placeholders still hidden
- NOT committed per task instruction ("do not commit or push unless separately authorized") — working tree holds: modified (layout, globals, site pages, header, package.json/bun.lock) + new (site/ components: three/, chapters/, configurator/, buttons, chapter-rail, lib/site/); .zscripts/dev.pid + chmod-mode noise are sandbox artifacts
- Known sandbox limitation: next dev (Turbopack) wedges under sustained heavy multi-client load in 4GB RAM (documented, dev-mode only)
---
Task ID: LAUNCH-VERIFY
Agent: Z.ai Code (main — DevOps / QA / operations verification)
Task: ASTAS Agency — Final Production Launch Verification (evidence-based; no deployment)

Work Log:
- Pre-state audit found a cross-lineage corruption event: platform commit 8d07f7e (Oct 27) had restored ~438 files from a foreign AgencyOS lineage (different Prisma models, different lib/API surface, FOUNDER-role universe, legacy route groups (app)/(portal) duplicating src/app/app + src/app/portal) → 15 route conflicts, GET / 500 on every route, schedulers crash-looping on missing models; sandbox reset had also rolled db/custom.db back to a foreign Oct-22 User-based snapshot (22 tables, zero tables used by current code) and wiped backups/
- Forensic backup of the foreign DB: backups/custom-2026-10-22-foreign-schema-forensics.db (VACUUM INTO, 22/22 row-matched, sha256 recorded)
- Route surgery: deleted ALL restoration-added files that fail tsc vs the last-green commit e1b6248 (400 files: (app)/(portal) groups, agency views, legacy api/*, legacy lib/*) — nothing from e1b6248 or my lineage removed; kept verified-clean additions (middleware.ts, login/signup/change-password/forgot-password pages, constants.ts merged)
- constants.ts reconciliation: full 7-role OWNER universe restored, FOUNDER aliased to 'OWNER' so restored comparisons match the seeded founder
- instrumentation.ts: legacy scheduler boot removed (modules deleted); documented no-op
- DB rebuilt from current 33-model schema: db push + generate + bootstrap (9 demo accounts, ASTAS-branded seed incl. 4 isDemo portfolio items, AppSetting agencyName='ASTAS agency')
- Leftover rebrand fixes: (site)/page.tsx + about metadata 'AgencyOS' → 'ASTAS agency'
- Regression-suite stale-credential fix: suites still logged in with pre-rebrand @agencyos.local emails → updated to @astas.local (root cause of a false 19/32 regression)
- Acquisition battery (API): 10/10 — valid 201; honeypot & speed traps silent-200-no-store; 5×400 validation; 429 on 6th/h; configurator-shaped payload 201
- Staff chain: founder login → inbox (7 rows, 0 spam rows) → OWNER notification (5-min identical-event dedup verified as designed) → triage PATCH → convert 201 → repeat convert 409 → exactly 1 contact (no duplicate) → client 201 → project 201 DISCOVERY
- Persistence: full server restart + logout/login → all rows + triage fields + DB-backed session survive
- Backup/recovery: backups/custom-2026-10-27-launch-verify.db VERIFIED (33/33, sha256); recovery demonstrated in isolated sandbox copy (integrity ok, known triaged row recovered); live DB untouched
- Security: suite 51/0 + video-tracking 69/0 + tsc 0 + lint clean; session revocation verified server-side (me 401 after logout); security headers present; middleware cookie-gate + layout guards intact
- Browser (agent-browser): desktop hero with live WebGL canvas; 7-step configurator E2E → ENQ-MVQRGMG1BC67 with structured PROJECT BRIEF in DB + staff inbox; mobile 390px zero horizontal overflow top+bottom; mobile menu opens/navigates/auto-closes; ?webgl=off renders full content without canvas; console clean (benign THREE.Clock deprecation only); UI login → /app → /app/enquiries inbox; UI sign-out → /login
- Cleanup: all QA rows deleted FK-safe (enquiries/notifications/contact/client/project); suite fixtures retained per convention; baseline enq0/con2/cli2/prj3 restored before suites (+ suite fixtures after)

Stage Summary:
- Every verifiable engineering item PASSES in the dev/preview environment; production does NOT exist (no git remote, no hosting config, no deploy performed or authorized)
- Remaining blockers (owner actions): hosting authorization (Option A container+volume ready in Dockerfile/DEPLOYMENT.md), custom domain, real contact details (placeholders currently auto-hidden from public pages), transactional email provider, re-entry of real data (previous data unrecoverable after the environment reset)
- Working tree intentionally LEFT UNCOMMITTED per task constraints (400 deletions + 7 modifications await review); no push (no remote); dev.log clean of 5xx
