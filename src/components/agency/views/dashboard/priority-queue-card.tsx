"use client";

/**
 * AgencyOS — dashboard "Priority queue" card.
 * Severity dots: CRITICAL=destructive, HIGH=warning, NORMAL=muted.
 * Rows route by entityType (TASK→tasks list, CLIENT/WEBSITE/PROJECT→detail).
 * Shows the first 8 entries with a "Show all" expander beyond that.
 */
import { useState } from "react";
import { Inbox } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { DashboardData } from "@/lib/types";
import {
  SEVERITY_DOT,
  openEntityRoute,
} from "@/components/agency/views/dashboard/entity-routing";

type QueueItem = DashboardData["priorityQueue"][number];

function QueueRow({ item }: { item: QueueItem }) {
  return (
    <button
      type="button"
      onClick={() => openEntityRoute(item.entityType, item.entityId)}
      className="record-row -mx-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-lg px-2 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`${item.title} — open record`}
    >
      <span
        aria-hidden
        className={cn("mt-1.5 size-2 shrink-0 rounded-full", SEVERITY_DOT[item.severity])}
      />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{item.title}</span>
        <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
          {item.detail}
        </span>
      </span>
    </button>
  );
}

const VISIBLE_COUNT = 8;

export function PriorityQueueCard({
  items,
  loading = false,
}: {
  items: QueueItem[];
  loading?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, VISIBLE_COUNT);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Priority queue</CardTitle>
        <CardDescription>What needs attention first</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-4" aria-busy aria-label="Loading priority queue">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="mt-1.5 size-2 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Nothing needs attention"
            description="New installations start empty — create a client to get going."
            className="border-border/60"
          />
        ) : (
          <>
            <div className="space-y-1">
              {visible.map((item) => (
                <QueueRow key={`${item.kind}-${item.id}`} item={item} />
              ))}
            </div>
            {items.length > VISIBLE_COUNT ? (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 w-full"
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? "Show less" : `Show all (${items.length})`}
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
