/**
 * AgencyOS — Shared domain types, enums, labels and API contracts.
 * Used by both server route handlers and client views. Keep in sync with
 * prisma/schema.prisma.
 */

// ---------------------------------------------------------------------------
// Enum values (persisted as strings)
// ---------------------------------------------------------------------------

export const CLIENT_STATUSES = ["PROSPECT", "ACTIVE", "INACTIVE"] as const;
export const CLIENT_TYPES = [
  "RESTAURANT_CAFE",
  "BARBER_SALON",
  "MECHANIC_GARAGE",
  "PLUMBER_ELECTRICIAN",
  "CLEANING",
  "RETAIL",
  "OTHER",
] as const;

export const WEBSITE_LIFECYCLE = [
  "PLANNED",
  "IN_DEVELOPMENT",
  "STAGING",
  "LIVE",
  "SUSPENDED",
  "RETIRED",
] as const;
export const WEBSITE_ENVIRONMENTS = ["PRODUCTION", "STAGING", "DEVELOPMENT"] as const;
export const WEBSITE_TYPES = ["BROCHURE", "ECOMMERCE", "BOOKING", "LANDING", "PORTFOLIO", "OTHER"] as const;
export const MAINTENANCE_COVERAGES = ["NONE", "BASIC", "STANDARD", "PREMIUM"] as const;

export const PROJECT_STATUSES = [
  "LEAD",
  "QUOTED",
  "DEPOSIT_PAID",
  "IN_DEVELOPMENT",
  "CLIENT_REVIEW",
  "REVISIONS",
  "READY_TO_LAUNCH",
  "LIVE",
  "COMPLETED",
  "ON_HOLD",
  "CANCELLED",
  "AWAITING_CLIENT",
] as const;
export const PROJECT_TYPES = ["NEW_WEBSITE", "REDESIGN", "MAINTENANCE_WORK", "FEATURE_WORK", "MIGRATION", "OTHER"] as const;

/** Valid project status transitions (spec §7.4). */
export const PROJECT_TRANSITIONS: Record<string, readonly string[]> = {
  LEAD: ["QUOTED", "ON_HOLD", "CANCELLED"],
  QUOTED: ["DEPOSIT_PAID", "LEAD", "ON_HOLD", "CANCELLED"],
  DEPOSIT_PAID: ["IN_DEVELOPMENT", "ON_HOLD", "CANCELLED"],
  IN_DEVELOPMENT: ["CLIENT_REVIEW", "READY_TO_LAUNCH", "AWAITING_CLIENT", "ON_HOLD", "CANCELLED"],
  CLIENT_REVIEW: ["REVISIONS", "READY_TO_LAUNCH", "AWAITING_CLIENT", "ON_HOLD", "CANCELLED"],
  REVISIONS: ["CLIENT_REVIEW", "READY_TO_LAUNCH", "AWAITING_CLIENT", "ON_HOLD", "CANCELLED"],
  READY_TO_LAUNCH: ["LIVE", "REVISIONS", "ON_HOLD", "CANCELLED"],
  LIVE: ["COMPLETED"],
  COMPLETED: [],
  ON_HOLD: ["LEAD", "QUOTED", "DEPOSIT_PAID", "IN_DEVELOPMENT", "CLIENT_REVIEW", "REVISIONS", "READY_TO_LAUNCH", "CANCELLED"],
  CANCELLED: [],
  AWAITING_CLIENT: ["IN_DEVELOPMENT", "CLIENT_REVIEW", "READY_TO_LAUNCH", "ON_HOLD", "CANCELLED"],
};

export const ACTIVE_PROJECT_STATUSES = [
  "LEAD",
  "QUOTED",
  "DEPOSIT_PAID",
  "IN_DEVELOPMENT",
  "CLIENT_REVIEW",
  "REVISIONS",
  "READY_TO_LAUNCH",
  "AWAITING_CLIENT",
  "ON_HOLD",
] as const;

export const TASK_STATUSES = [
  // Phase 5 developer workflow
  "BACKLOG",
  "READY",
  "IN_PROGRESS",
  "BLOCKED",
  "IN_REVIEW",
  "APPROVAL_REQUIRED",
  "APPROVED",
  "DEPLOYED",
  "COMPLETED",
  "CANCELLED",
  // Legacy statuses (pre-Phase 5 rows) — remain valid everywhere, never renamed
  "TODO",
  "WAITING",
] as const;
export const TASK_PRIORITIES = ["LOW", "NORMAL", "HIGH", "CRITICAL"] as const;
export const OPEN_TASK_STATUSES = [
  "BACKLOG",
  "READY",
  "IN_PROGRESS",
  "BLOCKED",
  "IN_REVIEW",
  "APPROVAL_REQUIRED",
  "APPROVED",
  "DEPLOYED",
  "TODO",
  "WAITING",
] as const;
/** The board columns of the Phase 5 developer workflow (legacy rows map in). */
export const DEV_TASK_STATUSES = [
  "BACKLOG",
  "READY",
  "IN_PROGRESS",
  "BLOCKED",
  "IN_REVIEW",
  "APPROVAL_REQUIRED",
  "APPROVED",
  "DEPLOYED",
] as const;
export const TASK_TRANSITIONS: Record<string, readonly string[]> = {
  BACKLOG: ["READY", "IN_PROGRESS", "CANCELLED"],
  READY: ["IN_PROGRESS", "BACKLOG", "CANCELLED"],
  IN_PROGRESS: ["BLOCKED", "IN_REVIEW", "COMPLETED", "BACKLOG", "CANCELLED"],
  BLOCKED: ["IN_PROGRESS", "BACKLOG", "CANCELLED"],
  IN_REVIEW: ["APPROVAL_REQUIRED", "APPROVED", "IN_PROGRESS", "CANCELLED"],
  APPROVAL_REQUIRED: ["APPROVED", "IN_PROGRESS", "CANCELLED"],
  APPROVED: ["DEPLOYED", "IN_PROGRESS", "CANCELLED"],
  DEPLOYED: ["COMPLETED"],
  // Reopen stays available (legacy behaviour + operator correction); a
  // reopened Phase 5 task lands in BACKLOG, legacy rows in TODO.
  COMPLETED: ["BACKLOG", "TODO"],
  CANCELLED: [],
  // Legacy statuses keep their pre-Phase 5 free-form behaviour.
  TODO: ["IN_PROGRESS", "COMPLETED", "WAITING", "CANCELLED", "BACKLOG"],
  WAITING: ["IN_PROGRESS", "COMPLETED", "CANCELLED", "BLOCKED"],
};
export const TASK_SOURCES = [
  "FOUNDER_REQUEST",
  "CLIENT_CHANGE",
  "SUPPORT_TICKET",
  "SCHEDULED_MAINTENANCE",
] as const;
export const TASK_SCOPE_STATUSES = ["IN_SCOPE", "OUT_OF_SCOPE", "ESCALATED"] as const;
export const TASK_RELEASE_STATUSES = ["NOT_APPLICABLE", "PENDING_RELEASE", "RELEASED"] as const;

// ---------------------------------------------------------------------------
// Phase 2 — Support tickets, Gmail integration, email matching
// ---------------------------------------------------------------------------

export const TICKET_STATUSES = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_CLIENT",
  "WAITING_THIRD_PARTY",
  "RESOLVED",
  "CLOSED",
] as const;

/** Valid ticket status transitions (server-validated; mirrors PROJECT_TRANSITIONS). */
export const TICKET_TRANSITIONS: Record<string, readonly string[]> = {
  NEW: ["OPEN", "IN_PROGRESS", "WAITING_CLIENT", "WAITING_THIRD_PARTY", "RESOLVED", "CLOSED"],
  OPEN: ["IN_PROGRESS", "WAITING_CLIENT", "WAITING_THIRD_PARTY", "RESOLVED", "CLOSED"],
  IN_PROGRESS: ["OPEN", "WAITING_CLIENT", "WAITING_THIRD_PARTY", "RESOLVED", "CLOSED"],
  WAITING_CLIENT: ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"],
  WAITING_THIRD_PARTY: ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"],
  RESOLVED: ["OPEN", "CLOSED"],
  CLOSED: ["OPEN"],
};

export const OPEN_TICKET_STATUSES = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_CLIENT", "WAITING_THIRD_PARTY"] as const;
export const TICKET_SOURCES = ["EMAIL", "MANUAL"] as const;
export const TICKET_MESSAGE_KINDS = ["CUSTOMER_MESSAGE", "REPLY", "INTERNAL_NOTE"] as const;
export const DELIVERY_STATUSES = ["DRAFT", "PENDING_SEND", "SENT_ACCEPTED", "FAILED", "UNCERTAIN"] as const;
export const TICKET_PRIORITIES = TASK_PRIORITIES;

export const EMAIL_MATCH_STATUSES = ["CONFIRMED", "SUGGESTED", "NO_MATCH", "NEEDS_REVIEW"] as const;
/** matchStatus values that appear in the Needs Review queue. */
export const EMAIL_REVIEW_STATUSES = ["SUGGESTED", "NEEDS_REVIEW"] as const;
export const EMAIL_DIRECTIONS = ["INBOUND", "OUTBOUND"] as const;
export const EMAIL_SYNC_STATUSES = ["SYNCED", "FAILED"] as const;

export const EMAIL_ACCOUNT_STATUSES = [
  "CONNECTED",
  "DISCONNECTED",
  "AWAITING_AUTH",
  "REAUTH_REQUIRED",
  "ERROR",
] as const;

/** Effective connection state computed by GET /api/gmail/status. */
export const GMAIL_CONNECTION_STATES = [
  "NOT_CONFIGURED",
  "DISCONNECTED",
  "AWAITING_AUTHORISATION",
  "CONNECTED",
  "SYNCING",
  "ERROR",
  "REAUTH_REQUIRED",
] as const;

export const SYNC_RUN_STATUSES = ["IN_PROGRESS", "SUCCESS", "PARTIAL", "FAILED"] as const;
export const SYNC_RUN_KINDS = ["INITIAL", "INCREMENTAL", "RECOVERY", "MANUAL"] as const;
export const SYNC_RUN_TRIGGERS = ["MANUAL", "SCHEDULED"] as const;

// ---------------------------------------------------------------------------
// Phase 3 — Billing: plans, quotes, invoices, payments, subscriptions
// ---------------------------------------------------------------------------

export const SERVICE_PLAN_INTERVALS = ["MONTHLY", "QUARTERLY", "YEARLY"] as const;

export const QUOTE_STATUSES = [
  "DRAFT",
  "SENT",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
] as const;

/** Valid quote status transitions (server-validated). */
export const QUOTE_TRANSITIONS: Record<string, readonly string[]> = {
  DRAFT: ["SENT", "CANCELLED"],
  SENT: ["ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED"],
  ACCEPTED: [],
  REJECTED: [],
  EXPIRED: [],
  CANCELLED: [],
};

export const INVOICE_STATUSES = [
  "DRAFT",
  "ISSUED",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "REFUNDED",
  "VOID",
] as const;

/** Valid invoice status transitions (server-validated).
 *  REFUNDED is entered automatically by the payment-refund status machine
 *  (verified-effective paid reaches 0 after refunds) — it is terminal and
 *  never available as a manual status action. */
export const INVOICE_TRANSITIONS: Record<string, readonly string[]> = {
  DRAFT: ["ISSUED", "VOID"],
  ISSUED: ["PARTIALLY_PAID", "PAID", "OVERDUE", "VOID"],
  PARTIALLY_PAID: ["PAID", "VOID"],
  OVERDUE: ["PARTIALLY_PAID", "PAID", "VOID"],
  PAID: [],
  REFUNDED: [],
  VOID: [],
};

/** Issued statuses that can carry an outstanding balance. */
export const UNPAID_INVOICE_STATUSES = ["ISSUED", "OVERDUE", "PARTIALLY_PAID"] as const;

export const INVOICE_KINDS = ["ONE_OFF", "RENEWAL"] as const;
export const PAYMENT_METHODS = ["BANK_TRANSFER", "CASH", "CARD_MANUAL", "CHEQUE", "OTHER"] as const;
export const PAYMENT_STATUSES = ["PENDING", "VERIFIED", "FAILED", "REFUNDED"] as const;

export const SUBSCRIPTION_STATUSES = [
  "PENDING",
  "ACTIVE",
  "PAST_DUE",
  "PAUSED",
  "CANCELLED",
  "ENDED",
] as const;

/** Valid subscription status transitions (server-validated). */
export const SUBSCRIPTION_TRANSITIONS: Record<string, readonly string[]> = {
  PENDING: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["PAST_DUE", "PAUSED", "CANCELLED", "ENDED"],
  PAST_DUE: ["ACTIVE", "PAUSED", "CANCELLED", "ENDED"],
  PAUSED: ["ACTIVE", "CANCELLED", "ENDED"],
  CANCELLED: ["ENDED"],
  ENDED: [],
};

export const SUBSCRIPTION_EVENT_KINDS = [
  "CREATED",
  "PLAN_CHANGED",
  "PRICE_CHANGED",
  "STATUS_CHANGED",
  "RENEWAL_INVOICED",
  "PAUSED",
  "RESUMED",
  "CANCELLED",
  "ENDED",
  "NOTE",
] as const;

// ---------------------------------------------------------------------------
// Phase 4 — Operations: monitoring, incidents, maintenance, deployments
// ---------------------------------------------------------------------------

/** Stored health states (DISABLED is derived: no MonitorConfig row / enabled=false). */
export const MONITOR_HEALTH_STATES = ["UNKNOWN", "HEALTHY", "DEGRADED", "DOWN"] as const;

export const INCIDENT_SEVERITIES = ["SEV1", "SEV2", "SEV3", "SEV4"] as const;

export const INCIDENT_STATUSES = [
  "DETECTED",
  "INVESTIGATING",
  "IDENTIFIED",
  "MITIGATING",
  "MONITORING_RECOVERY",
  "RESOLVED",
  "CLOSED",
] as const;

/** Valid incident status transitions (server-validated).
 *  RESOLVED → INVESTIGATING and CLOSED → INVESTIGATING are the reopen paths. */
export const INCIDENT_TRANSITIONS: Record<string, readonly string[]> = {
  DETECTED: ["INVESTIGATING", "IDENTIFIED", "MITIGATING", "RESOLVED"],
  INVESTIGATING: ["IDENTIFIED", "MITIGATING", "MONITORING_RECOVERY", "RESOLVED"],
  IDENTIFIED: ["MITIGATING", "MONITORING_RECOVERY", "RESOLVED"],
  MITIGATING: ["MONITORING_RECOVERY", "RESOLVED"],
  MONITORING_RECOVERY: ["MITIGATING", "RESOLVED"],
  RESOLVED: ["INVESTIGATING", "CLOSED"],
  CLOSED: ["INVESTIGATING"],
};

/** Incidents that are not yet resolved/closed. */
export const OPEN_INCIDENT_STATUSES = [
  "DETECTED",
  "INVESTIGATING",
  "IDENTIFIED",
  "MITIGATING",
  "MONITORING_RECOVERY",
] as const;

export const INCIDENT_DETECTION_SOURCES = ["MONITORING", "MANUAL", "DOMAIN_SSL", "DEPLOYMENT"] as const;

export const INCIDENT_EVENT_KINDS = [
  "CREATED",
  "STATUS_CHANGED",
  "OBSERVATION",
  "NOTE",
  "RECOVERY",
  "REOPENED",
  "TICKET_LINKED",
  "TICKET_UNLINKED",
] as const;

export const MAINTENANCE_FREQUENCIES = ["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"] as const;

export const MAINTENANCE_RUN_STATUSES = ["PLANNED", "IN_PROGRESS", "COMPLETED", "SKIPPED", "CANCELLED"] as const;

export const MAINTENANCE_RUN_TRANSITIONS: Record<string, readonly string[]> = {
  PLANNED: ["IN_PROGRESS", "COMPLETED", "SKIPPED", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "SKIPPED", "CANCELLED"],
  COMPLETED: [],
  SKIPPED: [],
  CANCELLED: [],
};

export const MAINTENANCE_FREQUENCIES_DAYS: Record<string, number> = {
  WEEKLY: 7,
  MONTHLY: 30,
  QUARTERLY: 91,
  YEARLY: 365,
};

export const CHECKLIST_CATEGORIES = [
  "AVAILABILITY",
  "FORMS",
  "LINKS",
  "SSL_DOMAIN",
  "BACKUP",
  "SECURITY",
  "PERFORMANCE",
  "UPDATES",
  "SUMMARY",
  "GENERAL",
] as const;

/** PASSED/FAILED mean a real attempt was made; ATTEMPTED = tried but inconclusive. */
export const CHECKLIST_RESULTS = ["PENDING", "PASSED", "FAILED", "ATTEMPTED", "SKIPPED", "NOT_APPLICABLE"] as const;

export const DEPLOYMENT_STATUSES = [
  "QUEUED",
  "BUILDING",
  "DEPLOYING",
  "SUCCESSFUL",
  "FAILED",
  "CANCELLED",
  "ROLLED_BACK",
] as const;

export const DEPLOYMENT_TRANSITIONS: Record<string, readonly string[]> = {
  QUEUED: ["BUILDING", "DEPLOYING", "SUCCESSFUL", "FAILED", "CANCELLED"],
  BUILDING: ["DEPLOYING", "SUCCESSFUL", "FAILED", "CANCELLED"],
  DEPLOYING: ["SUCCESSFUL", "FAILED", "CANCELLED", "ROLLED_BACK"],
  SUCCESSFUL: ["ROLLED_BACK"],
  FAILED: [],
  CANCELLED: [],
  ROLLED_BACK: [],
};

export const DEPLOYMENT_ENVIRONMENTS = ["PRODUCTION", "STAGING", "DEVELOPMENT"] as const;

export const BACKGROUND_JOB_KEYS = [
  "WEBSITE_HEALTH_CHECKS",
  "DOMAIN_SSL_CHECKS",
  "MAINTENANCE_REMINDERS",
  "DEPLOYMENT_RECONCILIATION",
  "BILLING_TASKS",
  "NOTIFICATION_SWEEP", // Phase 5 — SLA/maintenance/invoice/renewal/task notifications (idempotent)
] as const;

export const JOB_RUN_STATUSES = ["RUNNING", "SUCCESS", "PARTIAL", "FAILED"] as const;

export const JOB_TRIGGERS = ["SCHEDULED", "MANUAL"] as const;

export const WEBHOOK_EVENT_STATUSES = ["RECEIVED", "PROCESSED", "SKIPPED_DUPLICATE", "FAILED"] as const;

export const PROVIDER_CONNECTION_STATUSES = ["NOT_CONFIGURED", "CONNECTED", "ERROR", "DISABLED"] as const;

export const PROVIDER_SUGGESTIONS = [
  "GITHUB",
  "VERCEL",
  "NETLIFY",
  "CLOUDFLARE_PAGES",
  "CLOUDFLARE",
  "AWS",
  "MANUAL",
] as const;

/** Sanitised error taxonomy for health checks. */
export const CHECK_ERROR_CATEGORIES = [
  "DNS",
  "CONNECTION",
  "TIMEOUT",
  "TLS",
  "HTTP_STATUS",
  "REDIRECT",
  "BLOCKED_URL",
  "UNKNOWN",
] as const;

// ---------------------------------------------------------------------------
// Phase 5 — team roles, briefs, meetings, notifications
// ---------------------------------------------------------------------------

export const USER_ROLES = [
  "OWNER",
  "CLIENT_MANAGER",
  "WEB_DEVELOPER",
  "SUPPORT_FINANCE",
  "STAFF", // legacy — deny-by-default employee
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const OUTREACH_STATUSES = [
  "UNSPECIFIED",
  "ELIGIBLE",
  "CONTACTED",
  "FOLLOW_UP",
  "OPTED_OUT",
] as const;

export const BRIEF_STATUSES = [
  "DRAFT",
  "NEEDS_INFORMATION",
  "READY_FOR_REVIEW",
  "APPROVED_FOR_MEETING",
  "MEETING_COMPLETED",
  "CHANGES_REQUESTED",
  "HANDED_TO_DEVELOPMENT",
  "CLOSED",
] as const;

export const BRIEF_TRANSITIONS: Record<string, readonly string[]> = {
  DRAFT: ["NEEDS_INFORMATION", "READY_FOR_REVIEW", "CLOSED"],
  NEEDS_INFORMATION: ["READY_FOR_REVIEW", "CLOSED"],
  READY_FOR_REVIEW: ["APPROVED_FOR_MEETING", "CHANGES_REQUESTED", "NEEDS_INFORMATION", "CLOSED"],
  APPROVED_FOR_MEETING: ["MEETING_COMPLETED", "CHANGES_REQUESTED", "CLOSED"],
  MEETING_COMPLETED: ["CHANGES_REQUESTED", "HANDED_TO_DEVELOPMENT", "CLOSED"],
  CHANGES_REQUESTED: ["READY_FOR_REVIEW", "CLOSED"],
  HANDED_TO_DEVELOPMENT: ["CLOSED"],
  CLOSED: [],
};

export const BRIEF_PREVIEW_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "READY_TO_SHARE", "SHARED"] as const;

export const MEETING_STATUSES = ["SCHEDULED", "COMPLETED", "CANCELLED"] as const;

/** Timezones offered by the internal scheduler (explicitly recorded per meeting). */
export const MEETING_TIMEZONES = [
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Australia/Sydney",
] as const;

export const NOTIFICATION_KINDS = [
  "LEAD_QUALIFIED",
  "MEETING_BOOKED",
  "MEETING_RESCHEDULED",
  "MEETING_CANCELLED",
  "BRIEF_READY_FOR_REVIEW",
  "BRIEF_MISSING_INFO",
  "MEETING_OUTCOME_RECORDED",
  "HANDOVER_CREATED",
  "TASK_ASSIGNED",
  "TASK_DUE_SOON",
  "TASK_APPROVAL_REQUESTED",
  "CRITICAL_INCIDENT",
  "MAINTENANCE_DUE",
  "MAINTENANCE_COMPLETED",
  "PAYMENT_FAILED",
  "INVOICE_OVERDUE",
  "SUBSCRIPTION_RENEWING",
  "TICKET_SLA_BREACH",
  "REFUND_REQUESTED",
  "ACCOUNT_UPDATED",
] as const;

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export const LABELS: Record<string, string> = {
  PROSPECT: "Prospect",
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  RESTAURANT_CAFE: "Restaurant / Café",
  BARBER_SALON: "Barbershop / Salon",
  MECHANIC_GARAGE: "Mechanic / Garage",
  PLUMBER_ELECTRICIAN: "Plumber / Electrician",
  CLEANING: "Cleaning Company",
  RETAIL: "Retail Shop",
  OTHER: "Other",
  PLANNED: "Planned",
  IN_DEVELOPMENT: "In Development",
  STAGING: "Staging",
  LIVE: "Live",
  SUSPENDED: "Suspended",
  RETIRED: "Retired",
  PRODUCTION: "Production",
  DEVELOPMENT: "Development",
  BROCHURE: "Brochure",
  ECOMMERCE: "E-commerce",
  BOOKING: "Booking",
  LANDING: "Landing Page",
  PORTFOLIO: "Portfolio",
  NONE: "None",
  BASIC: "Basic",
  STANDARD: "Standard",
  PREMIUM: "Premium",
  LEAD: "Lead",
  QUOTED: "Quoted",
  DEPOSIT_PAID: "Deposit Paid",
  CLIENT_REVIEW: "Client Review",
  REVISIONS: "Revisions",
  READY_TO_LAUNCH: "Ready to Launch",
  COMPLETED: "Completed",
  ON_HOLD: "On Hold",
  CANCELLED: "Cancelled",
  AWAITING_CLIENT: "Awaiting Client",
  NEW_WEBSITE: "New Website",
  REDESIGN: "Redesign",
  MAINTENANCE_WORK: "Maintenance Work",
  FEATURE_WORK: "Feature Work",
  MIGRATION: "Migration",
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  WAITING: "Waiting",
  BACKLOG: "Backlog",
  READY: "Ready",
  BLOCKED: "Blocked",
  IN_REVIEW: "In Review",
  APPROVAL_REQUIRED: "Approval Required",
  APPROVED: "Approved",
  DEPLOYED: "Deployed",
  FOUNDER_REQUEST: "Founder request",
  CLIENT_CHANGE: "Client change",
  SUPPORT_TICKET: "Support ticket",
  SCHEDULED_MAINTENANCE: "Scheduled maintenance",
  IN_SCOPE: "In scope",
  OUT_OF_SCOPE: "Out of scope",
  ESCALATED: "Escalated",
  NOT_APPLICABLE: "N/A",
  PENDING_RELEASE: "Pending release",
  RELEASED: "Released",
  OWNER: "Founder",
  STAFF: "Staff",
  CLIENT_MANAGER: "Client Manager",
  WEB_DEVELOPER: "Web Developer",
  SUPPORT_FINANCE: "Support & Finance",
  UNSPECIFIED: "Not set",
  ELIGIBLE: "Eligible",
  CONTACTED: "Contacted",
  FOLLOW_UP: "Follow up",
  OPTED_OUT: "Opted out",
  NEEDS_INFORMATION: "Needs information",
  READY_FOR_REVIEW: "Ready for review",
  APPROVED_FOR_MEETING: "Approved for meeting",
  MEETING_COMPLETED: "Meeting completed",
  CHANGES_REQUESTED: "Changes requested",
  HANDED_TO_DEVELOPMENT: "Handed to development",
  NOT_STARTED: "Not started",
  READY_TO_SHARE: "Ready to share",
  SHARED: "Shared",
  LEAD_QUALIFIED: "Lead qualified",
  MEETING_BOOKED: "Meeting booked",
  MEETING_RESCHEDULED: "Meeting rescheduled",
  MEETING_CANCELLED: "Meeting cancelled",
  BRIEF_READY_FOR_REVIEW: "Brief ready for review",
  BRIEF_MISSING_INFO: "Brief missing information",
  MEETING_OUTCOME_RECORDED: "Meeting outcome recorded",
  HANDOVER_CREATED: "Developer handover",
  TASK_ASSIGNED: "Task assigned",
  TASK_DUE_SOON: "Task due soon",
  TASK_APPROVAL_REQUESTED: "Approval requested",
  CRITICAL_INCIDENT: "Critical incident",
  MAINTENANCE_DUE: "Maintenance due",
  MAINTENANCE_COMPLETED: "Maintenance completed",
  PAYMENT_FAILED: "Payment failed",
  INVOICE_OVERDUE: "Invoice overdue",
  SUBSCRIPTION_RENEWING: "Subscription renewing",
  TICKET_SLA_BREACH: "Ticket SLA breached",
  REFUND_REQUESTED: "Refund requested",
  ACCOUNT_UPDATED: "Account updated",
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  CRITICAL: "Critical",
  // Phase 2 — tickets
  NEW: "New",
  OPEN: "Open",
  WAITING_CLIENT: "Waiting for Client",
  WAITING_THIRD_PARTY: "Waiting for Third Party",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  EMAIL: "Email",
  MANUAL: "Manual",
  CUSTOMER_MESSAGE: "Customer message",
  REPLY: "Reply",
  INTERNAL_NOTE: "Internal note",
  DRAFT: "Draft",
  PENDING_SEND: "Sending",
  SENT_ACCEPTED: "Sent (accepted by Gmail)",
  FAILED: "Failed",
  UNCERTAIN: "Delivery uncertain",
  // Phase 2 — email matching & Gmail connection
  CONFIRMED: "Confirmed match",
  SUGGESTED: "Suggested match",
  NO_MATCH: "No match",
  NEEDS_REVIEW: "Needs review",
  INBOUND: "Inbound",
  OUTBOUND: "Outbound",
  NOT_CONFIGURED: "Not configured",
  DISCONNECTED: "Disconnected",
  AWAITING_AUTH: "Awaiting authorisation",
  AWAITING_AUTHORISATION: "Awaiting authorisation",
  CONNECTED: "Connected",
  SYNCING: "Syncing",
  REAUTH_REQUIRED: "Reauthorisation required",
  SYNCED: "Synced",
  INITIAL: "Initial",
  INCREMENTAL: "Incremental",
  RECOVERY: "Recovery",
  SCHEDULED: "Scheduled",
  SUCCESS: "Success",
  PARTIAL: "Partial",
  GMAIL: "Gmail",
  // Phase 3 — billing
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
  SENT: "Sent",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  ISSUED: "Issued",
  PARTIALLY_PAID: "Partially paid",
  PAID: "Paid",
  OVERDUE: "Overdue",
  VOID: "Void",
  PENDING: "Pending",
  VERIFIED: "Verified",
  REFUNDED: "Refunded",
  BANK_TRANSFER: "Bank transfer",
  CASH: "Cash",
  CARD_MANUAL: "Card (manual)",
  CHEQUE: "Cheque",
  PAST_DUE: "Past due",
  PAUSED: "Paused",
  ENDED: "Ended",
  ONE_OFF: "One-off",
  RENEWAL: "Renewal",
  CREATED: "Created",
  PLAN_CHANGED: "Plan changed",
  PRICE_CHANGED: "Price changed",
  STATUS_CHANGED: "Status changed",
  RENEWAL_INVOICED: "Renewal invoiced",
  RESUMED: "Resumed",
  NOTE: "Note",
  // Phase 4 — operations
  HEALTHY: "Healthy",
  DEGRADED: "Degraded",
  DOWN: "Down",
  UNKNOWN: "Unknown",
  DISABLED: "Disabled",
  SEV1: "SEV1 · Critical",
  SEV2: "SEV2 · High",
  SEV3: "SEV3 · Medium",
  SEV4: "SEV4 · Low",
  DETECTED: "Detected",
  IDENTIFIED: "Identified",
  MITIGATING: "Mitigating",
  MONITORING_RECOVERY: "Monitoring recovery",
  OBSERVATION: "Observation",
  REOPENED: "Reopened",
  TICKET_LINKED: "Ticket linked",
  TICKET_UNLINKED: "Ticket unlinked",
  WEEKLY: "Weekly",
  SKIPPED: "Skipped",
  ATTEMPTED: "Attempted",
  PASSED: "Passed",
  QUEUED: "Queued",
  BUILDING: "Building",
  DEPLOYING: "Deploying",
  SUCCESSFUL: "Successful",
  ROLLED_BACK: "Rolled back",
  RUNNING: "Running",
  PROCESSED: "Processed",
  SKIPPED_DUPLICATE: "Duplicate (skipped)",
  RECEIVED: "Received",
  VERCEL: "Vercel",
  NETLIFY: "Netlify",
  CLOUDFLARE_PAGES: "Cloudflare Pages",
  CLOUDFLARE: "Cloudflare",
  AWS: "AWS",
  GITHUB: "GitHub",
  DNS: "DNS",
  CONNECTION: "Connection",
  TIMEOUT: "Timeout",
  TLS: "TLS",
  HTTP_STATUS: "HTTP status",
  REDIRECT: "Redirect",
  BLOCKED_URL: "Blocked URL",
  AVAILABILITY: "Availability",
  FORMS: "Forms & contact",
  LINKS: "Links",
  SSL_DOMAIN: "SSL & domain",
  BACKUP: "Backups",
  SECURITY: "Security",
  PERFORMANCE: "Performance",
  UPDATES: "Updates",
  SUMMARY: "Summary",
  GENERAL: "General",
};

export function label(value?: string | null): string {
  if (!value) return "—";
  return LABELS[value] ?? value;
}

// ---------------------------------------------------------------------------
// Records (as returned by the API — dates are ISO strings over the wire)
// ---------------------------------------------------------------------------

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface ContactRecord {
  id: string;
  clientId: string;
  name: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ClientRecord {
  id: string;
  businessName: string;
  clientType: string;
  status: string;
  primaryContactName: string | null;
  email: string | null;
  phone: string | null;
  billingAddress: string | null;
  country: string;
  currency: string;
  timezone: string;
  notes: string | null;
  isSample: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Phase 5 — lead management
  leadSource?: string | null;
  outreachStatus?: string;
  followUpAt?: string | null;
  qualifiedAt?: string | null;
  assignedManagerId?: string | null;
  assignedManager?: Pick<UserRecord, "id" | "displayName"> | null;
  _count?: {
    websites: number;
    projects: number;
    tasks: number;
    documents: number;
  };
}

export interface DomainRecord {
  id: string;
  websiteId: string;
  domainName: string;
  registrar: string | null;
  renewalDate: string | null; // manually maintained
  autoRenew: boolean;
  // Phase 4 — real observations (null = not checked / unavailable)
  certNotAfter: string | null;
  certCheckedAt: string | null;
  certError: string | null;
  rdapExpiryDate: string | null;
  rdapCheckedAt: string | null;
  rdapError: string | null;
  lastCheckedAt: string | null;
}

export interface WebsiteRecord {
  id: string;
  clientId: string;
  name: string;
  primaryDomain: string | null;
  lifecycleStatus: string;
  environment: string;
  websiteType: string | null;
  framework: string | null;
  repositoryUrl: string | null;
  hostingProvider: string | null;
  productionUrl: string | null;
  stagingUrl: string | null;
  deploymentProjectRef: string | null;
  domainRenewalDate: string | null;
  sslExpiryDate: string | null;
  maintenanceCoverage: string;
  launchDate: string | null;
  technicalNotes: string | null;
  isSample: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  client?: Pick<ClientRecord, "id" | "businessName">;
  domains?: DomainRecord[];
  _count?: { tasks: number; projects: number; documents: number };
}

export interface MilestoneRecord {
  id: string;
  projectId: string;
  title: string;
  dueDate: string | null;
  completedAt: string | null;
  position: number;
}

export interface ProjectRecord {
  id: string;
  clientId: string;
  name: string;
  projectType: string;
  status: string;
  scope: string | null;
  agreedAmountMinor: number | null;
  currency: string;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  internalNotes: string | null;
  isSample: boolean;
  createdAt: string;
  updatedAt: string;
  assignedDeveloperId?: string | null;
  assignedDeveloper?: Pick<UserRecord, "id" | "displayName"> | null;
  client?: Pick<ClientRecord, "id" | "businessName">;
  websites?: Pick<WebsiteRecord, "id" | "name" | "primaryDomain">[];
  milestones?: MilestoneRecord[];
  _count?: { tasks: number; documents: number };
  progress?: number; // 0-100, derived from milestones/tasks
  allowedTransitions?: string[];
}

export interface TaskRecord {
  id: string;
  taskNumber?: number | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueAt: string | null;
  clientId: string | null;
  websiteId: string | null;
  projectId: string | null;
  assigneeId: string | null;
  createdById: string | null;
  completedAt: string | null;
  isSample: boolean;
  createdAt: string;
  updatedAt: string;
  client?: Pick<ClientRecord, "id" | "businessName"> | null;
  website?: Pick<WebsiteRecord, "id" | "name"> | null;
  project?: Pick<ProjectRecord, "id" | "name"> | null;
  assignee?: Pick<UserRecord, "id" | "displayName"> | null;
  createdBy?: Pick<UserRecord, "id" | "displayName"> | null;
  isOverdue?: boolean;
  // Phase 5 — developer task module (additive, optional)
  source?: string;
  estimatedMinutes?: number | null;
  subscriptionAllowanceIncluded?: boolean;
  scopeStatus?: string;
  escalationReason?: string | null;
  acceptanceCriteria?: string | null;
  testChecklist?: string | null; // JSON [{label, done}]
  approvalRequired?: boolean;
  releaseStatus?: string;
  evidenceNote?: string | null;
  evidenceDocumentId?: string | null;
  ticketId?: string | null;
  comments?: TaskCommentRecord[];
  allowedTransitions?: string[];
}

export interface TaskCommentRecord {
  id: string;
  taskId: string;
  authorId: string | null;
  authorName?: string | null;
  body: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Phase 5 — Client Demo Briefs, Meetings, Notifications
// ---------------------------------------------------------------------------

export interface BriefRecord {
  id: string;
  number: number;
  displayNumber: string; // BRF-0001
  clientId: string;
  projectId: string | null;
  meetingId: string | null;
  ownerUserId: string | null;
  title: string | null;
  businessName: string | null;
  businessType: string | null;
  location: string | null;
  contactPerson: string | null;
  existingWebsite: string | null;
  publicReferences: string | null;
  businessGoals: string | null;
  currentProblems: string | null;
  targetAudience: string | null;
  requestedPages: string | null;
  requestedFeatures: string | null;
  brandingInfo: string | null;
  competitorReferences: string | null;
  inspiration: string | null;
  budgetMinor: number | null;
  currency: string;
  budgetNote: string | null;
  deadline: string | null;
  recommendedPackage: string | null;
  proposedCarePlan: string | null;
  missingInformation: string | null;
  outstandingQuestions: string | null;
  demoUrl: string | null;
  previewStatus: string;
  improvement1: string | null;
  improvement2: string | null;
  improvement3: string | null;
  preparationNotes: string | null;
  founderFeedback: string | null;
  clientDecisions: string | null;
  approvedChanges: string | null;
  status: string;
  handedOverAt: string | null;
  handedToProjectId: string | null;
  createdAt: string;
  updatedAt: string;
  client?: Pick<ClientRecord, "id" | "businessName" | "status"> | null;
  owner?: Pick<UserRecord, "id" | "displayName"> | null;
  project?: Pick<ProjectRecord, "id" | "name"> | null;
  meeting?: { id: string; title: string; scheduledAt: string; status: string; timezone: string } | null;
  allowedTransitions?: string[];
}

export interface MeetingRecord {
  id: string;
  title: string;
  clientId: string;
  scheduledAt: string;
  durationMinutes: number;
  timezone: string;
  location: string | null;
  meetingLink: string | null;
  attendees: string | null; // JSON array
  agenda: string | null;
  status: string;
  cancelReason: string | null;
  outcome: string | null;
  outcomeRecordedAt: string | null;
  reminderSentAt: string | null;
  conflictConfirmed: boolean;
  createdAt: string;
  updatedAt: string;
  client?: Pick<ClientRecord, "id" | "businessName"> | null;
  createdBy?: Pick<UserRecord, "id" | "displayName"> | null;
  briefs?: { id: string; displayNumber: string }[];
}

export interface NotificationRecord {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface DocumentRecord {
  id: string;
  clientId: string | null;
  websiteId: string | null;
  projectId: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  note: string | null;
  createdAt: string;
  client?: Pick<ClientRecord, "id" | "businessName"> | null;
  website?: Pick<WebsiteRecord, "id" | "name"> | null;
  project?: Pick<ProjectRecord, "id" | "name"> | null;
  uploadedBy?: Pick<UserRecord, "id" | "displayName"> | null;
}

export interface ActivityRecord {
  id: string;
  kind: string;
  action: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  summary: string;
  actorId: string | null;
  actorName: string;
  metadata: string | null;
  clientId: string | null;
  websiteId: string | null;
  projectId: string | null;
  createdAt: string;
}

export interface AgencySettings {
  agencyName: string;
  ownerName: string;
  ownerEmail: string;
  defaultCurrency: string;
  timezone: string;
  notifyRenewals: boolean;
  notifyOverdueTasks: boolean;
  notifyNewEnquiries: boolean;
  PlannedModules?: never;
}

// ---------------------------------------------------------------------------
// API envelope + list contracts
// ---------------------------------------------------------------------------

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface SearchResults {
  clients: { id: string; businessName: string; status: string }[];
  contacts: { id: string; clientId: string; name: string; email: string | null; clientName: string }[];
  websites: { id: string; name: string; primaryDomain: string | null; clientName: string }[];
  projects: { id: string; name: string; status: string; clientName: string }[];
  tasks: { id: string; title: string; status: string }[];
  tickets: { id: string; number: number; subject: string; status: string }[];
}

export interface DashboardData {
  kpis: {
    totalClients: number;
    activeClients: number;
    liveWebsites: number;
    websitesInDevelopment: number;
    activeProjects: number;
    overdueTasks: number;
    tasksDueToday: number;
    openTickets: number;
    upcomingRenewals: number;
    /** Total outstanding balance across unpaid issued invoices (minor units). */
    outstandingInvoices: number | null;
    /** MRR from ACTIVE/PAST_DUE subscriptions (minor units, normalised monthly). */
    recurringRevenue: number | null;
    /** Added in Phase 3 — optional so older consumers stay compatible. */
    billing?: {
      overdueInvoices: number;
      paymentsReceivedMinor: number;
      activeSubscriptions: number;
      quotesAwaiting: number;
      upcomingSubscriptionRenewals: number;
    };
    /** Added in Phase 4 — operations metrics (optional, failure-isolated). */
    operations?: OperationsKpis;
    /** Added in Phase 5 — founder pipeline/approval KPIs (optional). */
    newLeads30d?: number;
    qualifiedLeads?: number;
    upcomingMeetings?: number;
    briefsAwaitingReview?: number;
    releasesAwaitingApproval?: number;
    maintenanceCompleted30d?: number;
  };
  priorityQueue: {
    id: string;
    kind: "TASK_OVERDUE" | "TASK_TODAY" | "PROJECT_DUE" | "DOMAIN_RENEWAL" | "SSL_EXPIRY" | "MILESTONE_DUE";
    title: string;
    detail: string;
    entityType: string;
    entityId: string;
    severity: "CRITICAL" | "HIGH" | "NORMAL";
  }[];
  upcomingDeadlines: {
    id: string;
    kind: "TASK" | "PROJECT" | "MILESTONE" | "DOMAIN";
    title: string;
    date: string;
    entityType: string;
    entityId: string;
  }[];
  recentActivity: ActivityRecord[];
  /** Added in Phase 3 — upcoming subscription renewals for the dashboard card. */
  billingRenewals?: BillingRenewalItem[];
  /** Added in Phase 4 — operations alerts card data. */
  operations?: OperationsDashboardData;
  /** Added in Phase 5 — role-specific blocks. Present per the caller's role. */
  manager?: ManagerDashboardData;
  developer?: DeveloperDashboardData;
  finance?: FinanceDashboardData;
  /** "OWNER" | "CLIENT_MANAGER" | ... — lets the UI render the right dashboard. */
  role: string;
}

export interface ManagerDashboardData {
  kpis: {
    newEnquiries30d: number;
    assignedLeads: number;
    followUpsDue: number;
    upcomingMeetings: number;
    incompleteBriefs: number;
    briefsAwaitingReview: number;
    qualifiedLeads: number;
  };
  followUpsDue: { id: string; businessName: string; followUpAt: string | null; outreachStatus: string; status: string }[];
  upcomingMeetings: { id: string; title: string; scheduledAt: string; timezone: string; clientName: string; status: string }[];
  briefsNeedingWork: { id: string; displayNumber: string; clientName: string | null; status: string; missingInformation: string | null }[];
  recentMeetingOutcomes: { id: string; title: string; clientName: string; outcome: string | null; scheduledAt: string }[];
}

export interface DeveloperDashboardData {
  kpis: {
    assignedOpenTasks: number;
    inProgress: number;
    blocked: number;
    dueThisWeek: number;
    overdue: number;
    maintenanceDue: number;
    releasesAwaitingApproval: number;
    assignedOpenIncidents: number;
  };
  myTasksTop: { id: string; displayNumber: string | null; title: string; status: string; priority: string; dueAt: string | null; clientName: string | null }[];
  blockedTasks: { id: string; displayNumber: string | null; title: string; escalationReason: string | null; clientName: string | null }[];
  maintenanceDue: { id: string; websiteName: string; scheduledDate: string; status: string }[];
  releasesAwaitingApproval: { id: string; displayNumber: string | null; title: string; status: string; clientName: string | null }[];
  openIncidents: { id: string; displayNumber: string; title: string; severity: string; status: string }[];
}

export interface FinanceDashboardData {
  kpis: {
    openTickets: number;
    ticketsAwaitingResponse: number;
    slaBreached: number;
    failedPayments: number;
    overdueInvoices: number;
    outstandingMinor: number;
    reconciliationQueue: number;
    upcomingRenewals30d: number;
  };
  ticketsByPriority: { critical: number; high: number; normal: number; low: number };
  ticketsAwaitingResponseTop: { id: string; displayNumber: string; subject: string; priority: string; awaitingReply: boolean; createdAt: string; clientName: string }[];
  reconciliationQueueTop: { id: string; displayRef: string; invoiceNumber: string | null; clientName: string; amountMinor: number; currency: string; method: string; createdAt: string }[];
  failedPaymentsTop: { id: string; invoiceNumber: string | null; clientName: string; amountMinor: number; currency: string; createdAt: string }[];
  overdueInvoicesTop: { id: string; displayNumber: string; clientName: string; outstandingMinor: number; currency: string; dueDate: string | null }[];
  upcomingRenewals: BillingRenewalItem[];
}

export interface OperationsKpis {
  healthyWebsites: number;
  degradedWebsites: number;
  downWebsites: number;
  activeIncidents: number;
  incidentsBySeverity: { sev1: number; sev2: number; sev3: number; sev4: number };
  domainsExpiringSoon: number; // renewal within 30 days (manual + RDAP-verified)
  certsExpiringSoon: number; // TLS notAfter within 30 days
  maintenanceDueSoon: number; // PLANNED runs within 7 days
  failedJobs24h: number;
  recentDeploymentFailures: number; // FAILED deployments in last 7 days
}

export interface OperationsDashboardData {
  downWebsitesTop: { id: string; name: string; clientName: string | null; health: string; lastError: string | null; since: string | null }[];
  activeIncidentsTop: { id: string; displayNumber: string; title: string; severity: string; status: string; detectedAt: string }[];
  maintenanceDueTop: { id: string; websiteName: string; scheduledDate: string; status: string }[];
  failedJobsTop: { id: string; jobKey: string; status: string; finishedAt: string | null; lastError: string | null }[];
}

export interface BillingRenewalItem {
  subscriptionId: string;
  clientName: string;
  websiteName: string | null;
  planName: string | null;
  nextRenewalDate: string;
  amountMinor: number;
  currency: string;
  billingInterval: string;
  status: string;
}

export interface SettingsData {
  agencyName: string;
  defaultCurrency: string;
  timezone: string;
  notifyRenewals: boolean;
  notifyOverdueTasks: boolean;
  notifyNewEnquiries: boolean;
  sampleDataLoaded: boolean;
}

// ---------------------------------------------------------------------------
// Phase 2 — records (support + Gmail)
// ---------------------------------------------------------------------------

export interface EmailAttachmentMeta {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface EmailAccountStatusRecord {
  state: (typeof GMAIL_CONNECTION_STATES)[number];
  configured: boolean; // OAuth client credentials present in env
  emailAddress: string | null;
  scope: string | null;
  /** Exact redirect URI that must be registered in Google Cloud Console. */
  redirectUri: string;
  lastSyncStartedAt: string | null;
  lastSyncCompletedAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  lastAuthError: string | null;
  messagesProcessed: number;
  historyId: string | null;
  tokenLastRefreshedAt: string | null;
}

export interface GmailSyncRunRecord {
  id: string;
  kind: string;
  trigger: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  messagesFetched: number;
  messagesNew: number;
  messagesSkipped: number;
  error: string | null;
}

export interface EmailMessageRecord {
  id: string;
  emailAccountId: string;
  providerMessageId: string;
  providerThreadId: string | null;
  direction: string;
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  ccEmails: string[];
  subject: string | null;
  snippet: string | null;
  sentAt: string | null;
  hasAttachments: boolean;
  attachments: EmailAttachmentMeta[];
  syncStatus: string;
  matchStatus: string;
  suggestedClientId: string | null;
  clientId: string | null;
  client?: Pick<ClientRecord, "id" | "businessName"> | null;
  websiteId: string | null;
  website?: Pick<WebsiteRecord, "id" | "name"> | null;
  ticketId: string | null;
  ticket?: { id: string; number: number; subject: string; status: string } | null;
  matchDecidedAt: string | null;
  createdAt: string;
}

export interface EmailMessageDetailRecord extends EmailMessageRecord {
  bodyText: string | null;
  bodyHtml: string | null; // raw stored HTML (use sanitisedHtml for rendering)
  sanitisedHtml: string | null; // server-sanitised safe subset
  threadMessages: {
    id: string;
    direction: string;
    fromEmail: string;
    fromName: string | null;
    subject: string | null;
    sentAt: string | null;
  }[];
}

export interface TicketRecord {
  id: string;
  number: number; // render as TKT-0001
  subject: string;
  description: string | null;
  clientId: string;
  websiteId: string | null;
  projectId: string | null;
  status: string;
  priority: string;
  source: string;
  assigneeId: string | null;
  createdById: string | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  resolutionSummary: string | null;
  awaitingReply: boolean;
  lastActivityAt: string;
  incidentId: string | null;
  createdAt: string;
  updatedAt: string;
  client?: Pick<ClientRecord, "id" | "businessName"> | null;
  website?: Pick<WebsiteRecord, "id" | "name"> | null;
  project?: Pick<ProjectRecord, "id" | "name"> | null;
  assignee?: Pick<UserRecord, "id" | "displayName"> | null;
  createdBy?: Pick<UserRecord, "id" | "displayName"> | null;
  _count?: { messages: number; tasks: number };
}

export interface TicketMessageRecord {
  id: string;
  ticketId: string;
  kind: string; // CUSTOMER_MESSAGE | REPLY | INTERNAL_NOTE
  authorType: string; // CUSTOMER | OPERATOR | SYSTEM
  author?: Pick<UserRecord, "id" | "displayName"> | null;
  bodyText: string;
  toEmails: string[];
  ccEmails: string[];
  subject: string | null;
  emailMessageId: string | null;
  providerMessageId: string | null;
  deliveryStatus: string | null; // DRAFT | PENDING_SEND | SENT_ACCEPTED | FAILED | UNCERTAIN (REPLY only)
  deliveryError: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface TicketDetailData {
  ticket: TicketRecord;
  messages: TicketMessageRecord[];
  tasks: TaskRecord[];
  activity: ActivityRecord[];
  allowedTransitions: string[];
}

// ---------------------------------------------------------------------------
// Phase 3 — records (billing)
// ---------------------------------------------------------------------------

/** Raw line input as submitted by the client (totals are recomputed server-side). */
export interface LineItemInput {
  description: string;
  quantity: number;
  unitPriceMinor: number;
  discountMinor: number;
  taxRateBps: number;
}

export interface BillingLineRecord {
  id: string;
  position: number;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  discountMinor: number;
  taxRateBps: number;
  netMinor: number;
  taxMinor: number;
  grossMinor: number;
}

export interface ServicePlanRecord {
  id: string;
  name: string;
  description: string | null;
  billingInterval: string;
  priceMinor: number;
  currency: string;
  allowanceHours: number | null;
  includedServices: string[];
  terms: string | null;
  autoRenew: boolean;
  isActive: boolean;
  isSample: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { subscriptions: number };
}

export interface QuoteRecord {
  id: string;
  number: number;
  displayNumber: string; // prefix + zero-padded number (prefix from settings)
  clientId: string;
  projectId: string | null;
  websiteId: string | null;
  status: string;
  issueDate: string;
  expiryDate: string | null;
  currency: string;
  taxInclusive: boolean;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  scope: string | null;
  terms: string | null;
  acceptedSnapshot: string | null; // JSON snapshot taken at acceptance
  acceptedAt: string | null;
  acceptedByName: string | null;
  sentAt: string | null;
  rejectedAt: string | null;
  cancelledAt: string | null;
  isSample: boolean;
  createdAt: string;
  updatedAt: string;
  client?: Pick<ClientRecord, "id" | "businessName"> | null;
  project?: Pick<ProjectRecord, "id" | "name"> | null;
  website?: Pick<WebsiteRecord, "id" | "name"> | null;
  lines?: BillingLineRecord[];
  _count?: { invoices: number };
}

export interface QuoteDetailData {
  quote: QuoteRecord;
  lines: BillingLineRecord[];
  activity: ActivityRecord[];
  invoices: { id: string; displayNumber: string; status: string; totalMinor: number; currency: string }[];
  allowedTransitions: string[];
  acceptedSnapshot: {
    lines: LineItemInput[];
    totals: { subtotalMinor: number; taxMinor: number; totalMinor: number };
    acceptedAt: string;
    acceptedByName: string | null;
  } | null;
}

export interface InvoiceRecord {
  id: string;
  number: number;
  displayNumber: string;
  clientId: string;
  quoteId: string | null;
  projectId: string | null;
  websiteId: string | null;
  subscriptionId: string | null;
  kind: string; // ONE_OFF | RENEWAL
  status: string;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  taxInclusive: boolean;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  /** Verified-effective paid amount (server-maintained cache; never client input). */
  paidMinor: number;
  /** Allocations from PENDING payments — informational only, does not reduce the balance. */
  pendingMinor: number;
  /** total − verified-effective allocations (0 for DRAFT/VOID/PAID). */
  outstandingMinor: number;
  isOverdue: boolean;
  notes: string | null;
  terms: string | null;
  issuedAt: string | null;
  paidAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  isSample: boolean;
  createdAt: string;
  updatedAt: string;
  client?: Pick<ClientRecord, "id" | "businessName"> | null;
  quote?: { id: string; displayNumber: string; status: string } | null;
  project?: Pick<ProjectRecord, "id" | "name"> | null;
  website?: Pick<WebsiteRecord, "id" | "name"> | null;
  subscription?: { id: string; planName: string | null; status: string } | null;
  lines?: BillingLineRecord[];
  _count?: { allocations: number };
}

export interface InvoicePaymentRow {
  allocationId: string;
  paymentId: string;
  displayNumber: string;
  status: string;
  method: string;
  paidAt: string;
  allocatedMinor: number;
  effectiveMinor: number; // after FIFO refund share
}

export interface InvoiceDetailData {
  invoice: InvoiceRecord;
  lines: BillingLineRecord[];
  payments: InvoicePaymentRow[];
  activity: ActivityRecord[];
  allowedTransitions: string[];
}

export interface PaymentAllocationRecord {
  id: string;
  paymentId: string;
  invoiceId: string;
  invoiceDisplayNumber: string;
  amountMinor: number;
  effectiveMinor: number; // after FIFO refund share
  createdAt: string;
}

export interface PaymentRecord {
  id: string;
  reference: number;
  displayNumber: string;
  clientId: string;
  amountMinor: number;
  currency: string;
  method: string;
  status: string; // PENDING | VERIFIED | FAILED | REFUNDED
  paidAt: string;
  referenceNum: string | null;
  notes: string | null;
  refundMinor: number;
  refundReason: string | null;
  refundedAt: string | null;
  gateway: string | null;
  verifiedAt: string | null;
  isSample: boolean;
  createdAt: string;
  updatedAt: string;
  client?: Pick<ClientRecord, "id" | "businessName"> | null;
  createdBy?: Pick<UserRecord, "id" | "displayName"> | null;
  verifiedBy?: Pick<UserRecord, "id" | "displayName"> | null;
  allocations: PaymentAllocationRecord[];
  /** amount − refund (the verified-effective amount once VERIFIED). */
  effectiveMinor: number;
}

export interface SubscriptionEventRecord {
  id: string;
  subscriptionId: string;
  kind: string;
  summary: string;
  metadata: string | null;
  actorId: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface SubscriptionRecord {
  id: string;
  clientId: string;
  websiteId: string | null;
  planId: string | null;
  planName: string | null;
  agreedPriceMinor: number;
  currency: string;
  billingInterval: string;
  taxRateBps: number;
  status: string;
  startDate: string;
  trialEndDate: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  nextRenewalDate: string | null;
  autoInvoice: boolean;
  autoRenew: boolean;
  cancelAtPeriodEnd: boolean;
  pausedAt: string | null;
  cancelledAt: string | null;
  endedAt: string | null;
  internalNotes: string | null;
  isSample: boolean;
  createdAt: string;
  updatedAt: string;
  client?: Pick<ClientRecord, "id" | "businessName"> | null;
  website?: Pick<WebsiteRecord, "id" | "name"> | null;
  plan?: Pick<ServicePlanRecord, "id" | "name"> | null;
  _count?: { invoices: number };
  /** agreedPriceMinor normalised to a monthly figure (server-computed). */
  monthlyEquivalentMinor: number;
}

export interface SubscriptionDetailData {
  subscription: SubscriptionRecord;
  events: SubscriptionEventRecord[];
  invoices: InvoiceRecord[];
  allowedTransitions: string[];
}

/** Metric definitions — the API documents exactly how each figure is derived. */
export interface BillingMetricDefinition {
  key: string;
  label: string;
  definition: string;
}

export interface BillingSummaryData {
  outstandingMinor: number;
  overdueCount: number;
  overdueMinor: number;
  collectedMinor: number; // verified payments, net of refunds, all time
  collectedThisMonthMinor: number;
  pendingPaymentsMinor: number; // PENDING payments awaiting verification
  pendingPaymentsCount: number;
  invoicedMinor: number; // totals of issued-ish (non-draft, non-void) invoices
  mrrMinor: number; // ACTIVE + PAST_DUE subscriptions, normalised monthly
  activeSubscriptions: number;
  pastDueSubscriptions: number;
  quotesAwaiting: number; // status SENT
  upcomingRenewals: BillingRenewalItem[];
  recentPayments: PaymentRecord[];
  definitions: BillingMetricDefinition[];
  gateway: { provider: string | null; configured: boolean; message: string };
  lastJobRunAt: string | null;
}

export interface BillingSettingsRecord {
  businessName: string;
  businessAddress: string;
  businessEmail: string;
  businessPhone: string;
  vatNumber: string;
  invoicePrefix: string;
  quotePrefix: string;
  paymentRefPrefix: string;
  defaultTaxRateBps: number;
  taxInclusiveDefault: boolean;
  defaultPaymentTermsDays: number;
  defaultQuoteExpiryDays: number;
  defaultInvoiceTerms: string;
  defaultQuoteTerms: string;
  defaultInvoiceNotes: string;
}

export interface BillingJobTaskResult {
  task: string; // EXPIRE_QUOTES | FLAG_OVERDUE | SUBSCRIPTION_PAST_DUE | RENEWAL_INVOICES
  changed: number;
  details: string[];
}

export interface BillingJobRunData {
  ranAt: string;
  trigger: string;
  results: BillingJobTaskResult[];
}

export interface GatewayStatusData {
  provider: string | null;
  configured: boolean;
  message: string;
}

// ---------------------------------------------------------------------------
// Phase 4 — records (operations)
// ---------------------------------------------------------------------------

export interface MonitorConfigRecord {
  id: string;
  websiteId: string;
  enabled: boolean;
  url: string | null;
  acceptedStatuses: string;
  intervalMinutes: number;
  timeoutSeconds: number;
  failureThreshold: number;
  recoveryThreshold: number;
  degradedAfterMs: number;
  currentHealth: string; // UNKNOWN | HEALTHY | DEGRADED | DOWN
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastCheckAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastErrorSummary: string | null;
  createdAt: string;
  updatedAt: string;
  website?: Pick<WebsiteRecord, "id" | "name" | "productionUrl" | "primaryDomain"> & {
    client?: Pick<ClientRecord, "id" | "businessName"> | null;
  } | null;
}

export interface HealthCheckRecord {
  id: string;
  websiteId: string;
  checkedAt: string;
  success: boolean;
  statusCode: number | null;
  durationMs: number | null;
  slow: boolean;
  trigger: string;
  errorCategory: string | null;
  errorSummary: string | null;
  website?: { id: string; name: string; clientName?: string | null } | null;
}

export interface IncidentWebsiteRecord {
  id: string;
  incidentId: string;
  websiteId: string;
  firstObservedAt: string;
  lastObservedAt: string | null;
  recoveredAt: string | null;
  website?: Pick<WebsiteRecord, "id" | "name"> & { clientName?: string | null } | null;
}

export interface IncidentEventRecord {
  id: string;
  incidentId: string;
  kind: string;
  message: string;
  metadata: string | null;
  actorId: string | null;
  actorName: string;
  createdAt: string;
}

export interface IncidentRecord {
  id: string;
  number: number; // rendered as INC-0001
  title: string;
  description: string | null;
  severity: string;
  status: string;
  detectionSource: string;
  detectedAt: string;
  assignedToId: string | null;
  diagnosis: string | null;
  mitigation: string | null;
  resolution: string | null;
  recoveryVerifiedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  autoCreated: boolean;
  createdAt: string;
  updatedAt: string;
  assignedTo?: Pick<UserRecord, "id" | "displayName"> | null;
  createdBy?: Pick<UserRecord, "id" | "displayName"> | null;
  websites?: IncidentWebsiteRecord[];
  tickets?: { id: string; number: number; subject: string; status: string }[];
  _count?: { tickets: number; events: number };
}

export interface IncidentDetailData {
  incident: IncidentRecord;
  websites: IncidentWebsiteRecord[];
  events: IncidentEventRecord[];
  tickets: TicketRecord[];
  allowedTransitions: string[];
  recentChecks: HealthCheckRecord[]; // latest checks for affected websites (evidence)
}

export interface MaintenanceScheduleRecord {
  id: string;
  websiteId: string;
  planId: string | null;
  name: string;
  frequency: string;
  nextDueDate: string;
  assignedToId: string | null;
  checklistTemplate: string[]; // parsed from JSON
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  website?: Pick<WebsiteRecord, "id" | "name"> & { clientName?: string | null } | null;
  plan?: Pick<ServicePlanRecord, "id" | "name"> | null;
  assignedTo?: Pick<UserRecord, "id" | "displayName"> | null;
  _count?: { runs: number };
}

export interface MaintenanceChecklistItemRecord {
  id: string;
  runId: string;
  position: number;
  label: string;
  category: string;
  result: string;
  notes: string | null;
  evidenceDocumentId: string | null;
  evidenceDocument?: { id: string; fileName: string } | null;
}

export interface MaintenanceRunRecord {
  id: string;
  scheduleId: string | null;
  websiteId: string;
  scheduledDate: string;
  status: string;
  assignedToId: string | null;
  workNotes: string | null;
  timeSpentMinutes: number | null;
  completedAt: string | null;
  nextScheduledDate: string | null;
  remindedAt: string | null;
  createdAt: string;
  updatedAt: string;
  schedule?: { id: string; name: string } | null;
  website?: Pick<WebsiteRecord, "id" | "name"> & { clientName?: string | null } | null;
  assignedTo?: Pick<UserRecord, "id" | "displayName"> | null;
  items?: MaintenanceChecklistItemRecord[];
  _count?: { items: number };
}

export interface MaintenanceRunDetailData {
  run: MaintenanceRunRecord;
  items: MaintenanceChecklistItemRecord[];
  allowedTransitions: string[];
  documents: { id: string; fileName: string }[]; // attachable evidence for this website
}

export interface DeploymentRecord {
  id: string;
  websiteId: string;
  projectId: string | null;
  environment: string;
  provider: string | null;
  repositoryRef: string | null;
  commitSha: string | null;
  deploymentRef: string | null;
  initiatedById: string | null;
  startedAt: string;
  completedAt: string | null;
  status: string;
  buildUrl: string | null;
  errorSummary: string | null;
  postDeploymentHealth: string | null;
  postDeploymentNote: string | null;
  rollbackOfId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  website?: Pick<WebsiteRecord, "id" | "name"> & { clientName?: string | null } | null;
  project?: Pick<ProjectRecord, "id" | "name"> | null;
  initiatedBy?: Pick<UserRecord, "id" | "displayName"> | null;
  rollbackOf?: { id: string; displayRef: string } | null;
}

export interface ProviderConnectionRecord {
  id: string;
  provider: string;
  name: string;
  status: string;
  metadata: Record<string, unknown> | null; // parsed non-secret JSON
  lastCheckedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  // NOTE: `config` (encrypted credentials) is intentionally never returned.
}

export interface BackgroundJobRunRecord {
  id: string;
  jobKey: string;
  trigger: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  attempts: number;
  lastError: string | null;
  results: Record<string, unknown> | null; // parsed JSON summary
}

export interface WebhookEventRecord {
  id: string;
  provider: string;
  eventId: string;
  eventType: string | null;
  status: string;
  payloadSummary: string | null;
  error: string | null;
  receivedAt: string;
  processedAt: string | null;
}

export interface MonitoringSummaryData {
  websitesMonitored: number;
  healthy: number;
  degraded: number;
  down: number;
  unknown: number;
  disabled: number; // websites without monitoring or with monitoring disabled
  activeIncidents: number;
  openIncidentsBySeverity: { sev1: number; sev2: number; sev3: number; sev4: number };
  checksToday: number;
  failuresToday: number;
  domainsExpiringSoon: { id: string; domainName: string; websiteId: string; websiteName: string; renewalDate: string | null; renewalSource: "MANUAL" | "RDAP"; rdapExpiryDate: string | null; certNotAfter: string | null; daysUntilRenewal: number | null }[];
  certsExpiringSoon: { id: string; domainName: string; websiteId: string; websiteName: string; certNotAfter: string; daysUntilExpiry: number }[];
  schedulerRunning: boolean;
  lastHealthJobRun: string | null;
  lastDomainJobRun: string | null;
}

export interface IntegrationsStatusData {
  github: {
    tokenConfigured: boolean; // GITHUB_TOKEN env present
    webhookSecretConfigured: boolean; // GITHUB_WEBHOOK_SECRET env present
    message: string;
  };
  connections: ProviderConnectionRecord[];
  recentWebhookEvents: WebhookEventRecord[];
  providerSupport: { provider: string; implemented: boolean; capabilities: string[] }[];
}

/** Monitoring websites list row — honest about websites WITHOUT a config row. */
export interface MonitorListRow {
  website: {
    id: string;
    name: string;
    productionUrl: string | null;
    primaryDomain: string | null;
    lifecycleStatus: string;
    clientName: string | null;
  };
  config: MonitorConfigRecord | null;
  activeIncidentCount: number;
}

/** Domain monitoring list (all domains, soonest expiry first). */
export interface MonitoringDomainsData {
  items: {
    id: string;
    websiteId: string;
    websiteName: string;
    clientName: string | null;
    domainName: string;
    registrar: string | null;
    renewalDate: string | null; // always manually maintained
    rdapExpiryDate: string | null; // authoritative when the registry publishes RDAP
    rdapCheckedAt: string | null;
    rdapError: string | null;
    autoRenew: boolean;
    certNotAfter: string | null;
    certCheckedAt: string | null;
    certError: string | null;
    lastCheckedAt: string | null;
    daysUntilRenewal: number | null;
    daysUntilCertExpiry: number | null;
  }[];
}

/** Result envelope of POST /api/jobs/run. */
export interface JobRunOutcome {
  jobKey: string;
  trigger: string;
  status: string;
  runId: string;
  results: Record<string, unknown> | null;
}

export interface CheckRunOutcomeRow {
  websiteId: string;
  websiteName: string;
  ok: boolean;
  statusCode: number | null;
  durationMs: number | null;
  health: string;
  errorSummary: string | null;
  skipped?: string;
}

export interface DomainCheckOutcomeRow {
  domainId: string;
  domainName: string;
  certOk: boolean;
  certNotAfter: string | null;
  rdapOk: boolean;
  rdapExpiryDate: string | null;
  errors: string[];
}

// ---------------------------------------------------------------------------
// API client helpers (frontend)
// ---------------------------------------------------------------------------

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; issues?: { path: string; message: string }[] } };

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });
  const json = (await res.json()) as ApiResult<T>;
  if (!json.ok) {
    const err = new Error(json.error.message || "Request failed") as Error & {
      issues?: { path: string; message: string }[];
      code?: string;
    };
    err.issues = json.error.issues;
    err.code = json.error.code;
    throw err;
  }
  return json.data;
}
