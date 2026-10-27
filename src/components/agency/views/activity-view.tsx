"use client";

/**
 * AgencyOS — Activity view: full business activity + audit trail.
 * Filterable by entityType and client; vertical timeline with entityType-
 * coloured dots, metadata chips and routing to CLIENT/WEBSITE/PROJECT records.
 */
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { History, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, type ActivityRecord, type ClientRecord, type Paginated } from "@/lib/types";
import { useAppStore } from "@/components/agency/store";
import { PageHeader } from "@/components/agency/shared/page-header";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { buildQuery } from "@/components/agency/shared/record-list-helpers";
import { ListPagination } from "@/components/agency/views/dashboard/list-pagination";
import { ActivityTimeline } from "@/components/agency/views/dashboard/activity-timeline";
import { prettyEntityType } from "@/components/agency/views/dashboard/entity-routing";

const PAGE_SIZE = 25;

const ENTITY_TYPE_OPTIONS = [
  "CLIENT",
  "WEBSITE",
  "PROJECT",
  "TASK",
  "DOCUMENT",
  "SETTINGS",
  "AUTH",
] as const;

export default function ActivityView() {
  const params = useAppStore((s) => s.params);
  const [entityType, setEntityType] = useState(params.entityType ?? "all");
  const [clientId, setClientId] = useState(params.clientId ?? "");
  const [page, setPage] = useState(1);

  // Client filter options (first 100, alphabetical).
  const clientsQuery = useQuery({
    queryKey: ["clients", { forFilter: true }],
    queryFn: () =>
      apiFetch<Paginated<ClientRecord>>(
        `/api/clients${buildQuery({ pageSize: 100, sort: "businessName", dir: "asc" })}`,
      ),
  });

  const activityQuery = useQuery({
    queryKey: ["activity", { entityType, clientId, page }],
    queryFn: () =>
      apiFetch<Paginated<ActivityRecord>>(
        `/api/activity${buildQuery({
          page,
          pageSize: PAGE_SIZE,
          entityType: entityType !== "all" ? entityType : undefined,
          clientId: clientId || undefined,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });

  const items = activityQuery.data?.items ?? [];
  const total = activityQuery.data?.total ?? 0;
  const pageCount = activityQuery.data?.pageCount ?? 1;
  const hasFilters = entityType !== "all" || clientId !== "";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Activity"
        description="Full business activity and audit trail"
        actions={
          hasFilters ? (
            <Button
              variant="outline"
              onClick={() => {
                setEntityType("all");
                setClientId("");
                setPage(1);
              }}
            >
              <RotateCcw aria-hidden />
              Clear filters
            </Button>
          ) : null
        }
      />

      {/* Filter row */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center sm:p-4">
        <Select
          value={entityType}
          onValueChange={(v) => {
            setEntityType(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-48" aria-label="Filter by entity type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entity types</SelectItem>
            {ENTITY_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {prettyEntityType(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={clientId || "all"}
          onValueChange={(v) => {
            setClientId(v === "all" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-60" aria-label="Filter by client">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {(clientsQuery.data?.items ?? []).map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.businessName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!activityQuery.isLoading && !activityQuery.isError ? (
          <p className="text-xs tabular-nums text-muted-foreground sm:ml-auto">
            {total} {total === 1 ? "event" : "events"}
          </p>
        ) : null}
      </div>

      {/* Timeline */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="p-4 sm:p-6">
          {activityQuery.isError ? (
            <EmptyState
              icon={History}
              title="Could not load activity"
              description="Check your connection and try again."
              action={
                <Button variant="outline" onClick={() => void activityQuery.refetch()}>
                  Retry
                </Button>
              }
              className="border-0"
            />
          ) : activityQuery.isLoading ? (
            <div className="space-y-5" aria-busy aria-label="Loading activity">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="mt-1.5 size-2.5 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={History}
              title="No activity yet"
              description="Actions you take will appear here as you work with clients, websites, projects and tasks."
              className="border-0"
            />
          ) : (
            <ActivityTimeline
              items={items}
              emptyTitle="No activity yet"
              emptyDescription="Actions you take will appear here."
            />
          )}
        </div>
        {!activityQuery.isLoading && !activityQuery.isError && items.length > 0 ? (
          <ListPagination
            page={page}
            pageCount={pageCount}
            total={total}
            pageSize={PAGE_SIZE}
            onPage={setPage}
            className="border-x-0 border-b-0"
          />
        ) : null}
      </div>
    </div>
  );
}
