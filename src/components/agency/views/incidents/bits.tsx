"use client";

/**
 * AgencyOS — shared incident UI bits (Phase 4, task 4-b).
 */
import { cn } from "@/lib/utils";

/** Incident.number -> human label ("INC-0001"). */
export function incidentNumber(number: number): string {
  return `INC-${String(number).padStart(4, "0")}`;
}

/** Monospace incident-number chip, e.g. "INC-0001" (mirrors TicketNumberChip). */
export function IncidentNumberChip({ number, className }: { number: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border bg-muted px-1.5 py-0.5 font-mono text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      {incidentNumber(number)}
    </span>
  );
}

/** Skeleton that mimics the incident list rows. */
export function IncidentListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy aria-label="Loading incidents">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-xl border bg-card p-4">
          <div className="h-5 w-20 rounded bg-muted" />
          <div className="flex-1 space-y-1.5">
            <div className="h-4 w-2/5 rounded bg-muted" />
            <div className="h-3 w-1/4 rounded bg-muted" />
          </div>
          <div className="h-5 w-16 rounded bg-muted" />
          <div className="h-5 w-16 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
