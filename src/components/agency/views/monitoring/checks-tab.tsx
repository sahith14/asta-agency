"use client";

/**
 * AgencyOS — Monitoring › Checks tab (Phase 4, task 4-b).
 *
 * Raw health-check history: GET /api/monitoring/checks with website + result
 * filters. Failures show their sanitised error category + summary. `result`
 * filter values (PASSED/FAILED) are the one under-specified corner of the
 * frozen contract — kept in a single constant so a backend naming difference
 * is a one-line change.
 */
import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Activity, ListX, SearchX } from "lucide-react";
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
import { buildQuery } from "@/components/agency/shared/record-list-helpers";
import { useAppStore } from "@/components/agency/store";
import { apiFetch, label, type HealthCheckRecord, type Paginated } from "@/lib/types";
import { formatDateTime, timeAgo } from "@/lib/format";
import { ListPagination } from "@/components/agency/views/tasks/list-pagination";
import { CheckResultBadge, formatMs } from "@/components/agency/views/monitoring/bits";

const PAGE_SIZE = 25;

/** Filter values for GET /api/monitoring/checks?result=… (see file header). */
const RESULT_FILTER = { SUCCESS: "PASSED", FAILURE: "FAILED" } as const;

export function MonitoringChecksTab() {
  const params = useAppStore((s) => s.params);

  const [websiteId, setWebsiteId] = useState(params.websiteId ?? "");
  const [result, setResult] = useState(
    params.result === RESULT_FILTER.SUCCESS || params.result === RESULT_FILTER.FAILURE
      ? (params.result as string)
      : "",
  );
  const [page, setPage] = useState(1);

  // Website picker rows come from the monitoring-configs list (one page of 100
  // — agency scale documented in worklog.md).
  const websitesQuery = useQuery({
    queryKey: ["monitoring-configs", { lookup: true }],
    queryFn: () =>
      apiFetch<Paginated<{ website: { id: string; name: string; clientName: string | null } }>>(
        "/api/monitoring/configs?pageSize=100",
      ),
    staleTime: 60_000,
  });

  const listQueryKey = useMemo(
    () => ["monitoring-checks", { page, websiteId, result }] as const,
    [page, websiteId, result],
  );

  const listQuery = useQuery({
    queryKey: listQueryKey,
    queryFn: () =>
      apiFetch<Paginated<HealthCheckRecord>>(
        `/api/monitoring/checks${buildQuery({
          page,
          pageSize: PAGE_SIZE,
          websiteId: websiteId || undefined,
          result: result || undefined,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const pageCount = listQuery.data?.pageCount ?? 1;
  const hasFilters = !!websiteId || !!result;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {listQuery.isLoading
            ? "Loading checks…"
            : `${total} recorded ${total === 1 ? "check" : "checks"}`}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select
            value={websiteId || "all"}
            onValueChange={(value) => {
              setWebsiteId(value === "all" ? "" : value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full lg:w-56" aria-label="Website filter">
              <SelectValue placeholder="All websites" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All websites</SelectItem>
              {(websitesQuery.data?.items ?? []).map((row) => (
                <SelectItem key={row.website.id} value={row.website.id}>
                  {row.website.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={result || "all"}
            onValueChange={(value) => {
              setResult(value === "all" ? "" : value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full lg:w-40" aria-label="Result filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All results</SelectItem>
              <SelectItem value={RESULT_FILTER.SUCCESS}>Passed only</SelectItem>
              <SelectItem value={RESULT_FILTER.FAILURE}>Failures only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {listQuery.isLoading ? (
        <div className="space-y-2" aria-busy aria-label="Loading checks">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 rounded-xl border bg-card p-3">
              <div className="h-4 w-36 rounded bg-muted" />
              <div className="h-4 flex-1 rounded bg-muted" />
              <div className="h-5 w-20 rounded bg-muted" />
              <div className="h-4 w-16 rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : listQuery.isError ? (
        <EmptyState
          icon={SearchX}
          title="Checks could not be loaded"
          description={(listQuery.error as Error)?.message ?? "Something went wrong."}
          action={
            <Button variant="outline" onClick={() => void listQuery.refetch()}>
              Try again
            </Button>
          }
        />
      ) : total === 0 && !hasFilters ? (
        <EmptyState
          icon={Activity}
          title="No checks have run yet"
          description="Checks appear here once monitoring is enabled and the scheduler (or a manual run) has executed."
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ListX}
          title="No checks match the current filters"
          description="Try widening the filters."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setWebsiteId("");
                setResult("");
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
                  <TableHead className="w-44">Time</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead className="w-36">Result</TableHead>
                  <TableHead className="w-20 text-right">HTTP</TableHead>
                  <TableHead className="w-24 text-right">Duration</TableHead>
                  <TableHead className="w-28">Trigger</TableHead>
                  <TableHead className="max-w-64">Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((check) => (
                  <TableRow key={check.id}>
                    <TableCell
                      className="text-sm whitespace-nowrap text-muted-foreground"
                      title={formatDateTime(check.checkedAt)}
                    >
                      {timeAgo(check.checkedAt)}
                    </TableCell>
                    <TableCell className="max-w-56">
                      <p className="truncate text-sm font-medium">{check.website?.name ?? "—"}</p>
                      {check.website?.clientName ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {check.website.clientName}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <CheckResultBadge success={check.success} errorCategory={check.errorCategory} />
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {check.statusCode ?? "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {check.durationMs !== null ? formatMs(check.durationMs) : "—"}
                      {check.slow ? <span className="ml-1 text-warning">slow</span> : null}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {label(check.trigger)}
                    </TableCell>
                    <TableCell className="max-w-64">
                      {check.errorSummary ? (
                        <span
                          className="block truncate text-xs text-destructive"
                          title={check.errorSummary}
                        >
                          {check.errorSummary}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="grid gap-2 md:hidden">
            {items.map((check) => (
              <div key={check.id} className="space-y-2 rounded-xl border bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {check.website?.name ?? "—"}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {timeAgo(check.checkedAt)} · {label(check.trigger)}
                    </span>
                  </span>
                  <CheckResultBadge success={check.success} errorCategory={check.errorCategory} />
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">
                  HTTP {check.statusCode ?? "—"} ·{" "}
                  {check.durationMs !== null ? formatMs(check.durationMs) : "—"}
                  {check.slow ? " · slow" : ""}
                </p>
                {check.errorSummary ? (
                  <p className="text-xs break-words text-destructive">{check.errorSummary}</p>
                ) : null}
              </div>
            ))}
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
    </div>
  );
}
