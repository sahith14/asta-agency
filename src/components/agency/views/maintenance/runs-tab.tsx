"use client";

/**
 * AgencyOS — Maintenance › Runs tab (Phase 4, task 4-b).
 *
 * Maintenance run history with status / website / due filters. Row click opens
 * the run detail (params.runId inside this view). Overdue planned runs show
 * red. Ad-hoc runs are created here.
 */
import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ListX, Plus, SearchX, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { buildQuery } from "@/components/agency/shared/record-list-helpers";
import { openMaintenance, useAppStore } from "@/components/agency/store";
import {
  apiFetch,
  label,
  MAINTENANCE_RUN_STATUSES,
  type MaintenanceRunRecord,
  type Paginated,
} from "@/lib/types";
import { formatDate } from "@/lib/format";
import { ListPagination } from "@/components/agency/views/tasks/list-pagination";
import { isPastDate, MaintenanceListSkeleton } from "@/components/agency/views/maintenance/bits";
import { RunFormDialog } from "@/components/agency/views/maintenance/run-form-dialog";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

const DUE_FILTERS = [
  { value: "upcoming", label: "Due upcoming" },
  { value: "overdue", label: "Overdue" },
] as const;

export function MaintenanceRunsTab() {
  const params = useAppStore((s) => s.params);

  const [status, setStatus] = useState(
    (MAINTENANCE_RUN_STATUSES as readonly string[]).includes(params.status ?? "")
      ? params.status
      : "",
  );
  const [websiteId, setWebsiteId] = useState(params.websiteId ?? "");
  const [due, setDue] = useState(
    DUE_FILTERS.some((filter) => filter.value === params.due) ? params.due : "",
  );
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  // Website filter options from the websites list (agency scale).
  const websitesQuery = useQuery({
    queryKey: ["websites", "lookup", "all"],
    queryFn: () => apiFetch<Paginated<{ id: string; name: string }>>("/api/websites?pageSize=100&sort=name&dir=asc"),
    staleTime: 60_000,
  });

  const listQueryKey = useMemo(
    () => ["maintenance-runs", { page, status, websiteId, due }] as const,
    [page, status, websiteId, due],
  );

  const listQuery = useQuery({
    queryKey: listQueryKey,
    queryFn: () =>
      apiFetch<Paginated<MaintenanceRunRecord>>(
        `/api/maintenance/runs${buildQuery({
          page,
          pageSize: PAGE_SIZE,
          status: status || undefined,
          websiteId: websiteId || undefined,
          due: due || undefined,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const pageCount = listQuery.data?.pageCount ?? 1;
  const hasFilters = !!status || !!websiteId || !!due;

  const openRun = (run: MaintenanceRunRecord) => {
    openMaintenance("runs", { runId: run.id });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {listQuery.isLoading
            ? "Loading runs…"
            : `${total} ${total === 1 ? "run" : "runs"}`}
        </p>
        <Button onClick={() => setCreateOpen(true)} className="min-h-9">
          <Plus aria-hidden />
          New ad-hoc run
        </Button>
      </div>

      {/* Filter bar */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Select value={status || "all"} onValueChange={(value) => { setStatus(value === "all" ? "" : value); setPage(1); }}>
          <SelectTrigger className="w-full lg:w-44" aria-label="Status filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {MAINTENANCE_RUN_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {label(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={websiteId || "all"}
          onValueChange={(value) => {
            setWebsiteId(value === "all" ? "" : value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full lg:w-52" aria-label="Website filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All websites</SelectItem>
            {(websitesQuery.data?.items ?? []).map((website) => (
              <SelectItem key={website.id} value={website.id}>
                {website.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={due || "all"} onValueChange={(value) => { setDue(value === "all" ? "" : value); setPage(1); }}>
          <SelectTrigger className="w-full lg:w-40" aria-label="Due filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any due date</SelectItem>
            {DUE_FILTERS.map((filter) => (
              <SelectItem key={filter.value} value={filter.value}>
                {filter.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {listQuery.isLoading ? (
        <MaintenanceListSkeleton />
      ) : listQuery.isError ? (
        <EmptyState
          icon={SearchX}
          title="Maintenance runs could not be loaded"
          description={(listQuery.error as Error)?.message ?? "Something went wrong."}
          action={
            <Button variant="outline" onClick={() => void listQuery.refetch()}>
              Try again
            </Button>
          }
        />
      ) : total === 0 && !hasFilters ? (
        <EmptyState
          icon={Wrench}
          title="No maintenance runs yet"
          description="Generate a run from a schedule or log an ad-hoc run — results and time spent are recorded per checklist item."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden />
              New ad-hoc run
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ListX}
          title="No runs match the current filters"
          description="Try widening the filters."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setStatus("");
                setWebsiteId("");
                setDue("");
                setPage(1);
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Website</TableHead>
                  <TableHead className="w-36">Scheduled</TableHead>
                  <TableHead className="w-36">Status</TableHead>
                  <TableHead className="w-36">Assigned to</TableHead>
                  <TableHead className="w-28">Schedule</TableHead>
                  <TableHead className="w-20 text-right">Items</TableHead>
                  <TableHead className="w-24 text-right">Time spent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((run) => {
                  const overdue = run.status === "PLANNED" && isPastDate(run.scheduledDate);
                  return (
                    <TableRow
                      key={run.id}
                      onClick={() => openRun(run)}
                      className="record-row cursor-pointer"
                    >
                      <TableCell className="max-w-56">
                        <p className="truncate text-sm font-medium">
                          {run.website?.name ?? "—"}
                          {run.website?.clientName ? (
                            <span className="font-normal text-muted-foreground">
                              {" "}
                              · {run.website.clientName}
                            </span>
                          ) : null}
                        </p>
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "text-sm whitespace-nowrap",
                            overdue ? "font-medium text-destructive" : "text-muted-foreground",
                          )}
                        >
                          {formatDate(run.scheduledDate)}
                          {overdue ? " · overdue" : ""}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge value={run.status} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {run.assignedTo?.displayName ?? "Unassigned"}
                      </TableCell>
                      <TableCell className="max-w-36">
                        {run.schedule ? (
                          <span className="block truncate text-sm">{run.schedule.name}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">ad-hoc</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {run._count?.items ?? run.items?.length ?? 0}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                        {run.timeSpentMinutes !== null ? `${run.timeSpentMinutes} min` : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="grid gap-2 md:hidden">
            {items.map((run) => {
              const overdue = run.status === "PLANNED" && isPastDate(run.scheduledDate);
              return (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => openRun(run)}
                  className="flex min-h-11 items-start justify-between gap-3 rounded-xl border bg-card p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {run.website?.name ?? "—"}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {run.schedule ? run.schedule.name : "ad-hoc"} ·{" "}
                      {run.assignedTo?.displayName ?? "Unassigned"}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground tabular-nums">
                      {run._count?.items ?? run.items?.length ?? 0} items ·{" "}
                      {run.timeSpentMinutes !== null ? `${run.timeSpentMinutes} min` : "no time logged"}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <StatusBadge value={run.status} />
                    <span
                      className={cn(
                        "mt-1 block text-xs whitespace-nowrap",
                        overdue ? "font-medium text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {formatDate(run.scheduledDate)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <ListPagination
            page={page}
            pageCount={pageCount}
            total={total}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </>
      )}

      <RunFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        presetWebsiteId={websiteId || undefined}
      />
    </div>
  );
}
