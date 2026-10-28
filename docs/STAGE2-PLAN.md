# AgencyOS — Stage 2 Implementation Plan (Founder-approved scope)

**Stage:** 2 of the reconciliation plan (§11 of docs/RECONCILIATION-REPORT.md), as narrowed by the Founder's Stage 2 authorization.
**Scope:** Search · Contacts · Client briefs · Meetings · Task comments · Notifications (incl. mark-all-as-read) · Activity logs · Settings (safe keys only) · plus the Founder-requested corporate sign-up request flow.
**Out of scope (explicitly forbidden):** website/domain/deployment operations, billing changes, Gmail/GitHub integrations, payment gateways, Phase 7, legacy wholesale restore, deletion of `/tmp/my-project` or the legacy archive.
**Baseline:** backup `backups/custom-2026-10-22-pre-stage2.db` (VACUUM INTO, integrity ok, 6 users / 3 clients / 2 projects / 22 tables, sha256 recorded) created before any change. Source DB sha256 unchanged by backup.

## Ground rules (from the Founder's authorization)

- Active Phase 6 portal, DB contents, auth, RBAC, client isolation and UI are preserved; zero destructive schema changes (additive `db push` only, no column drops/renames).
- Legacy source is read as reference only; active primitives are reused (`withApi`, `ok()`, zod, `requireRole`/`requireEmployee`/`resolveClientScope`/`assertOwnershipOrNotFound`, `logAudit`/`auditFromRequest`, `notifyUsers`, `generatePassword`). No `requireModule`/`requireFounder`/`{ok,data}` envelope/`businessName`/`displayName`.
- Authorization enforced server-side in every handler; clients are force-scoped to their own records; foreign resources return 404 (no existence leaks).
- No new npm dependencies. No secrets in tracked files, logs, reports or browser output. `.env`, `db/`, `backups/` stay untracked (verified).

## Module records (existing implementation → intended change)

### M1 · Notifications incl. mark-all-as-read
- **Existing:** `Notification` model; `GET/PATCH /api/notifications` (PATCH supports `{id}` and `{all:true}`, own rows only, implemented via `updateMany({userId})`); `NotificationBell` (app + portal shells) with "Mark all read"; `/app/notifications` page with "Mark all read". Complete vertical slice already present.
- **Intended change:** **No rebuild.** Add regression tests only (read-all marks own rows only, idempotent, unauthenticated 401). Any UI gap found during browser verification will be fixed additively.

### M2 · Activity logs (audit merge decision honored)
- **Existing:** single `AuditLog` stream + `GET /api/audit` + `/app/audit` page — **FOUNDER only** (contains IPs and DENIED details; correctly restricted). The reconciliation report recommends *merging* "Activity" into AuditLog instead of a second stream.
- **Intended change:** add a **sanitized activity feed for staff**: `GET /api/activity` (employee-only; returns latest entries with `result` SUCCESS/ALLOWED only; fields: action, entityType/Id, actor name/role, createdAt; **no** IP, detail, or DENIED rows) + `/app/activity` page (table + filter) + nav link for employees. Founder keeps the full audit page unchanged.

### M3 · Task comments
- **Existing:** `Task` model; `/api/tasks` CRUD with role matrix (FOUNDER/CLIENT_MANAGER full; WEB_DEVELOPER status-only on own/assigned-project tasks; SUPPORT_FINANCE/CLIENT denied); `/app/tasks` UI.
- **Intended change:** new `TaskComment` table (taskId, authorId, body, createdAt) + `GET/POST /api/tasks/[id]/comments` mirroring the task-read RBAC exactly (comments are internal delivery artefacts; CLIENT and SUPPORT_FINANCE get 403; dev only on visible tasks) + audit `TASK_COMMENT_ADDED` + comments UI in the tasks view (per-task thread dialog with count badge).

### M4 · Contacts
- **Existing:** none (`Client` has a single `contactName`, not a people directory).
- **Intended change:** new `Contact` table (per-client people: clientId required, name, title, email, phone, notes, isPrimary, createdById) + `/api/contacts` GET/POST + `/api/contacts/[id]` GET/PATCH/DELETE. RBAC: FOUNDER/CLIENT_MANAGER full CRUD; WEB_DEVELOPER/SUPPORT_FINANCE read; CLIENT 403 (internal directory). UI: `/app/contacts` (table, client filter, create/edit dialog, delete confirm) + nav link. Audit CONTACT_*.

### M5 · Meetings
- **Existing:** none.
- **Intended change:** new `Meeting` table (clientId?, projectId?, title, description, startsAt, durationMinutes, location?, meetingLink?, status SCHEDULED/COMPLETED/CANCELLED, outcome?, createdById) + `/api/meetings` GET/POST + `/api/meetings/[id]` GET/PATCH (reschedule/cancel/complete+outcome). RBAC: FOUNDER/CLIENT_MANAGER write; WEB_DEVELOPER/SUPPORT_FINANCE read; CLIENT read-only via portal for own client (`/api/portal/meetings`, scope-forced). UI: `/app/meetings` (list + schedule dialog + actions) + `/portal/meetings` (read-only list) + nav links. Notification to client users on schedule (best-effort).

### M6 · Client briefs
- **Existing:** none (clients currently express intent via support tickets / change requests).
- **Intended change:** new `Brief` table (clientId, projectId?, createdById, title, objectives, audience, scope, budget?, timeline?, notes?, status DRAFT→SUBMITTED→IN_REVIEW→ACCEPTED/REJECTED, reviewNotes?, reviewedById/At, submittedAt) + `/api/briefs` GET/POST + `/api/briefs/[id]` GET/PATCH (clients: edit own DRAFT, submit own; employees: review/status). RBAC: CLIENT create/read/update/submit **own client only** (foreign → 404); FOUNDER/CLIENT_MANAGER review; WEB_DEVELOPER/SUPPORT_FINANCE read. UI: `/portal/briefs` (list + guided form + submit + status) and `/app/briefs` (list + review actions) + nav links. Notifications: founder on submit; client on decision. Audit BRIEF_*.

### M7 · Global search
- **Existing:** none.
- **Intended change:** `GET /api/search?q=` (min 2 chars, prisma `contains`, no raw SQL) returning grouped results with hrefs, filtered by the **same visibility rules as each source module** (clients/projects/tasks/tickets/invoices for employees per-role; projects/tickets/invoices/briefs/meetings for CLIENT force-scoped to own client). UI: topbar search input with dropdown results in app-shell and portal-shell (debounced, Escape-closable, keyboard navigable).

### M8 · Settings (safe keys only)
- **Existing:** `/app/settings` page = account card + change-password only. No org-level settings.
- **Intended change:** new `Setting` table (key unique, value, updatedById) + `GET /api/settings` (employees read) + `PUT /api/settings` (FOUNDER/CLIENT_MANAGER; zod whitelist of **safe keys only**: AGENCY_NAME, SUPPORT_EMAIL, WEBSITE_URL, CONTACT_PHONE, TIMEZONE, PORTAL_WELCOME — string length caps; **no** billing/credential/security/integration keys). UI: "Agency profile" card on `/app/settings`; AGENCY_NAME + PORTAL_WELCOME surface in shells via layout props with `AgencyOS` fallback (default appearance unchanged until configured).

### M9 · Sign-up request flow (corporate, founder-mediated)
- **Existing:** no public sign-up; accounts are founder-provisioned (security model deliberately retained).
- **Intended change:** **real-corporate pattern — request, review, provision** (open instant accounts would bypass the founder-mediated security model, so approval stays founder-gated):
  - New `SignupRequest` table (name, email, company, message?, status PENDING/APPROVED/REJECTED, reviewNotes?, reviewedById/At, createdClientId?, createdUserId?, ip?).
  - `POST /api/public/signup-requests` (no auth; zod caps; honeypot field; IP rate-limit via existing `ratelimit.ts`; uniform 202 response that never leaks whether an email already requested).
  - `/signup` public page (corporate copy) + "Request access" button on `/login`.
  - `GET /api/signup-requests`, `POST /api/signup-requests/[id]/approve|reject` — FOUNDER only. Approve: reuse `generatePassword`/`hashPassword`; create the portal `User` (role CLIENT, mustChangePassword=true, sessions none) linked to an **existing client of the founder's choosing or a new Client (status LEAD)**; temp password returned once, never audited; audit + notification. Reject: notes, notification to no one (requester has no account).
  - `/app/signup-requests` founder-only review queue + nav link (FOUNDER).

## Schema delta (single additive push, then no schema changes for the rest of Stage 2)

New tables: `TaskComment`, `Contact`, `Brief`, `Meeting`, `Setting`, `SignupRequest`.
Back-relations added to existing models (virtual only — **zero data/row changes**): User (`taskComments`, `createdContacts`, `briefsCreated`/`briefsReviewed`, `meetingsCreated`, `settingsUpdated`, `signupReviews`), Client (`contacts`, `briefs`, `meetings`), Project (`briefs`, `meetings`), Task (`comments`).

## Test plan (executed per module; results reported verbatim)

`tests/stage2-security.ts` — same harness style as `tests/phase6-security.ts` (bun + fetch + cookie jars, pass/fail counters). Credentials are read from gitignored `tests/.creds.local.json` (current rotated passwords; never printed). Coverage per module: success paths · invalid input (400) · unauthenticated (401) · forbidden roles (403) · cross-client access (404, no leak) · edge cases (idempotency, empty query, dedupe, status-machine violations). Marker-prefixed records are cleaned up in the suite's teardown. Final gate also runs: `bunx tsc --noEmit`, `bun run lint`, existing `tests/phase6-security.ts` (after the documented seed/credential fixes below), plus browser verification (Founder + portal, desktop 1366×900 + mobile 390×844).

## Infra fix (documented deviation, required by the Founder's regression mandate)

`scripts/seed.ts` currently overwrites every existing user's password with demo values on re-run — this clobbers the rotated credentials and forces a full re-rotation after each regression run (documented caveat in worklog). Fix: seed sets `passwordHash`/`mustChangePassword` **only when creating** a user; existing users' credentials are preserved. `tests/phase6-security.ts` gains an optional credentials override (gitignored JSON) so the 124-check suite can run without reseeding or re-rotation. Neither change touches runtime auth code.

## Per-module completion report template

Files changed · routes/schema added · role permissions enforced · tests executed with actual results · known limitations/risks · backup location.
