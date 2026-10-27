"use client";

/**
 * AgencyOS — status badge with the shared tone mapping (spec §4).
 * Tone is derived from the raw enum value, the label from label().
 */
import { label } from "@/lib/types";
import { cn } from "@/lib/utils";

type Tone = "success" | "destructive" | "warning" | "accent" | "neutral";

const VALUE_TONES: Record<string, Tone> = {
  // success (emerald)
  ACTIVE: "success",
  LIVE: "success",
  COMPLETED: "success",
  RESOLVED: "success",
  CONFIRMED: "success",
  SENT_ACCEPTED: "success",
  CONNECTED: "success",
  SUCCESS: "success",
  // destructive
  CRITICAL: "destructive",
  SUSPENDED: "destructive",
  CANCELLED: "destructive",
  FAILED: "destructive",
  REAUTH_REQUIRED: "destructive",
  ERROR: "destructive",
  // warning (amber)
  PLANNED: "warning",
  STAGING: "warning",
  PROSPECT: "warning",
  QUOTED: "warning",
  CLIENT_REVIEW: "warning",
  REVISIONS: "warning",
  AWAITING_CLIENT: "warning",
  ON_HOLD: "warning",
  WAITING: "warning",
  IN_PROGRESS: "warning",
  HIGH: "warning",
  OPEN: "warning",
  WAITING_CLIENT: "warning",
  WAITING_THIRD_PARTY: "warning",
  SUGGESTED: "warning",
  NEEDS_REVIEW: "warning",
  UNCERTAIN: "warning",
  AWAITING_AUTH: "warning",
  AWAITING_AUTHORISATION: "warning",
  PARTIAL: "warning",
  // accent (burgundy)
  IN_DEVELOPMENT: "accent",
  DEPOSIT_PAID: "accent",
  READY_TO_LAUNCH: "accent",
  NEW: "accent",
  SYNCING: "accent",
  PENDING_SEND: "accent",
  // Phase 3 — billing
  ISSUED: "accent",
  ONE_OFF: "accent",
  VERIFIED: "success",
  ACCEPTED: "success",
  PAID: "success",
  SENT: "accent",
  PENDING: "warning",
  PARTIALLY_PAID: "warning",
  OVERDUE: "destructive",
  VOID: "neutral",
  REJECTED: "destructive",
  EXPIRED: "neutral",
  PAST_DUE: "destructive",
  PAUSED: "warning",
  ENDED: "neutral",
  REFUNDED: "neutral",
  // Phase 4 — operations
  HEALTHY: "success",
  PASSED: "success",
  SUCCESSFUL: "success",
  PROCESSED: "success",
  DOWN: "destructive",
  SEV1: "destructive",
  DETECTED: "destructive",
  DEGRADED: "warning",
  SEV2: "warning",
  INVESTIGATING: "warning",
  IDENTIFIED: "warning",
  ATTEMPTED: "warning",
  ROLLED_BACK: "warning",
  SEV3: "accent",
  MITIGATING: "accent",
  MONITORING_RECOVERY: "accent",
  BUILDING: "accent",
  DEPLOYING: "accent",
  RECEIVED: "accent",
  RUNNING: "accent",
  QUEUED: "accent",
  SEV4: "neutral",
  SKIPPED: "neutral",
  NOT_APPLICABLE: "neutral",
  DISABLED: "neutral",
  UNKNOWN: "neutral",
  // TODO / LOW / NORMAL / NONE / RETIRED / INACTIVE / CLOSED / DISCONNECTED /
  // NOT_CONFIGURED / NO_MATCH / DRAFT / SYNCED / INCREMENTAL / INITIAL /
  // RECOVERY / MANUAL / SCHEDULED / MONTHLY / QUARTERLY / YEARLY /
  // SKIPPED_DUPLICATE / WEBSITE_HEALTH_CHECKS (job keys use local labels) +
  // unknown -> neutral
};

const TONE_CLASSES: Record<Tone, { badge: string; dot: string }> = {
  success: {
    badge: "border-success/30 bg-success/10 text-success",
    dot: "bg-success",
  },
  destructive: {
    badge: "border-destructive/30 bg-destructive/10 text-destructive",
    dot: "bg-destructive",
  },
  warning: {
    badge: "border-warning/40 bg-warning/15 text-warning-foreground",
    dot: "bg-warning",
  },
  accent: {
    badge: "border-primary/25 bg-primary/10 text-primary",
    dot: "bg-primary",
  },
  neutral: {
    badge: "border-border bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/50",
  },
};

export function StatusBadge({
  value,
  className,
}: {
  value?: string | null;
  className?: string;
}) {
  const tone = (value && VALUE_TONES[value]) || "neutral";
  const classes = TONE_CLASSES[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
        classes.badge,
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", classes.dot)} />
      {label(value)}
    </span>
  );
}
