"use client";

/**
 * AgencyOS — dashboard "Recent activity" card (latest 10 events).
 * "View all" routes to the full Activity view.
 */
import { ChevronRight } from "lucide-react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppStore } from "@/components/agency/store";
import { timeAgo } from "@/lib/format";
import type { ActivityRecord } from "@/lib/types";
import {
  ENTITY_TYPE_DOT,
  prettyEntityType,
} from "@/components/agency/views/dashboard/entity-routing";

export function RecentActivityCard({
  items,
  loading = false,
}: {
  items: ActivityRecord[];
  loading?: boolean;
}) {
  const navigate = useAppStore((s) => s.navigate);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent activity</CardTitle>
        <CardDescription>Latest events across the workspace</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" onClick={() => navigate("activity")}>
            View all
            <ChevronRight aria-hidden />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-4" aria-busy aria-label="Loading recent activity">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-card/60 px-4 py-8 text-center text-sm text-muted-foreground">
            No activity yet — actions you take will appear here.
          </p>
        ) : (
          <ol className="max-h-72 space-y-3 overflow-y-auto pr-1 scrollbar-thin">
            {items.map((item) => (
              <li key={item.id} className="flex items-start gap-3">
                <span
                  aria-hidden
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${
                    ENTITY_TYPE_DOT[item.entityType] ?? "bg-muted-foreground/40"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug break-words">{item.summary}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {item.actorName} · {timeAgo(item.createdAt)} ·{" "}
                    {prettyEntityType(item.entityType)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
