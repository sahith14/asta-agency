"use client";

/**
 * AgencyOS — small building blocks shared by the Websites and Projects views
 * (both live under views/, consumed cross-folder by views/projects/*).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/agency/shared/empty-state";

/**
 * Debounced text state: `value` updates immediately, `debounced` trails 300ms.
 * Implemented with a timer ref (no setState inside effects) so it plays nice
 * with the react-hooks lint rules.
 */
export function useDebouncedState(
  initial: string,
  delay = 300
): [string, (v: string) => void, string] {
  const [value, setValue] = useState(initial);
  const [debounced, setDebounced] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = useCallback(
    (v: string) => {
      setValue(v);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setDebounced(v), delay);
    },
    [delay]
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return [value, set, debounced];
}

/** Simple date diff: whole days until `iso` (negative = past). null when unset. */
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return null;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTarget = new Date(target);
  startOfTarget.setHours(0, 0, 0, 0);
  return Math.round((startOfTarget.getTime() - startOfToday.getTime()) / 86_400_000);
}

/** Red when the date is within 30 days (or already past). */
export function renewalClasses(iso: string | null | undefined): string {
  const days = daysUntil(iso);
  if (days === null) return "text-muted-foreground";
  return days < 30 ? "text-destructive" : "text-foreground";
}

/** Pagination footer: range text + prev/next controls. */
export function PaginationFooter({
  page,
  pageCount,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-xs text-muted-foreground">
        Showing {from}&ndash;{to} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft className="size-4" />
          Prev
        </Button>
        <span className="text-xs text-muted-foreground">
          Page {page} of {Math.max(1, pageCount)}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
        >
          Next
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

/** Loading placeholder that mimics a table (desktop) + card list (mobile). */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      <div className="hidden md:block">
        <Skeleton className="mb-2 h-9 w-full" />
        <div className="space-y-2">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
      <div className="space-y-3 md:hidden">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </div>
  );
}

/** Honest load-failure card with a retry action. */
export function LoadErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <EmptyState
      icon={RotateCw}
      title="Could not load this view"
      description={message}
      action={
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw className="size-4" />
          Try again
        </Button>
      }
    />
  );
}

/** Dot separator used in detail meta lines. */
export function MetaSep() {
  return <span aria-hidden className="text-muted-foreground/60">·</span>;
}

/** Small "SAMPLE" tag for seeded demo records. */
export function SampleBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-md border border-dashed px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      Sample
    </span>
  );
}
