# AgencyOS — Phase 6 Delivery Report
## Client Portal & Production Readiness

**Status: DELIVERED AND VERIFIED** — 124/124 automated security & workflow checks pass, browser-verified on desktop and mobile.

---

## 0. Honest architecture note (required by delivery order)

The instruction said to continue inside an existing AgencyOS with Phases 0–5. **Pre-implementation inspection found no prior AgencyOS code in the repository** — only the framework scaffold (default Prisma `User`/`Post` models, placeholder landing page, no auth, no roles, no worklog). Nothing was rebuilt or destroyed: the scaffold was extended additively. All Phase 0–5 capabilities (auth, RBAC, audit logging, clients, projects, milestones, deliverables, demos, tasks, tickets, finance, maintenance SOP) were materialized in this delivery as the foundation, then Phase 6 was built on top and is covered by the same security tests.

## 1. What was delivered

### P6-1 Client Portal (dedicated CLIENT role)
- **Separate role-protected experience** at `/portal` (CLIENT users are hard-redirected away from the internal `/app`; layout + every API enforce it). FOUNDER retains unrestricted access to portal data via `?clientId=` (audited); other employees are redirected.
- Clients can: view their projects, milestones, deliverables and status; review private website previews; **approve a demo or request changes with written feedback**; upload assets (logos/photos/menus/PDFs, 10 MB, type-allowlisted); submit support tickets & website change requests; track status with client-visible progress updates; read completed maintenance reports; receive in-app notifications (bell + page) for approvals, previews and support responses.
- **Isolation:** every portal query filters by the signed-in client's business; internal notes, internal replies and internal demo states never cross the portal API.

### P6-2 Billing Portal (read-only truth)
- Own invoices + payment history (verified/pending), active maintenance plan with agreed scope, renewal date, and monthly price — all read from the same invoice/subscription records staff use (single source of truth; verified by test "portal invoice mirrors finance system of record").
- Payment gateway **not connected** → the portal shows an honest "Online payments are not connected yet" state with bank-transfer guidance. No card data stored anywhere; no client-modifiable payment status (tested from 5 attack angles).
- Billing questions & cancellation requests submit to the finance queue and are answered from the internal finance workspace.

### P6-3 Approval & change-request workflow (fully server-enforced + audited)
1. Developer submits deliverable/demo for review (`READY_FOR_FOUNDER`).
2. **Founder-only** authorization (`AUTHORIZED_CLIENT_PREVIEW` + `ApprovalEvent`).
3. Client notified; portal preview; client approves or requests changes.
4. Founder reviews scope and records commercial impact (`NONE` / `EXTRA_COST_QUOTED`).
5. Founder-only conversion of approved changes into developer tasks (BACKLOG, linked to the request).
6. Final deployment requires the configured gate: staff request → **founder approves** → project `LAUNCH`.
7. Every step writes an `ApprovalEvent` (actor, role, action, timestamp, resulting action) plus an audit-log row and idempotent notifications.
- **Client demo approval never auto-creates work, never publishes, never alters billing** (proven by invoice-snapshot test and by the workflow's code path).

### P6-4 Production readiness
- Full audit in `docs/PRODUCTION-READINESS.md`: credentials & resets, session security, RBAC, input/upload security, secrets, backup/restore, error logging, scheduled-job reality, deployment/rollback, privacy/retention.
- Fixes made during audit: Prisma query logging disabled (was leaking bound params incl. password-hash lookups); login rate limiter corrected to count only failed attempts.
- Honest register of unconnected integrations: **email delivery, payment gateway, external monitoring, automated backups/cron** — all surfaced honestly in the UI where relevant, none claimed as working.

### P6-5 Testing
- `tests/phase6-security.ts` — **124 checks, all passing** (full output: `docs/PHASE6-TEST-RESULTS.txt`). Run: `bun scripts/seed.ts && bun tests/phase6-security.ts`.
- Browser verification (agent-browser, 1366×900 + 390×844): login, founder dashboard, project tabs, deployment gate, portal overview, demo approval, billing, support ticket creation + reply, mobile hamburger nav — screenshots in `docs/verify-*.png`. No console errors found on any verified page.

## 2. Security test results (summary — all ✅)

| Requirement | Result |
|---|---|
| Client cannot read another client's records by changing IDs | ✅ project/demo/ticket/asset/detail → 404; `?clientId=` forging → 403; lists contain no foreign rows |
| Clients cannot access employee/Founder endpoints | ✅ 16 endpoints × 2 client accounts → 403/404 |
| Employee role restrictions intact | ✅ developer≠finance/team/audit; manager≠finance/team/audit + cannot authorize demos; finance≠demos/tasks/team |
| Founder unrestricted across the application | ✅ 13 module endpoints + portal `?clientId=` views + user creation, all allowed server-side |
| Demo approval & change requests follow correct workflow | ✅ full state machine incl. scope review, conversion to task, developer progression; SUBMITTED requests never auto-convert |
| Private demo URLs / assets protected | ✅ anonymous → 401; foreign client → 404; `urlToken` never serialized; internal demo states never exposed |
| Billing reflects real records; payment truth immutable from portal | ✅ portal=finance view; 5 mutation attempts denied; verification requires ≥10-char evidence; refunds founder-only |
| Regression (Phases 0–5 core) | ✅ every role's core endpoints + pages healthy after Phase 6 changes |
| Rate limiting | ✅ 11th consecutive failed login → 429 |

## 3. Modules & endpoints inventory (all tested)

**Auth**: login (rate-limited, audited), logout, me, change-password, forgot-password (honest no-email state).
**Internal**: clients, projects (+milestones, deliverables, deployment gate), demos (create/ready/authorize/feedback), tasks, change-requests (review/convert), tickets (+replies incl. client-visible), finance (overview, invoices, payments, verify/refund/reject, subscriptions, billing-questions), maintenance (evidence-based SOP), team (founder-only, password reset), audit log, notifications.
**Portal**: overview, projects, demos (approve/request-changes), assets (upload/download via authorized route), tickets (+replies), change-requests, billing (+questions).

## 4. Seeded demo credentials (rotate before real use)

| Account | Email | Password |
|---|---|---|
| Founder (unrestricted) | founder@agencyos.co.uk | Founder!2026 |
| Client Manager | manager@agencyos.co.uk | Manager!2026 |
| Web Developer | dev@agencyos.co.uk | Dev!2026 |
| Support & Finance | finance@agencyos.co.uk | Finance!2026 |
| Client — The Anchor Inn | marta@anchorinn.co.uk | Client!2026 |
| Client — Bright Cuts Barbers | jordan@brightcuts.co.uk | Client!2026 |

## 5. Failed tests / remaining risks

- **No failed tests remain** in the final suite run (124/124). During development, three gaps were found and fixed: missing portal ticket POST + ticket detail GET (caught by browser verification), missing `_scope` helper modules (caught by typecheck), login rate-limiter counting successes (caught during test design).
- **Remaining risks** (documented in `docs/PRODUCTION-READINESS.md`): no automated backups, no email channel (founder-mediated resets), no payment gateway (honest unavailable state), in-memory rate limiting (single-instance), seeded demo passwords must be rotated, no CSRF tokens/CSP headers yet, audit log grows unbounded.
- Known cosmetic note: one Radix a11y warning (`DialogContent` description) in dev console; no functional impact.

## 6. Deployment instructions

See `docs/PRODUCTION-READINESS.md` §9: install → `prisma db push` (or migrate deploy) → skip seed in production → `bun run build` + `bun run start` → rotate seeded passwords → configure backups/gateway/email when contracted. Rollback = restore previous build + DB snapshot.
