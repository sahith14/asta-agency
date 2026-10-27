"use client";

/**
 * AgencyOS — dashboard "Upcoming deadlines" card.
 * Kind icons: TASK=CircleCheckBig, PROJECT=FolderKanban, MILESTONE=Flag,
 * DOMAIN=Globe. Rows route by entityType (milestones already carry PROJECT,
 * domain renewals carry WEBSITE from the API).
 */
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import type { DashboardData } from "@/lib/types";
import {
  DEADLINE_KIND_ICON,
  openEntityRoute,
} from "@/components/agency/views/dashboard/entity-routing";

type DeadlineItem = DashboardData["upcomingDeadlines"][number];

export function DeadlinesCard({
  items,
  loading = false,
}: {
  items: DeadlineItem[];
  loading?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Upcoming deadlines</CardTitle>
        <CardDescription>Next dates on the calendar</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-4" aria-busy aria-label="Loading deadlines">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-8 rounded-md" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={DEADLINE_KIND_ICON.PROJECT}
            title="No upcoming deadlines"
            description="Deadlines appear here as soon as tasks, projects or renewals have dates."
            className="border-border/60"
          />
        ) : (
          <div className="-my-1 space-y-1">
            {items.map((item) => {
              const Icon = DEADLINE_KIND_ICON[item.kind] ?? DEADLINE_KIND_ICON.PROJECT;
              return (
                <button
                  key={`${item.kind}-${item.id}`}
                  type="button"
                  onClick={() => openEntityRoute(item.entityType, item.entityId)}
                  className="record-row -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`${item.title} — open record`}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                    <Icon aria-hidden className="size-4 text-primary" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatDate(item.date)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
