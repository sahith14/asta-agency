"use client";

/**
 * AgencyOS — compact activity timeline shared by the Website and Project
 * detail views (border-l rail, dots, summary, actor + timestamp).
 */
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { LoadErrorState, ListSkeleton } from "@/components/agency/views/websites/list-bits";
import { apiFetch, type ActivityRecord, type Paginated } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { buildQuery } from "@/components/agency/shared/record-list-helpers";
import { cn } from "@/lib/utils";

export function ActivityTimeline({
  params,
  pageSize = 20,
  className,
}: {
  params: Record<string, string | number>;
  pageSize?: number;
  className?: string;
}) {
  const query = useQuery({
    queryKey: ["activity", { ...params, pageSize }],
    queryFn: () =>
      apiFetch<Paginated<ActivityRecord>>(
        `/api/activity${buildQuery({ ...params, pageSize })}`
      ),
  });

  if (query.isPending) return <ListSkeleton rows={4} />;
  if (query.isError) {
    return <LoadErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />;
  }

  const items = query.data.items;
  if (items.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No activity yet"
        description="Changes to this record are logged here."
        className={className}
      />
    );
  }

  return (
    <ul className={cn("relative space-y-5 border-l border-border pl-5", className)}>
      {items.map((entry) => (
        <li key={entry.id} className="relative">
          <span
            aria-hidden
            className={cn(
              "absolute -left-[25px] top-1.5 size-2.5 rounded-full border-2 border-background",
              entry.kind === "AUDIT" ? "bg-primary" : "bg-muted-foreground/50"
            )}
          />
          <p className="text-sm leading-snug">{entry.summary}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {entry.actorName} · {formatDateTime(entry.createdAt)}
            {entry.kind === "AUDIT" ? " · Audit" : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}
