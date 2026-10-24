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
