"use client";

/**
 * AgencyOS — Monitoring › Websites tab (Phase 4, task 4-b).
 *
 * Lists EVERY website (honest about sites without a config row) with health
 * state, interval, last check, last error and active-incident count. Row
 * actions: enable/disable switch (first enable opens the config dialog),
 * "Check now" (real POST /api/monitoring/checks/run) and Configure.
 */
import { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListX, PlayCircle, Radar, Search, SearchX, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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
import { navigate, openMonitoring, useAppStore } from "@/components/agency/store";
import {
  apiFetch,
  type CheckRunOutcomeRow,
  type JobRunOutcome,
  type MonitorListRow,
  type Paginated,
} from "@/lib/types";
import { timeAgo } from "@/lib/format";
import { useDebouncedValue } from "@/components/agency/views/tasks/lookups";
import { ListPagination } from "@/components/agency/views/tasks/list-pagination";
import { MonitorConfigDialog, type MonitorDialogWebsite } from "@/components/agency/views/monitoring/config-dialog";
import { toastJobOutcome } from "@/components/agency/views/monitoring/bits";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

const HEALTH_FILTERS = ["HEALTHY", "DEGRADED", "DOWN", "DISABLED"] as const;

export function MonitoringWebsitesTab() {
  const params = useAppStore((s) => s.params);
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<{
    health: string;
    websiteId: string;
  }>(() => ({
    health: (HEALTH_FILTERS as readonly string[]).includes(params.health ?? "")
      ? params.health
      : "",
    websiteId: params.websiteId ?? "",
  }));
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState(params.q ?? "");
  const debouncedSearch = useDebouncedValue(searchInput);

  // Dialog state: the website being configured (null = closed).
  const [configTarget, setConfigTarget] = useState<{
    website: MonitorDialogWebsite;
    config: MonitorListRow["config"];
    presetEnabled: boolean;
  } | null>(null);

  const setFilter = (patch: Partial<{ health: string; websiteId: string }>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };

  const listQueryKey = useMemo(
    () =>
      [
        "monitoring-configs",
        { page, search: debouncedSearch, health: filters.health, websiteId: filters.websiteId },
      ] as const,
    [page, debouncedSearch, filters.health, filters.websiteId],
  );

  const listQuery = useQuery({
    queryKey: listQueryKey,
    queryFn: () =>
      apiFetch<Paginated<MonitorListRow>>(
        `/api/monitoring/configs${buildQuery({
          page,
          pageSize: PAGE_SIZE,
          q: debouncedSearch || undefined,
          health: filters.health || undefined,
          websiteId: filters.websiteId || undefined,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });

  // Toggle monitoring on/off. First-time enable (no config row yet) opens the
  // configuration dialog instead of silently creating a default config.
  const toggleMutation = useMutation({
    mutationFn: (input: { websiteId: string; name: string; enabled: boolean }) =>
      apiFetch<MonitorListRow["config"]>(`/api/monitoring/configs/${input.websiteId}`, {
        method: "PUT",
        body: JSON.stringify({ enabled: input.enabled }),
      }),
    onSuccess: (record, input) => {
      toast.success(
        record?.enabled
          ? `Monitoring enabled for ${input.name}.`
          : `Monitoring disabled for ${input.name}.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["monitoring-configs"] });
      void queryClient.invalidateQueries({ queryKey: ["monitoring-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not update monitoring."),
  });

  const checkNowMutation = useMutation({
    mutationFn: (input: { websiteId: string; name: string }) =>
      apiFetch<JobRunOutcome>("/api/monitoring/checks/run", {
        method: "POST",
        body: JSON.stringify({ websiteId: input.websiteId }),
      }),
    onSuccess: (outcome, input) => {
      const results = (outcome.results ?? {}) as Record<string, unknown>;
      const rows = Array.isArray(results.rows) ? (results.rows as CheckRunOutcomeRow[]) : [];
      const row = rows.find((entry) => entry.websiteId === input.websiteId) ?? rows[0];
      if (row?.skipped) {
        toast.info(`${input.name}: skipped (${row.skipped})`);
      } else if (row) {
        if (row.ok) {
          toast.success(
            `${input.name}: passed ${row.statusCode ?? ""} in ${row.durationMs ?? "?"} ms — ${row.health}`,
          );
        } else {
          toast.warning(`${input.name}: check failed`, {
            description: row.errorSummary ?? "The site did not return an accepted status code.",
          });
        }
      } else {
        toastJobOutcome(outcome);
      }
      void queryClient.invalidateQueries({ queryKey: ["monitoring-configs"] });
      void queryClient.invalidateQueries({ queryKey: ["monitoring-checks"] });
      void queryClient.invalidateQueries({ queryKey: ["monitoring-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: Error) => toast.error(error.message || "The check could not be run."),
  });

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const pageCount = listQuery.data?.pageCount ?? 1;
  const hasActiveFilters = !!debouncedSearch || !!filters.health || !!filters.websiteId;

  const clearFilters = () => {
    setFilters({ health: "", websiteId: "" });
    setSearchInput("");
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {listQuery.isLoading
            ? "Loading websites…"
            : `${total} ${total === 1 ? "website" : "websites"} — sites without monitoring are listed too`}
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1 lg:max-w-xs">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
              setPage(1);
            }}
            placeholder="Search websites or clients…"
            aria-label="Search monitored websites"
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Select
            value={filters.health || "all"}
            onValueChange={(value) => setFilter({ health: value === "all" ? "" : value })}
          >
            <SelectTrigger className="w-full lg:w-44" aria-label="Health filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All health states</SelectItem>
              {HEALTH_FILTERS.map((health) => (
                <SelectItem key={health} value={health}>
                  {health === "DISABLED" ? "Disabled" : health === "DOWN" ? "Down" : health === "HEALTHY" ? "Healthy" : "Degraded"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List */}
      {listQuery.isLoading ? (
        <WebsitesSkeleton />
      ) : listQuery.isError ? (
        <EmptyState
          icon={SearchX}
          title="Monitored websites could not be loaded"
          description={(listQuery.error as Error)?.message ?? "Something went wrong."}
          action={
            <Button variant="outline" onClick={() => void listQuery.refetch()}>
              Try again
            </Button>
          }
        />
      ) : total === 0 && !hasActiveFilters ? (
        <EmptyState
          icon={Radar}
          title="No websites are being monitored yet"
          description="Enable monitoring on a website — it starts with the production URL, a five-minute interval and sane thresholds, all editable later."
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ListX}
          title="No websites match the current filters"
          description="Try widening the filters or clearing the search."
          action={
            <Button variant="outline" onClick={clearFilters}>
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
                  <TableHead className="w-32">Health</TableHead>
                  <TableHead className="w-20">Interval</TableHead>
                  <TableHead className="w-28">Last check</TableHead>
                  <TableHead className="max-w-56">Last error</TableHead>
                  <TableHead className="w-20">Incidents</TableHead>
                  <TableHead className="w-64 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => {
                  const enabled = Boolean(row.config?.enabled);
                  const health = row.config?.enabled ? row.config.currentHealth : "DISABLED";
                  return (
                    <TableRow key={row.website.id}>
                      <TableCell className="max-w-64">
                        <button
                          type="button"
                          onClick={() => openMonitoring("checks", { websiteId: row.website.id })}
                          className="block max-w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="block truncate text-sm font-medium hover:underline">
                            {row.website.name}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {row.website.clientName ?? "—"}
                          </span>
                        </button>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          <StatusBadge value={health} />
                          <p className="truncate text-xs text-muted-foreground" title={row.website.productionUrl ?? row.website.primaryDomain ?? undefined}>
                            {row.website.productionUrl ?? row.website.primaryDomain ?? "no URL"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {row.config?.enabled ? `${row.config.intervalMinutes} min` : "—"}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                        {row.config?.lastCheckAt ? timeAgo(row.config.lastCheckAt) : "never"}
                      </TableCell>
                      <TableCell className="max-w-56">
                        {row.config?.lastErrorSummary ? (
                          <span
                            className="block truncate text-xs text-destructive"
                            title={row.config.lastErrorSummary}
                          >
                            {row.config.lastErrorSummary}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.activeIncidentCount > 0 ? (
                          <button
                            type="button"
                            onClick={() => navigate("incidents", { status: "OPEN", websiteId: row.website.id })}
                            className="min-h-6 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive outline-none hover:bg-destructive/15 focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {row.activeIncidentCount} active
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-3">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={enabled}
                              onCheckedChange={(checked) => {
                                if (checked && !row.config) {
                                  setConfigTarget({ website: row.website, config: null, presetEnabled: true });
                                  return;
                                }
                                toggleMutation.mutate({
                                  websiteId: row.website.id,
                                  name: row.website.name,
                                  enabled: checked,
                                });
                              }}
                              disabled={toggleMutation.isPending}
                              aria-label={`Monitoring ${enabled ? "enabled" : "disabled"} for ${row.website.name}`}
                            />
                            <Label className="text-xs text-muted-foreground">
                              {enabled ? "On" : "Off"}
                            </Label>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="min-h-8"
                            disabled={!row.config?.enabled || checkNowMutation.isPending}
                            onClick={() =>
                              checkNowMutation.mutate({
                                websiteId: row.website.id,
                                name: row.website.name,
                              })
                            }
                          >
                            <PlayCircle aria-hidden className="size-3.5" />
                            Check now
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="min-h-8"
                            onClick={() =>
                              setConfigTarget({
                                website: row.website,
                                config: row.config,
                                presetEnabled: enabled,
                              })
                            }
                          >
                            <Settings2 aria-hidden className="size-3.5" />
                            Configure
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="grid gap-3 md:hidden">
            {items.map((row) => {
              const enabled = Boolean(row.config?.enabled);
              const health = row.config?.enabled ? row.config.currentHealth : "DISABLED";
              return (
                <div key={row.website.id} className="space-y-3 rounded-xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => openMonitoring("checks", { websiteId: row.website.id })}
                      className="min-w-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="block truncate text-sm font-medium">{row.website.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {row.website.clientName ?? "—"}
                      </span>
                    </button>
                    <StatusBadge value={health} />
                  </div>
                  <p
                    className="truncate text-xs text-muted-foreground"
                    title={row.website.productionUrl ?? row.website.primaryDomain ?? undefined}
                  >
                    {row.website.productionUrl ?? row.website.primaryDomain ?? "no URL"}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{row.config?.enabled ? `${row.config.intervalMinutes} min interval` : "not checked"}</span>
                    <span aria-hidden>·</span>
                    <span>{row.config?.lastCheckAt ? `checked ${timeAgo(row.config.lastCheckAt)}` : "never checked"}</span>
                    {row.activeIncidentCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => navigate("incidents", { status: "OPEN", websiteId: row.website.id })}
                        className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 font-medium text-destructive"
                      >
                        {row.activeIncidentCount} active incident{row.activeIncidentCount === 1 ? "" : "s"}
                      </button>
                    ) : null}
                  </div>
                  {row.config?.lastErrorSummary ? (
                    <p
                      className={cn("truncate text-xs text-destructive")}
                      title={row.config.lastErrorSummary}
                    >
                      {row.config.lastErrorSummary}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={enabled}
                        onCheckedChange={(checked) => {
                          if (checked && !row.config) {
                            setConfigTarget({ website: row.website, config: null, presetEnabled: true });
                            return;
                          }
                          toggleMutation.mutate({
                            websiteId: row.website.id,
                            name: row.website.name,
                            enabled: checked,
                          });
                        }}
                        disabled={toggleMutation.isPending}
                        aria-label={`Monitoring ${enabled ? "enabled" : "disabled"} for ${row.website.name}`}
                      />
                      <Label className="text-xs text-muted-foreground">{enabled ? "On" : "Off"}</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-9"
                        disabled={!row.config?.enabled || checkNowMutation.isPending}
                        onClick={() =>
                          checkNowMutation.mutate({
                            websiteId: row.website.id,
                            name: row.website.name,
                          })
                        }
                      >
                        <PlayCircle aria-hidden className="size-3.5" />
                        Check
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-9"
                        onClick={() =>
                          setConfigTarget({
                            website: row.website,
                            config: row.config,
                            presetEnabled: enabled,
                          })
                        }
                      >
                        <Settings2 aria-hidden className="size-3.5" />
                        Configure
                      </Button>
                    </div>
                  </div>
                </div>
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

      <MonitorConfigDialog
        open={!!configTarget}
        onOpenChange={(open) => {
          if (!open) setConfigTarget(null);
        }}
        website={configTarget?.website ?? null}
        config={configTarget?.config ?? null}
        presetEnabled={configTarget?.presetEnabled ?? true}
      />
    </div>
  );
}

function WebsitesSkeleton() {
  return (
    <div className="space-y-2" aria-busy aria-label="Loading websites">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-xl border bg-card p-4">
          <div className="flex-1 space-y-1.5">
            <div className="h-4 w-2/5 rounded bg-muted" />
            <div className="h-3 w-1/4 rounded bg-muted" />
          </div>
          <div className="h-5 w-20 rounded bg-muted" />
          <div className="h-5 w-16 rounded bg-muted" />
          <div className="h-8 w-44 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
