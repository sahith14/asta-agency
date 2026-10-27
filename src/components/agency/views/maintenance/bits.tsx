"use client";

/**
 * AgencyOS — shared maintenance UI bits (Phase 4, task 4-b).
 */
import { cn } from "@/lib/utils";

/** "YYYY-MM-DD" for date inputs (today). */
export function todayInput(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "YYYY-MM-DD" n days from today (min 0). */
export function addDaysInput(days: number): string {
  const now = new Date();
  now.setDate(now.getDate() + Math.max(0, days));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** True when the scheduled date is strictly before today. */
export function isPastDate(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return date.getTime() < startOfToday.getTime();
}

/** Shared list skeleton (rows of card-like placeholders). */
export function MaintenanceListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy aria-label="Loading">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-xl border bg-card p-4">
          <div className="flex-1 space-y-1.5">
            <div className="h-4 w-2/5 rounded bg-muted" />
            <div className="h-3 w-1/4 rounded bg-muted" />
          </div>
          <div className="h-5 w-20 rounded bg-muted" />
          <div className="h-5 w-16 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

/** Checklist result chip colouring for the stats row. */
export function resultChipClass(result: string): string {
  switch (result) {
    case "PASSED":
      return "border-success/30 bg-success/10 text-success";
    case "FAILED":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    case "ATTEMPTED":
      return "border-warning/40 bg-warning/15 text-warning-foreground";
    case "PENDING":
      return "border-border bg-muted text-muted-foreground";
    default:
      // SKIPPED / NOT_APPLICABLE
      return cn("border-border bg-muted text-muted-foreground");
  }
}
