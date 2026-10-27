"use client";

/**
 * AgencyOS — Monitoring › Jobs tab (Phase 4, task 4-b).
 *
 * BackgroundJobRun history (GET /api/jobs) with per-key Run-now buttons
 * (POST /api/jobs/run). Failures show lastError in full — recorded errors are
 * never truncated away. Results are pretty-printed JSON in a collapsible
 * <details> block.
 */
import { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListX, PlayCircle, RefreshCw, SearchX, ServerCog } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { buildQuery } from "@/components/agency/shared/record-list-helpers";
import {
  apiFetch,
  BACKGROUND_JOB_KEYS,
  JOB_RUN_STATUSES,
  label,
  type BackgroundJobRunRecord,
  type JobRunOutcome,
  type Paginated,
} from "@/lib/types";
import { formatDateTime, timeAgo } from "@/lib/format";
import { ListPagination } from "@/components/agency/views/tasks/list-pagination";
import { formatRunDuration, JOB_KEY_LABELS, jobKeyLabel, prettyJson, toastJobOutcome } from "@/components/agency/views/monitoring/bits";

const PAGE_SIZE = 15;

export function MonitoringJobsTab() {
  const queryClient = useQueryClient();
  const [jobKey, setJobKey] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const listQueryKey = useMemo(
    () => ["jobs", { page, jobKey, status }] as const,
    [page, jobKey, status],
  );

  const listQuery = useQuery({
    queryKey: listQueryKey,
    queryFn: () =>
      apiFetch<Paginated<BackgroundJobRunRecord>>(
        `/api/jobs${buildQuery({
          page,
          pageSize: PAGE_SIZE,
          jobKey: jobKey || undefined,
          status: status || undefined,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });

  const runJob = useMutation({
    mutationFn: (key: string) =>
      apiFetch<JobRunOutcome>("/api/jobs/run", {
        method: "POST",
        body: JSON.stringify({ jobKey: key }),
      }),
    onSuccess: (outcome) => {
      toastJobOutcome(outcome);
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
      void queryClient.invalidateQueries({ queryKey: ["monitoring-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["monitoring-domains"] });
      void queryClient.invalidateQueries({ queryKey: ["monitoring-configs"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: Error) => toast.error(error.message || "The job could not be started."),
  });

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const pageCount = listQuery.data?.pageCount ?? 1;
  const hasFilters = !!jobKey || !!status;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select
            value={jobKey || "all"}
            onValueChange={(value) => {
              setJobKey(value === "all" ? "" : value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full lg:w-56" aria-label="Job filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All jobs</SelectItem>
              {BACKGROUND_JOB_KEYS.map((key) => (
                <SelectItem key={key} value={key}>
                  {JOB_KEY_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={status || "all"}
            onValueChange={(value) => {
              setStatus(value === "all" ? "" : value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full lg:w-40" aria-label="Status filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {JOB_RUN_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {label(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Run-now group — every job key can be executed manually */}
        <div className="flex flex-wrap items-center gap-2">
          {BACKGROUND_JOB_KEYS.map((key) => (
            <Button
              key={key}
              variant="outline"
              size="sm"
              className="min-h-9"
              disabled={runJob.isPending}
              onClick={() => runJob.mutate(key)}
            >
              <PlayCircle aria-hidden className="size-3.5" />
              {JOB_KEY_LABELS[key]}
            </Button>
          ))}
        </div>
      </div>

      <p className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        In-process scheduler: jobs run every minute while the server is up. Multi-instance
        deployments should call <code className="font-mono">POST /api/jobs/run</code> from external
        cron instead of relying on this instance.
      </p>

      {listQuery.isLoading ? (
        <div className="space-y-2" aria-busy aria-label="Loading jobs">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="space-y-2 rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2">
                <div className="h-4 w-40 rounded bg-muted" />
                <div className="h-5 w-16 rounded bg-muted" />
                <div className="h-5 w-16 rounded bg-muted" />
              </div>
              <div className="h-3 w-2/3 rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : listQuery.isError ? (
        <EmptyState
          icon={SearchX}
          title="Job history could not be loaded"
          description={(listQuery.error as Error)?.message ?? "Something went wrong."}
          action={
            <Button variant="outline" onClick={() => void listQuery.refetch()}>
              Try again
            </Button>
          }
        />
      ) : total === 0 && !hasFilters ? (
        <EmptyState
          icon={ServerCog}
          title="No job runs recorded yet"
          description="Every scheduled or manual job execution is recorded here — run one now with the buttons above."
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ListX}
          title="No job runs match the current filters"
          description="Try widening the filters."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setJobKey("");
                setStatus("");
                setPage(1);
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          <div className="space-y-2">
            {items.map((job) => (
              <div key={job.id} className="space-y-2 rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{jobKeyLabel(job.jobKey)}</span>
                  <StatusBadge value={job.status} />
                  <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {label(job.trigger)}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatDateTime(job.startedAt)}
                    {job.finishedAt
                      ? ` · took ${formatRunDuration(job.startedAt, job.finishedAt)}`
                      : " · running…"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">
                  attempts {job.attempts} · finished{" "}
                  {job.finishedAt ? timeAgo(job.finishedAt) : "—"}
                </p>
                {job.lastError ? (
                  <p className="text-xs break-words whitespace-pre-wrap text-destructive">
                    {job.lastError}
                  </p>
                ) : null}
                {job.results ? (
                  <details className="group rounded-lg border bg-muted/30">
                    <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground outline-none hover:text-foreground">
                      <RefreshCw aria-hidden className="size-3" />
                      Results
                    </summary>
                    <pre className="scrollbar-thin max-h-64 overflow-auto border-t px-3 py-2 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap">
                      {prettyJson(job.results)}
                    </pre>
                  </details>
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
