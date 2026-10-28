# API Route Authorization Matrix

All routes enforce authentication server-side via the session cookie (`agencyos_session`, hashed token in DB). No route relies on UI hiding alone.

## Public (no auth)
| Route | Methods | Notes |
|---|---|---|
| `/api/auth/login` | POST | Rate of failed attempts audited; generic error |
| `/api/auth/logout` | POST | Clears cookie + deletes session |
| `/api/auth/forgot-password` | POST | Records single-use hashed token; plaintext never returned (no email delivery configured — reset completes via Founder) |
| `/api/signup-requests` | POST | IP rate-limited (5/hour); duplicate-pending suppressed; generic success |

## Authenticated (any active account)
| Route | Method | Notes |
|---|---|---|
| `/api/auth/me` | GET | Own identity |
| `/api/auth/password` | POST | Self password change; revokes ALL sessions; min 10 chars |
| `/api/notifications` | GET | Own notifications only |
| `/api/notifications/[id]/read` | POST | Own notification only |
| `/api/notifications/read-all` | POST | Own only |

## Staff (employee sessions)
| Route | Roles | Notes |
|---|---|---|
| `/api/team` GET | all staff | Directory without credentials |
| `/api/team` POST | OWNER | Temp password returned once; member forced to change |
| `/api/team/[id]` PATCH, POST (reset) | OWNER | Last-active-OWNER protection |
| `/api/team/[id]/reset-password` POST | OWNER | Revokes sessions |
| `/api/clients` GET | OWNER, CLIENT_MANAGER, SUPPORT_FINANCE, CREATIVE_DIRECTOR | |
| `/api/clients` POST / `[id]` PATCH/DELETE | `clients.manage` (OWNER, CLIENT_MANAGER) | |
| `/api/clients/[id]` POST (portal user) / PUT (reset) | OWNER, CLIENT_MANAGER | Temp password returned once |
| `/api/clients/[id]` GET | all staff | |
| `/api/projects` GET | role-scoped | WEB_DEVELOPER/VIDEOGRAPHER/VIDEO_EDITOR see assigned-only |
| `/api/projects` POST | `projects.manage` (OWNER, CLIENT_MANAGER) | Video contract snapshot at creation |
| `/api/projects/[id]` GET | global readers + assigned | 403 otherwise |
| `/api/projects/[id]` PATCH | `projects.manage` | |
| `/api/video/packages` GET | all staff | |
| `/api/video/packages` POST / `[id]` PATCH | `packages.manage` | Snapshots never rewritten |
| `/api/video/dashboard` GET | all staff (scoped) | Real counts from deliverable records |
| `/api/video/deliverables` GET | global readers + assigned (editor/videographer) | |
| `/api/video/deliverables` POST | `deliverables.manage` | Replacement must reference cancelled record |
| `/api/video/deliverables/[id]` GET | global readers + assigned | |
| `/api/video/deliverables/[id]` PATCH | manager/CD/assigned | Manager-only fields enforced server-side |
| `/api/video/deliverables/[id]/transition` POST | per-state role table + assignment gate | State machine in `src/lib/video-state-machine.ts`; invalid jumps 422; reasons/backup-verification enforced |
| `/api/video/deliverables/[id]/brief` POST/PATCH | `briefs.edit` + assignment | Version history preserved |
| `/api/video/deliverables/[id]/versions` GET/POST | assigned editor or manager | Status must be EDITING/REVISION_REQUIRED |
| `/api/video/versions/[id]` POST | OWNER/CD/CM (not self-upload) | Internal review decision; drives deliverable status |
| `/api/video/versions/[id]` PUT | staff with access | Timecoded comments |
| `/api/video/shoots` GET | role-scoped | |
| `/api/video/shoots` POST | `shoots.manage` | Conflict detection flagged |
| `/api/video/shoots/[id]` GET | global + crew/manager/linked | |
| `/api/video/shoots/[id]` PATCH | `shoots.manage` | Reschedule notifies crew+client |
| `/api/video/shoots/[id]` POST | complete: `shoots.markComplete`+manager; cancel: `shoots.manage` | Never auto-completed; reason required |
| `/api/video/editing-queue` GET | all staff (editor sees own) | |
| `/api/video/equipment` GET | all staff | |
| `/api/video/equipment` POST / `[id]` PATCH | `equipment.manage` | |
| `/api/video/scope-changes` POST | `projects.manage` | |
| `/api/video/scope-changes/[id]` PATCH | `projects.manage` | Approval creates deliverables transactionally (duplicate-safe) |
| `/api/media` GET/POST | staff; delivery roles scoped | Metadata only; binary storage honestly unconfigured |
| `/api/tasks` GET/POST, `[id]` PATCH/POST | staff; assignee can work own | |
| `/api/tasks/[id]/comments` GET | managerial or own task | |
| `/api/meetings` GET/POST, `[id]` PATCH/DELETE | staff (`meetings.manage` for DELETE) | |
| `/api/contacts` GET | all staff | |
| `/api/contacts` POST | all staff | |
| `/api/contacts/[id]` PATCH | OWNER/CM/SF; DELETE OWNER/CM | |
| `/api/invoices` GET | OWNER/SF/CM | |
| `/api/invoices` POST | `finance.manage` (OWNER/SF) | Draft only |
| `/api/invoices/[id]` POST | `finance.manage` | Explicit send/markPaid/void; illegal transitions 422 |
| `/api/expenses` GET | OWNER/SF/CM/CD | |
| `/api/expenses` POST | `finance.manage` | |
| `/api/finance/summary` GET | OWNER/SF/CM | |
| `/api/reports/overview` GET | OWNER/CM/SF/CD | Service filter |
| `/api/audit` GET | OWNER, CLIENT_MANAGER | |
| `/api/settings` GET/PUT | OWNER | |
| `/api/overview` GET | all staff (scoped) | |

## Client portal (CLIENT sessions only — staff rejected)
| Route | Method | Scoping |
|---|---|---|
| `/api/portal/overview` GET | own client only | Own data only |
| `/api/portal/overview` POST | client version feedback | Version must belong to session's client AND be PENDING_CLIENT; approval binds to version; revision increments count |
| `/api/portal/projects` GET | own client only | Client-visible fields only (no internal notes/costs) |
| `/api/portal/deliverables` GET | own client only | Only PENDING_CLIENT/APPROVED versions exposed |
| `/api/portal/deliveries` GET | own client only | DELIVERED records + delivery reference |
| `/api/portal/invoices` GET | own client only | |
| `/api/portal/tickets` GET/POST/PUT | own client only | Internal replies filtered; state transitions server-side |

## Isolation invariants (tested)
- Anonymous → 401 on all protected routes
- Client role → 403 on every staff endpoint
- Staff → 403 on every `/api/portal/*` endpoint
- Client A cannot read/modify Client B's records (404 semantics — existence not revealed)
- Delivery roles (WEB_DEVELOPER/VIDEOGRAPHER/VIDEO_EDITOR) see only assigned records; 403 on unassigned project/deliverable detail
- Every mutation writes an AuditLog entry
