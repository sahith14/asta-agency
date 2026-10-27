// AgencyOS — shared constants (SQLite has no enums; these are the single source of truth)

export const ROLES = {
  FOUNDER: 'FOUNDER',
  CLIENT_MANAGER: 'CLIENT_MANAGER',
  WEB_DEVELOPER: 'WEB_DEVELOPER',
  SUPPORT_FINANCE: 'SUPPORT_FINANCE',
  CLIENT: 'CLIENT',
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

export const EMPLOYEE_ROLES: Role[] = [
  ROLES.FOUNDER,
  ROLES.CLIENT_MANAGER,
  ROLES.WEB_DEVELOPER,
  ROLES.SUPPORT_FINANCE,
]

export const ALL_ROLES: Role[] = [...EMPLOYEE_ROLES, ROLES.CLIENT]

export const ROLE_LABELS: Record<Role, string> = {
  FOUNDER: 'Founder',
  CLIENT_MANAGER: 'Client Manager',
  WEB_DEVELOPER: 'Web Developer',
  SUPPORT_FINANCE: 'Support & Finance',
  CLIENT: 'Client',
}

// --- Client lifecycle ---
export const CLIENT_STATUSES = ['LEAD', 'ACTIVE', 'CHURNED'] as const

// --- Project ---
export const PROJECT_STATUSES = ['DISCOVERY', 'BUILD', 'REVIEW', 'LAUNCH', 'COMPLETE', 'PAUSED', 'CANCELLED'] as const

// --- Milestone ---
export const MILESTONE_STATUSES = ['PENDING', 'IN_PROGRESS', 'DELIVERED', 'APPROVED'] as const

// --- Deliverable ---
export const DELIVERABLE_STATUSES = ['PLANNED', 'IN_BUILD', 'READY_FOR_REVIEW', 'AUTHORIZED', 'APPROVED', 'CHANGES_REQUESTED'] as const

// --- Demo (P6-1/P6-3) ---
export const DEMO_STATUSES = [
  'PREPARING',
  'READY_FOR_FOUNDER',
  'AUTHORIZED_FOR_PREVIEW',
  'SENT_TO_CLIENT',
  'CHANGES_REQUESTED',
  'APPROVED',
] as const

// --- Change request ---
export const CHANGE_REQUEST_STATUSES = ['SUBMITTED', 'UNDER_FOUNDER_REVIEW', 'SCOPE_REVIEWED', 'APPROVED', 'REJECTED', 'CONVERTED_TO_TASK'] as const
export const SCOPE_IMPACTS = ['NONE', 'EXTRA_COST_QUOTED'] as const

// --- Task ---
export const TASK_STATUSES = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE'] as const
export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const

// --- Briefs (Stage 2: client briefs) ---
export const BRIEF_STATUSES = ['DRAFT', 'SUBMITTED', 'IN_REVIEW', 'ACCEPTED', 'REJECTED'] as const

// --- Tickets ---
export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_ON_CLIENT', 'RESOLVED', 'CLOSED'] as const
export const TICKET_TYPES = ['SUPPORT', 'WEBSITE_CHANGE'] as const

// --- Billing ---
export const INVOICE_STATUSES = ['DRAFT', 'ISSUED', 'PAID', 'OVERDUE', 'CANCELLED'] as const
export const PAYMENT_METHODS = ['BANK_TRANSFER', 'CARD_ONLINE', 'MANUAL_CREDIT', 'REFUND'] as const
export const PAYMENT_STATUSES = ['PENDING', 'VERIFIED', 'REJECTED'] as const
export const SUBSCRIPTION_STATUSES = ['ACTIVE', 'PAST_DUE', 'CANCELLED'] as const
export const BILLING_QUESTION_TYPES = ['QUESTION', 'CANCELLATION_REQUEST'] as const
export const BILLING_QUESTION_STATUSES = ['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED', 'ACCEPTED'] as const

// --- Approval events (P6-3 audit trail) ---
export const APPROVAL_ACTIONS = [
  'AUTHORIZED_CLIENT_PREVIEW',
  'CLIENT_APPROVED',
  'CLIENT_CHANGES_REQUESTED',
  'FOUNDER_SCOPE_REVIEWED',
  'CHANGE_APPROVED',
  'CHANGE_REJECTED',
  'CHANGE_CONVERTED_TO_TASK',
  'DEPLOYMENT_REQUESTED',
  'DEPLOYMENT_APPROVED',
] as const

// --- Maintenance SOP (evidence-based; fabricating results is prohibited) ---
export const MAINTENANCE_CHECKS = ['UPTIME', 'SSL', 'BACKUPS', 'LINKS', 'UPDATES', 'CONTENT', 'MOBILE'] as const
export const MAINTENANCE_CHECK_STATUSES = ['PASS', 'FAIL', 'SKIPPED'] as const
export const MAINTENANCE_REPORT_STATUSES = ['DRAFT', 'COMPLETED'] as const

// --- Misc ---
export const ASSET_VISIBILITIES = ['CLIENT', 'INTERNAL'] as const
export const REPLY_VISIBILITIES = ['CLIENT', 'INTERNAL'] as const
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export const SESSION_COOKIE = 'agencyos_session'
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
