"use client";

/**
 * AgencyOS — Incidents list (Phase 4, task 4-b).
 *
 * Filters: status (Open default / All / each status), severity, debounced
 * search (number or title), websiteId seed from store params. Desktop table →
 * mobile cards. Row click opens the incident detail.
 */
import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ListX, Plus, Search, SearchX, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { openIncident, useAppStore } from "@/components/agency/store";
import {
  apiFetch,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  label,
  type IncidentRecord,
  type Paginated,
} from "@/lib/types";
import { timeAgo } from "@/lib/format";
import { useDebouncedValue } from "@/components/agency/views/tasks/lookups";
import { ListPagination } from "@/components/agency/views/tasks/list-pagination";
import { IncidentListSkeleton, IncidentNumberChip } from "@/components/agency/views/incidents/bits";
import { IncidentFormDialog } from "@/components/agency/views/incidents/incident-form-dialog";

const PAGE_SIZE = 20;

export function IncidentList() {
  const params = useAppStore((s) => s.params);

  const validStatuses: string[] = ["OPEN", ...INCIDENT_STATUSES];
  const [status, setStatus] = useState(() =>
    validStatuses.includes(params.status ?? "") ? params.status : "OPEN",
  );
  const [severity, setSeverity] = useState(
    (INCIDENT_SEVERITIES as readonly string[]).includes(params.severity ?? "") ? params.severity : "",
  );
  const [websiteId] = useState(params.websiteId ?? "");
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState(params.q ?? "");
  const debouncedSearch = useDebouncedValue(searchInput);
  const [createOpen, setCreateOpen] = useState(params.create === "1");

  const setFilter = (patch: { status?: string; severity?: string }) => {
    if (patch.status !== undefined) setStatus(patch.status);
    if (patch.severity !== undefined) setSeverity(patch.severity);
    setPage(1);
  };

  const listQueryKey = useMemo(
    () => ["incidents", { page, search: debouncedSearch, status, severity, websiteId }] as const,
    [page, debouncedSearch, status, severity, websiteId],
  );

  const listQuery = useQuery({
    queryKey: listQueryKey,
    queryFn: () =>
      apiFetch<Paginated<IncidentRecord>>(
        `/api/incidents${buildQuery({
          page,
          pageSize: PAGE_SIZE,
          q: debouncedSearch || undefined,
          // "OPEN" is a virtual filter = every not-yet-resolved status.
          status: status || undefined,
          severity: severity || undefined,
          websiteId: websiteId || undefined,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const pageCount = listQuery.data?.pageCount ?? 1;
  const hasActiveFilters = status !== "OPEN" || !!severity || !!debouncedSearch || !!websiteId;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {listQuery.isLoading
            ? "Loading incidents…"
            : `${total} ${total === 1 ? "incident" : "incidents"}${
                status === "OPEN" ? " (all open statuses)" : ""
              }`}
        </p>
        <Button onClick={() => setCreateOpen(true)} className="min-h-9">
          <Plus aria-hidden />
          New incident
        </Button>
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
            placeholder="Search number or title…"
            aria-label="Search incidents"
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Select value={status} onValueChange={(value) => setFilter({ status: value })}>
            <SelectTrigger className="w-full lg:w-48" aria-label="Status filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="OPEN">Open (not resolved)</SelectItem>
              <SelectItem value="all">All statuses</SelectItem>
              {INCIDENT_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {label(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={severity || "all"}
            onValueChange={(value) => setFilter({ severity: value === "all" ? "" : value })}
          >
            <SelectTrigger className="w-full lg:w-44" aria-label="Severity filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              {INCIDENT_SEVERITIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {label(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {listQuery.isLoading ? (
        <IncidentListSkeleton />
      ) : listQuery.isError ? (
        <EmptyState
          icon={SearchX}
          title="Incidents could not be loaded"
          description={(listQuery.error as Error)?.message ?? "Something went wrong."}
          action={
            <Button variant="outline" onClick={() => void listQuery.refetch()}>
              Try again
            </Button>
          }
        />
      ) : total === 0 && !hasActiveFilters ? (
        <EmptyState
          icon={ShieldAlert}
          title="No open incidents"
          description="Nothing is currently breaking. Auto-detected incidents appear here the moment monitoring sees a website go down."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden />
              New incident
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ListX}
          title="No incidents match the current filters"
          description="Try widening the filters or clearing the search."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setStatus("OPEN");
                setSeverity("");
                setSearchInput("");
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
                  <TableHead className="w-24">Incident</TableHead>
                  <TableHead className="w-32">Severity</TableHead>
                  <TableHead className="w-44">Status</TableHead>
                  <TableHead>Title &amp; websites</TableHead>
                  <TableHead className="w-20 text-right">Tickets</TableHead>
                  <TableHead className="w-28">Detected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((incident) => (
                  <TableRow
                    key={incident.id}
                    onClick={() => openIncident(incident.id)}
                    className="record-row cursor-pointer"
                  >
                    <TableCell>
                      <IncidentNumberChip number={incident.number} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={incident.severity} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={incident.status} />
                    </TableCell>
                    <TableCell className="max-w-md">
                      <p className="truncate text-sm font-medium">{incident.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1">
                        {(incident.websites ?? []).map((link) => (
                          <span
                            key={link.id}
                            className="inline-flex max-w-40 items-center rounded-full border bg-muted/60 px-2 py-px text-[11px] text-muted-foreground"
                          >
                            <span className="truncate">{link.website?.name ?? "Website"}</span>
                          </span>
                        ))}
                        {incident.autoCreated ? (
                          <span className="inline-flex items-center rounded-full border border-dashed px-1.5 py-px text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                            Auto
                          </span>
                        ) : null}
                      </p>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {incident._count?.tickets ?? incident.tickets?.length ?? 0}
                    </TableCell>
                    <TableCell
                      className="text-sm whitespace-nowrap text-muted-foreground"
                      title={incident.detectedAt}
                    >
                      {timeAgo(incident.detectedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="grid gap-2 md:hidden">
            {items.map((incident) => (
              <button
                key={incident.id}
                type="button"
                onClick={() => openIncident(incident.id)}
                className="flex min-h-11 items-start justify-between gap-3 rounded-xl border bg-card p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <IncidentNumberChip number={incident.number} />
                    <StatusBadge value={incident.severity} />
                    <StatusBadge value={incident.status} />
                  </span>
                  <span className="mt-1.5 block text-sm font-medium">{incident.title}</span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">
                    {(incident.websites ?? []).map((link) => link.website?.name ?? "").join(", ") ||
                      "No websites linked"}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Detected {timeAgo(incident.detectedAt)} ·{" "}
                    {incident._count?.tickets ?? incident.tickets?.length ?? 0} ticket
                    {(incident._count?.tickets ?? 0) === 1 ? "" : "s"}
                  </span>
                </span>
              </button>
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

      <IncidentFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        presetWebsiteId={websiteId || undefined}
      />
    </div>
  );
}
