"use client";

/**
 * AgencyOS — vertical activity timeline (shared by the Activity view and the
 * client-detail Activity tab). Rows are clickable when the underlying entity
 * is CLIENT/WEBSITE/PROJECT (TASK routes to the tasks list per spec).
 */
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import type { ActivityRecord } from "@/lib/types";
import {
  ENTITY_TYPE_DOT,
  openEntityRoute,
  prettyEntityType,
} from "@/components/agency/views/dashboard/entity-routing";

/** Parses a metadata JSON string into tiny key:value chips (max 6). */
function parseMetaChips(metadata: string | null): [string, string][] {
  if (!metadata) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(metadata);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
  return Object.entries(parsed as Record<string, unknown>)
    .slice(0, 6)
    .map(([key, value]) => [
      key,
      typeof value === "string" ? value : JSON.stringify(value ?? null),
    ]);
}

function TimelineRow({ item }: { item: ActivityRecord }) {
  const chips = parseMetaChips(item.metadata);
  const clickable = Boolean(
    item.entityId && ["CLIENT", "WEBSITE", "PROJECT"].includes(item.entityType),
  );

  const body = (
    <>
      <span
        aria-hidden
        className={cn(
          "z-10 mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ring-card",
          ENTITY_TYPE_DOT[item.entityType] ?? "bg-muted-foreground/40",
        )}
      />
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-sm leading-snug font-medium break-words">{item.summary}</p>
        <p className="text-xs text-muted-foreground">
          {item.actorName} · {formatDateTime(item.createdAt)}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-px text-[11px] font-medium text-muted-foreground">
            {prettyEntityType(item.entityType)}
          </span>
          {item.entityLabel ? (
            <span className="inline-flex max-w-56 items-center truncate rounded-full border border-border bg-muted px-2 py-px text-[11px] font-medium text-muted-foreground">
              {item.entityLabel}
            </span>
          ) : null}
          {chips.map(([key, value]) => (
            <span
              key={key}
              className="inline-flex max-w-44 items-center truncate rounded-full border border-border bg-background px-2 py-px font-mono text-[10px] text-muted-foreground"
            >
              {key}: {value}
            </span>
          ))}
        </div>
      </div>
    </>
  );

  if (!clickable) {
    return <div className="flex gap-3">{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => openEntityRoute(item.entityType, item.entityId)}
      className="record-row -mx-2 flex w-[calc(100%+1rem)] gap-3 rounded-lg px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`${item.summary} — open record`}
    >
      {body}
    </button>
  );
}

export function ActivityTimeline({
  items,
  loading = false,
  emptyTitle = "No activity yet",
  emptyDescription = "Actions you take will appear here.",
}: {
  items: ActivityRecord[];
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (loading) {
    return (
      <div className="space-y-5" aria-busy aria-label="Loading activity">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="mt-1.5 size-2.5 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-card/60 px-4 py-8 text-center">
        <p className="text-sm font-medium text-foreground">{emptyTitle}</p>
        <p className="mt-1 text-sm text-muted-foreground">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <ol className="relative space-y-4">
      <span
        aria-hidden
        className="absolute top-2 bottom-2 left-[5px] w-px bg-border"
      />
      {items.map((item) => (
        <li key={item.id} className="relative">
          <TimelineRow item={item} />
        </li>
      ))}
    </ol>
  );
}
