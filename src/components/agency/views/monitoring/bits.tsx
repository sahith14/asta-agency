"use client";

/**
 * AgencyOS — shared monitoring UI bits (Phase 4, task 4-b).
 *
 * Local label maps for job keys (types.ts is frozen; job keys are not in the
 * global LABELS), check-result badges, duration formatting and the shared
 * "run a job" outcome toast summariser used by every Run-now button.
 */
import { toast } from "sonner";
import { CheckCircle2, MinusCircle, XCircle } from "lucide-react";
import { label, type JobRunOutcome } from "@/lib/types";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Job keys (not part of the frozen global LABELS)
// ---------------------------------------------------------------------------

export const JOB_KEY_LABELS: Record<string, string> = {
  WEBSITE_HEALTH_CHECKS: "Website health checks",
  DOMAIN_SSL_CHECKS: "Domain & SSL checks",
  MAINTENANCE_REMINDERS: "Maintenance reminders",
  DEPLOYMENT_RECONCILIATION: "Deployment reconciliation",
  BILLING_TASKS: "Billing tasks",
};

export function jobKeyLabel(jobKey: string | null | undefined): string {
  if (!jobKey) return "—";
  return JOB_KEY_LABELS[jobKey] ?? label(jobKey);
}

// ---------------------------------------------------------------------------
// Health check result badge (record has `success` boolean, not an enum)
// ---------------------------------------------------------------------------

export function CheckResultBadge({
  success,
  errorCategory,
  className,
}: {
  success: boolean;
  errorCategory?: string | null;
  className?: string;
}) {
  const tone = success
    ? "border-success/30 bg-success/10 text-success"
    : "border-destructive/30 bg-destructive/10 text-destructive";
  const dot = success ? "bg-success" : "bg-destructive";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
        tone,
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", dot)} />
      {success ? "Passed" : errorCategory ? `Failed · ${label(errorCategory)}` : "Failed"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Duration helpers
// ---------------------------------------------------------------------------

/** Milliseconds -> compact human string ("840 ms", "2.4 s", "1 m 03 s"). */
export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes} m ${String(seconds).padStart(2, "0")} s`;
}

/** startedAt -> finishedAt wall-clock duration ("2.4 s", "—" when unfinished). */
export function formatRunDuration(
  startedAt: string | null | undefined,
  finishedAt: string | null | undefined,
): string {
  if (!startedAt || !finishedAt) return "—";
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  return formatMs(ms);
}

// ---------------------------------------------------------------------------
// Outcome toast summariser for POST /api/jobs/run + check/domain runs
// ---------------------------------------------------------------------------

interface OutcomeToast {
  tone: "success" | "warning" | "error";
  message: string;
  description?: string;
}

/**
 * Builds an honest one-line summary from a JobRunOutcome. Handles the shapes
 * the backend emits: check rows (CheckRunOutcomeRow), domain rows
 * (DomainCheckOutcomeRow) and billing task rows (BillingJobTaskResult-like).
 */
export function summariseJobOutcome(outcome: JobRunOutcome): OutcomeToast {
  const results = (outcome.results ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(results.rows) ? (results.rows as Record<string, unknown>[]) : [];
  const tasks = Array.isArray(results.tasks) ? (results.tasks as Record<string, unknown>[]) : [];
  const jobName = jobKeyLabel(outcome.jobKey);

  if (rows.length > 0 && "websiteName" in rows[0]) {
    const checked = rows.filter((row) => !row.skipped).length;
    const failed = rows.filter((row) => row.ok === false && !row.skipped).length;
    const skipped = rows.filter((row) => Boolean(row.skipped)).length;
    const parts = [`${checked} checked`, `${failed} failed`];
    if (skipped > 0) parts.push(`${skipped} skipped`);
    return {
      tone: failed > 0 ? "warning" : "success",
      message: `${jobName} finished (${outcome.status})`,
      description: parts.join(" · "),
    };
  }

  if (rows.length > 0 && "domainName" in rows[0]) {
    const checked = rows.length;
    const withErrors = rows.filter((row) => {
      const errors = Array.isArray(row.errors) ? (row.errors as unknown[]) : [];
      return errors.length > 0 || row.certOk === false || row.rdapOk === false;
    }).length;
    return {
      tone: withErrors > 0 ? "warning" : "success",
      message: `${jobName} finished (${outcome.status})`,
      description: `${checked} ${checked === 1 ? "domain" : "domains"} checked · ${withErrors} with errors`,
    };
  }

  if (tasks.length > 0) {
    const changed = tasks.reduce((sum, task) => sum + (Number(task.changed) || 0), 0);
    return {
      tone: outcome.status === "FAILED" ? "error" : "success",
      message: `${jobName} finished (${outcome.status})`,
      description: `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"} · ${changed} record${
        changed === 1 ? "" : "s"
      } updated`,
    };
  }

  if (outcome.status === "FAILED") {
    return {
      tone: "error",
      message: `${jobName} failed`,
      description: "See the Jobs tab for the recorded error.",
    };
  }
  if (outcome.status === "PARTIAL") {
    return {
      tone: "warning",
      message: `${jobName} finished with errors`,
      description: "See the Jobs tab for details.",
    };
  }
  return { tone: "success", message: `${jobName} finished (${outcome.status})` };
}

/** Shared mutation onSuccess handler for every Run-now button. */
export function toastJobOutcome(outcome: JobRunOutcome): void {
  const summary = summariseJobOutcome(outcome);
  if (summary.tone === "error") {
    toast.error(summary.message, { description: summary.description });
  } else if (summary.tone === "warning") {
    toast.warning(summary.message, { description: summary.description });
  } else {
    toast.success(summary.message, { description: summary.description });
  }
}

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

export function OutcomeIcon({ ok, skipped }: { ok: boolean; skipped?: string }) {
  if (skipped) return <MinusCircle aria-hidden className="size-4 text-muted-foreground" />;
  return ok ? (
    <CheckCircle2 aria-hidden className="size-4 text-success" />
  ) : (
    <XCircle aria-hidden className="size-4 text-destructive" />
  );
}

/** Domain/cert expiry day-count colouring: ≤7 red, ≤14 amber, ≤30 soft amber. */
export function expiryToneClass(days: number | null | undefined): string {
  if (days === null || days === undefined) return "text-muted-foreground";
  if (days <= 7) return "font-medium text-destructive";
  if (days <= 14) return "font-medium text-warning";
  if (days <= 30) return "text-warning/80";
  return "text-muted-foreground";
}

/** Pretty-printed JSON for the collapsible job-results block. */
export function prettyJson(value: unknown): string {
  if (value === null || value === undefined) return "—";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
