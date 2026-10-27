"use client";

/**
 * AgencyOS — tiny shared building blocks for the Support workspace (task 3-b).
 * Kept dependency-free so both the list and the detail views can import them.
 */
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Ticket.number -> human label ("TKT-0004"). */
export function ticketNumber(number: number): string {
  return `TKT-${String(number).padStart(4, "0")}`;
}

/** Monospace ticket-number chip, e.g. "TKT-0004". */
export function TicketNumberChip({ number, className }: { number: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border bg-muted px-1.5 py-0.5 font-mono text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      {ticketNumber(number)}
    </span>
  );
}

/** Dismissible filter chip (same pattern as the Tasks/Documents views). */
export function FilterChip({ text, onRemove }: { text: string; onRemove: () => void }) {
  return (
    <span className="inline-flex max-w-64 items-center gap-1 rounded-full border bg-muted/60 py-1 pr-1 pl-2.5 text-xs font-medium">
      <span className="truncate">{text}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter ${text}`}
        className="rounded-full p-0.5 transition-colors hover:bg-muted"
      >
        <X aria-hidden className="size-3" />
      </button>
    </span>
  );
}

const PRIORITY_DOT: Record<string, string> = {
  CRITICAL: "bg-destructive",
  HIGH: "bg-warning",
  NORMAL: "bg-primary",
  LOW: "bg-muted-foreground/40",
};

/** Coloured priority dot (matches the priority labels used across lists). */
export function PriorityDot({ priority, className }: { priority: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("size-2 shrink-0 rounded-full", PRIORITY_DOT[priority] ?? "bg-muted-foreground/50", className)}
    />
  );
}
