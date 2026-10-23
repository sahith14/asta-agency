# AgencyOS — Video Production Division Delivery Report

**Date:** 2026-10-23 · **Repo:** `/home/z/my-project` (branch `main`, uncommitted per instructions)

## 1. Features actually implemented (all working end-to-end)
- **Corporate public site**: landing (services, industries, sign-up CTA), login, request-access form (public, rate-limited)
- **Auth & RBAC**: scrypt password hashing, DB-backed sessions (HttpOnly cookie), session revocation on password change/reset, forced password change for temp accounts, 7 staff roles + CLIENT, capability matrix enforced **server-side in every handler**
- **Shared platform**: clients CRM (+portal users with founder-mediated resets), team management, unified projects (WEBSITE | VIDEO_PRODUCTION), tasks + comments, meetings + calendar, contacts, support tickets (client-raised, staff replies), in-app notifications with 5-min dedup + mark-all-read, audit log, founder settings, signup-request approval → account provisioning (portal or staff) with one-time password
- **Video Production division**:
  - Packages (incl. deliverable templates); **contract snapshots** — later package edits never rewrite agreed scope
  - Video projects w/ business categories (all 12 required), campaign objective/audience/platforms/locations, agreed quantity + revision allowance
  - **Individual deliverables** with unique refs, full state machine, revision counters, deadlines, blockers, replacement linkage, cancel-with-reason
  - Creative briefs with version history (draft → internal-approved → client-approved)
  - Shoots: month/list calendar, crew + equipment reservations, **conflict detection** (crew double-booking, overlapping kit, invalid ranges), reschedule/cancel with reason + notifications, **manual completion only** (never time-based), print-optimized call sheet excluding internal notes/costs
  - Editing queue (priority, deadline, waiting-time, revision status)
  - Versioned edits: register version → internal QC gate (self-approval blocked) → client review → approve/revise; approval binds to a specific version; replacement versions require new review; feedback preserved
  - Scope changes: propose → approve creates additional deliverables + adjusts budget **transactionally** (duplicate-safe)
  - Media registry (metadata + external references) with honest "storage not configured" state — no fake uploads
  - Finance: invoices (draft→sent→paid/void, illegal transitions rejected), production expenses (7 categories), budget vs actual, contribution, margin %, cost visibility
  - Reports & dashboards: video dashboard (stage distribution, completion %, zero-deliverable state), combined reports with All/Website/Video filter, overdue surfacing
- **Client portal**: overview, my projects, video reviews (approve/request revision with timecoded comments), deliveries, invoices, support

## 2. Database models & migration
30+ models added via `prisma db push` (SQLite). **No destructive migration** — pre-change DB was empty (verified); backup taken first. Commercial records are archived/cancelled, never hard-deleted (except join tables).

## 3. Lifecycle & counting rules
State machine in `src/lib/video-state-machine.ts` (server-enforced; invalid jumps → 422; role+assignment gates; footage-backup verification required before FOOTAGE_READY; delivery metadata required for DELIVERED). Contracted = non-cancelled deliverables; remaining = contracted − delivered; completion = delivered ÷ contracted ("—" when zero); overdue = past deadline & not delivered/cancelled. Stages never summed into a unique-video total.

## 4. Tests executed (real results)
| Suite | Result |
|---|---|
| `tests/api-security-suite.sh` — 50 checks: unauth rejection, role gates, cross-client isolation, state machine rules, finance rules, signup flow, conflict detection, notifications, search scoping | **50/50 PASS** (2 real findings found & fixed during testing) |
| `npx tsc --noEmit` | 0 errors |
| `bun run lint` (eslint) | 0 errors |
| Browser desktop 1440×900 | landing ✓ login ✓ staff overview ✓ video dashboard ✓ deliverables tracker+detail ✓ shoot calendar+detail+call sheet ✓ reports ✓ settings access-approval ✓ |
| Browser mobile 390×844 | portal overview ✓ video reviews ✓ founder app ✓ hamburger nav ✓ footer position ✓ |
| Client round-trip | Marta (CLIENT) approved pending version in portal → deliverable moved CLIENT_REVIEW→APPROVED → founder notified ✓ |
| Signup round-trip | Public request → founder approval → portal account provisioned (mustChangePassword=true, new client created) ✓ |

## 5. Existing functionality regression
The pre-build app was a scaffold (demo page, User/Post, empty DB) — nothing to regress; scaffold demo page replaced by the product per the build order. Login, portal and isolation all verified above.

## 6. Files changed / added
- `prisma/schema.prisma` (full data model) · `scripts/seed.ts`
- `src/lib/`: auth.ts, rbac.ts, client.ts, video-state-machine.ts, shoot-conflicts.ts
- `src/app/api/`: ~40 route handlers (auth, team, clients, projects, video/*, portal/*, tasks, meetings, contacts, invoices, expenses, finance, reports, audit, settings, signup-requests, media, notifications, search, overview)
- `src/app/`: landing, login, request-access; `src/app/app/*`: 20 staff pages; `src/app/portal/*`: 7 client pages
- `src/components/`: app-shell, portal-shell, status-badge
- `docs/`: VIDEO-DIVISION-PLAN.md, API-AUTHORIZATION.md, this report · `tests/api-security-suite.sh` · `worklog.md`

## 7. Git status
Only `.gitignore` modified among tracked files (added /backups, /db, .seed-credentials, /tool-results, /upload). All new code untracked. **No commits, no pushes.**
- Not tracked (verified via `git check-ignore`): `db/custom.db`, `backups/*.db`, `.env`, `.seed-credentials`

## 8. Backup & rollback
- Backup: `backups/custom-2026-10-23-pre-video-division.db` (VACUUM INTO; sha256 `3877120d35e2b83a330b9ecfaa544d35b1cc036a40ceef364182a96e277591bc`)
- Rollback: stop dev server → `cp backups/custom-2026-10-23-pre-video-division.db db/custom.db` → revert source files (uncommitted: `git checkout -- . && git clean -fd src/ prisma/ scripts/ docs/ tests/` would remove the new build)

## 9. Credentials
All seed accounts use **random** passwords (never default), written only to gitignored `.seed-credentials`. Founder can reset any password in-app (Team / Client portal users). `mustChangePassword` forces rotation for provisioned accounts.

## 10. Explicit confirmations
- ❌ No deployment (no Render/hosting/DNS/domain actions)
- ❌ No production infrastructure changes; no APK
- ❌ No payment gateway / real charges; no external services
- ❌ No git commit or push
- ✅ No secrets in logs, source, screenshots or this report (passwords shown once in founder UI by design)

## 11. Known limitations (honest)
1. **Binary media storage not configured** — assets registered as metadata + external references only; upload endpoints deliberately absent (no fake success states). Provider-neutral schema ready for an approved object-storage integration.
2. **No email/push delivery** — notifications are in-app only; password recovery is founder-mediated (tokens recorded, never exposed); documented in-product.
3. **Single currency** (GBP formatting), single timezone display (browser-local) — no multi-currency requirement specified.
4. **Call sheet** is a print-optimized page (no PDF generation service).
5. Video previews/deliveries are external references (e.g. hosted links) — inherent to limitation 1.
