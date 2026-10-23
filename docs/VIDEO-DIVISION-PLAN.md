# AgencyOS — Video Production Division Implementation Plan

**Status:** Approved build (Founder Master Build Prompt, 2026-10-23)
**Scope:** Full Video Production Agency division integrated with the website agency platform, in the active repository `/home/z/my-project`.
**Pre-change backup:** `backups/custom-2026-10-23-pre-video-division.db` (VACUUM INTO verified, sha256 `3877120d35e2b83a330b9ecfaa544d35b1cc036a40ceef364182a96e277591bc`, empty scaffold DB → zero data at risk).

## 0. Findings from inspection (Milestone 0)

- The active repo is a bare Next.js 16 + shadcn/ui scaffold (demo `page.tsx`, one hello-world API route, Prisma schema with demo `User`/`Post`, empty SQLite DB).
- The legacy copy at `/tmp/my-project` contains an earlier AgencyOS draft. Per Master Prompt §1.2 it is used **as reference only**; nothing is copied wholesale and no parallel systems are imported.
- Therefore the "shared foundation" (auth, RBAC, clients, team, projects, tasks, notifications, finance, audit, client portal) is built fresh in this repo following the Master Prompt's architecture rules, then the Video division is layered on top.
- All needed libraries are already installed (shadcn/ui, date-fns, zod, react-hook-form, TanStack Query, recharts, lucide). **No new dependencies.**

## 1. Architecture

| Layer | Decision |
|---|---|
| Framework | Next.js 16 App Router, TypeScript, API route handlers (no server actions) |
| DB | SQLite via Prisma (`db/custom.db`), no large binaries in DB |
| Auth | Custom scrypt hashing + DB-backed sessions + HttpOnly cookie; server-side validation in every handler |
| RBAC | Roles: OWNER, CLIENT_MANAGER, WEB_DEVELOPER, SUPPORT_FINANCE, VIDEOGRAPHER, VIDEO_EDITOR, CREATIVE_DIRECTOR, CLIENT. Enforced in API handlers (never UI-only) |
| UI | shadcn/ui (New York), responsive desktop+mobile, sticky footer, loading/empty/error states |
| Storage | Provider-neutral media registry (metadata + external references). Binary upload storage is an honest "not configured" state — no fake uploads |
| Isolation | Clients see only their own records (404/403). Assigned-only scoping for VIDEOGRAPHER / VIDEO_EDITOR / WEB_DEVELOPER. OWNER unrestricted |

## 2. Data model (new/changed)

Core: `Employee`, `Client`, `ClientUser`, `Session`, `PasswordResetToken`, `SignupRequest`, `AppSetting`.
Shared delivery: `Project` (unified, `serviceType` WEBSITE|VIDEO_PRODUCTION), `Task`, `TaskComment`, `Meeting`, `Contact`, `Ticket`, `TicketReply`, `Notification`, `AuditLog`, `Invoice`, `ProductionExpense`.
Video: `VideoPackage`, `VideoProject` (1:1 video-specific extension of Project), `VideoDeliverable` (state machine), `CreativeBriefVersion`, `VideoVersion`, `VersionComment`, `ShootSession`, `ShootAssignment`, `ShootDeliverable`, `EquipmentItem`, `EquipmentReservation`, `ProjectScopeChange`, `MediaAsset`.

Delete rule: no hard deletes for commercial records (archive/cancel states). Cascade only for join tables.

## 3. Deliverable state machine (server-enforced)

```
PLANNED → SCHEDULED → SHOT → FOOTAGE_READY → EDITING → INTERNAL_REVIEW
        → CLIENT_REVIEW → APPROVED → DELIVERED
INTERNAL_REVIEW → EDITING (internal rejection)
CLIENT_REVIEW → REVISION_REQUIRED → EDITING
Terminal: DELIVERED, CANCELLED (with reason; replacement creates a linked new record)
```

Role gates: videographer marks SHOT/FOOTAGE_READY (backup verification required for footage); editor submits/works EDITING; creative director approves/rejects internal review; client approves/requests revision via portal; manager/owner schedule, deliver, cancel. A deliverable is never auto-advanced by time passing.

## 4. Counting rules (dashboard & reports)

- Contracted = non-cancelled deliverables (incl. approved scope additions).
- Stage distribution = count by status; overdue = deadline past & not DELIVERED/CANCELLED; remaining = contracted − delivered − cancelled.
- Completion % = delivered ÷ contracted, zero-state "—" (never divide by zero; stages never summed into a unique-video total).

## 5. Shoot scheduling & conflicts

Shoots are separate entities (one shoot → many deliverables). Conflicts flagged: videographer double-booking, overlapping equipment reservations, end≤start ranges. Reschedule/cancel require reason; notifications fire through the existing notification system with 5-minute identical-event dedup. Call sheet = print page excluding internal notes/costs.

## 6. Versioning & approvals

`VideoVersion` (unique per deliverable+number) drives review state; approval binds to a specific version; a replacement version resets review to INTERNAL_REVIEW; prior versions/feedback never overwritten.

## 7. Finance formulas

Budget = agreed project price (+ approved scope-change price impact). Actual = Σ production expenses. Gross contribution = budget − actual. Margin % = contribution ÷ budget (zero-state "—"). Cost per delivered video = actual ÷ delivered count (zero-state "—"). Invoices change state only via explicit authorized actions.

## 8. Route map (authorization matrix)

All routes server-side authz. Full matrix documented in `docs/API-AUTHORIZATION.md` at delivery. Highlights:
- `/api/auth/*` — public login/logout, self-service password, me
- `/api/signup-requests` — public POST; OWNER-only approve/reject
- `/api/team/*` — OWNER manages; others read self
- `/api/clients`, `/api/projects`, `/api/video/*`, `/api/tasks`, `/api/meetings`, `/api/contacts` — role-gated; CLIENT role rejected (portal uses `/api/portal/*`)
- `/api/portal/*` — CLIENT only, hard client_id scoping from session
- `/api/invoices`, `/api/expenses`, `/api/finance/summary` — OWNER/SUPPORT_FINANCE (manager read-only)
- `/api/audit`, `/api/settings` — OWNER
- `/api/search` — scoped by role & client

## 9. UI map

Public: `/` corporate landing (signup-request CTA + login CTA), `/login`, `/request-access`.
Staff `/app/*`: overview, clients, contacts, team, calendar (meetings+shoots), tasks, projects (website), video: dashboard, projects (+detail tabs), packages, deliverables (+detail w/ versions & reviews), shoots (+detail, call-sheet print), editing queue, equipment, media; finance, reports, notifications, settings, audit.
Client `/portal/*`: overview, projects, deliverables (review/approve), deliveries, invoices, support.

## 10. Milestones

- M1 Foundation: schema + auth + RBAC + shell + clients/team/projects CRUD
- M2 Deliverables: state machine, counts, assignments, briefs
- M3 Shoots: sessions, calendar, crew, equipment, call sheets, conflicts
- M4 Review: editing queue, versions, internal QC, client feedback
- M5 Portal + media: client-facing review/approval/delivery, media registry
- M6 Finance & reporting: expenses, profitability, dashboards, service filter
- M7 Hardening: automated checks, regression, browser verification (desktop+mobile), reports

## 11. Verification protocol (per milestone)

Real executed checks only: `tsc`, `bun run lint`, API-level scenario scripts (success / invalid input / unauthenticated / forbidden role / cross-client), browser runs on desktop+mobile, Phase-6-portal-equivalent regression (login, portal, isolation), diff hygiene (no secrets, no tracked DB).
