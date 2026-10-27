"use client";

/**
 * AgencyOS — briefs list (Phase 5).
 *
 * KPI row (honest counts via per-status totals), status filter chips, table
 * (number / client / status / owner / deadline / updated) and the "New brief"
 * dialog (client + title → POST /api/briefs → open the detail).
 */
import { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CircleAlert,
  ClipboardList,
  Eye,
  Info,
  Plus,
  SearchX,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { KpiCard } from "@/components/agency/shared/kpi-card";
import { buildQuery } from "@/components/agency/shared/record-list-helpers";
import { openBrief, openClient, useAppStore } from "@/components/agency/store";
import {
  apiFetch,
  BRIEF_STATUSES,
  label,
  type BriefRecord,
  type ClientRecord,
  type Paginated,
} from "@/lib/types";
import { formatDate, timeAgo } from "@/lib/format";

const PAGE_SIZE = 25;

/** KPI buckets — the four states that describe where a brief sits in the pipeline. */
const KPI_STATUSES = ["DRAFT", "NEEDS_INFORMATION", "READY_FOR_REVIEW", "APPROVED_FOR_MEETING"] as const;

export function BriefList() {
  const queryClient = useQueryClient();
  const params = useAppStore((s) => s.params);

  const [statusChip, setStatusChip] = useState<string>(() =>
    (BRIEF_STATUSES as readonly string[]).includes(params.status ?? "") ? params.status : "all",
  );
  const [createOpen, setCreateOpen] = useState(() => params.create === "1");

  const listQuery = useQuery({
    queryKey: ["briefs", "list", { statusChip }],
    queryFn: () =>
      apiFetch<Paginated<BriefRecord>>(
        `/api/briefs${buildQuery({
          status: statusChip === "all" ? undefined : statusChip,
          pageSize: PAGE_SIZE,
          sort: "updatedAt",
          dir: "desc",
        })}`,
      ),
    placeholderData: keepPreviousData,
  });

  // Honest KPI counts: one tiny request per bucket reads the server total.
  const kpiQuery = useQuery({
    queryKey: ["briefs", "kpis"],
    queryFn: async () => {
      const entries = await Promise.all(
        KPI_STATUSES.map(async (status) => {
          const data = await apiFetch<Paginated<BriefRecord>>(
            `/api/briefs${buildQuery({ status, pageSize: 1 })}`,
          );
          return [status, data.total] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<(typeof KPI_STATUSES)[number], number>;
    },
    staleTime: 30_000,
  });

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const hasFilter = statusChip !== "all";

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <section aria-label="Brief pipeline" className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {KPI_STATUSES.map((status) => (
          <KpiCard
            key={status}
            title={kpiLabel(status)}
            value={kpiQuery.data ? kpiQuery.data[status] : <Skeleton className="h-7 w-10" />}
            icon={kpiIcon(status)}
            hint={status === "APPROVED_FOR_MEETING" ? "approved — waiting for the meeting" : undefined}
            onClick={() => setStatusChip(status)}
          />
        ))}
      </section>

      {/* Filter chips + create */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={statusChip}
          onValueChange={(value) => value && setStatusChip(value)}
          className="flex-wrap gap-1.5"
          aria-label="Filter briefs by status"
        >
          <ToggleGroupItem value="all" className="flex-none whitespace-nowrap">
            All
          </ToggleGroupItem>
          {BRIEF_STATUSES.map((status) => (
            <ToggleGroupItem key={status} value={status} className="flex-none whitespace-nowrap">
              {label(status)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <Button onClick={() => setCreateOpen(true)} className="shrink-0">
          <Plus aria-hidden />
          New brief
        </Button>
      </div>

      {/* List */}
      {listQuery.isLoading ? (
        <ListSkeleton />
      ) : listQuery.isError ? (
        <EmptyState
          icon={CircleAlert}
          title="Briefs could not be loaded"
          description={(listQuery.error as Error)?.message ?? "Something went wrong."}
          action={
            <Button variant="outline" onClick={() => listQuery.refetch()}>
              Try again
            </Button>
          }
        />
      ) : total === 0 && !hasFilter ? (
        <EmptyState
          icon={ClipboardList}
          title="No briefs yet"
          description="Create a brief from a client record to capture the discovery call before the founder review."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden />
              Create the first brief
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No briefs match"
          description="No briefs have this status right now."
          action={
            <Button variant="outline" onClick={() => setStatusChip("all")}>
              Show all briefs
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
                  <TableHead className="w-24">Number</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="w-44">Client</TableHead>
                  <TableHead className="w-44">Status</TableHead>
                  <TableHead className="w-36">Owner</TableHead>
                  <TableHead className="w-32">Deadline</TableHead>
                  <TableHead className="w-32">Updated</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((brief) => (
                  <TableRow
                    key={brief.id}
                    onClick={() => openBrief(brief.id)}
                    className="cursor-pointer"
                  >
                    <TableCell className="font-mono text-xs font-medium">
                      {brief.displayNumber}
                    </TableCell>
                    <TableCell className="max-w-sm">
                      <p className="truncate text-sm font-medium">{brief.title ?? "Untitled brief"}</p>
                    </TableCell>
                    <TableCell>
                      {brief.client ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openClient(brief.client!.id);
                          }}
                          className="max-w-40 truncate text-sm text-muted-foreground hover:text-foreground hover:underline"
                        >
                          {brief.client.businessName}
                        </button>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={brief.status} />
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {brief.owner?.displayName ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm whitespace-nowrap">{formatDate(brief.deadline)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs whitespace-nowrap text-muted-foreground">
                        {timeAgo(brief.updatedAt)}
                      </span>
                    </TableCell>
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={`Open brief ${brief.displayNumber}`}
                        onClick={() => openBrief(brief.id)}
                      >
                        <Eye aria-hidden />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="grid gap-2 md:hidden">
            {items.map((brief) => (
              <div
                key={brief.id}
                role="button"
                tabIndex={0}
                onClick={() => openBrief(brief.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openBrief(brief.id);
                  }
                }}
                className="space-y-2 rounded-xl border bg-card p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-medium text-muted-foreground">
                    {brief.displayNumber}
                  </span>
                  <StatusBadge value={brief.status} />
                </div>
                <p className="text-sm leading-snug font-medium">{brief.title ?? "Untitled brief"}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="truncate">{brief.client?.businessName ?? "No client"}</span>
                  {brief.deadline ? <span>Due {formatDate(brief.deadline)}</span> : null}
                  <span>Updated {timeAgo(brief.updatedAt)}</span>
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            Showing {items.length} of {total} brief{total === 1 ? "" : "s"}.
          </p>
        </>
      )}

      <NewBriefDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function kpiLabel(status: string): string {
  switch (status) {
    case "DRAFT":
      return "Draft";
    case "NEEDS_INFORMATION":
      return "Needs info";
    case "READY_FOR_REVIEW":
      return "Ready for review";
    case "APPROVED_FOR_MEETING":
      return "Awaiting meeting";
    default:
      return label(status);
  }
}

function kpiIcon(status: string) {
  switch (status) {
    case "DRAFT":
      return ClipboardList;
    case "NEEDS_INFORMATION":
      return CircleAlert;
    case "READY_FOR_REVIEW":
      return Info;
    default:
      return UserRound;
  }
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, index) => (
        <Skeleton key={index} className="h-14 w-full rounded-xl" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New brief dialog — client + title only; the rest is captured on the detail.
// ---------------------------------------------------------------------------

function NewBriefDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const clients = useQuery({
    queryKey: ["clients", "lookup", "briefs"],
    queryFn: () =>
      apiFetch<Paginated<ClientRecord>>(
        `/api/clients${buildQuery({ pageSize: 100, sort: "businessName", dir: "asc" })}`,
      ),
    enabled: open,
    staleTime: 60_000,
    select: (data) => data.items,
  });

  const clientOptions = useMemo(
    () => (clients.data ?? []).filter((client) => !client.archivedAt),
    [clients.data],
  );

  async function create() {
    if (!clientId || !title.trim()) return;
    setBusy(true);
    try {
      const brief = await apiFetch<BriefRecord>("/api/briefs", {
        method: "POST",
        body: JSON.stringify({ clientId, title: title.trim() }),
      });
      toast.success(`Brief ${brief.displayNumber ?? ""} created`.trim());
      void queryClient.invalidateQueries({ queryKey: ["briefs"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onOpenChange(false);
      setClientId("");
      setTitle("");
      openBrief(brief.id);
    } catch (err) {
      toast.error((err as Error).message || "Could not create the brief.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New brief</DialogTitle>
          <DialogDescription>
            Pick the client and give the brief a working title — the sections are filled in on the
            brief page.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="brief-client">Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger id="brief-client" className="w-full" aria-label="Brief client">
                <SelectValue placeholder="Select a client" />
              </SelectTrigger>
              <SelectContent>
                {clientOptions.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">No clients yet.</div>
                ) : (
                  clientOptions.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.businessName}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="brief-title">Title</Label>
            <Input
              id="brief-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Website demo — The Corner Bakery"
              autoFocus
            />
          </div>
          <p className="text-xs text-muted-foreground">
            The brief starts in Draft. Only the founder can approve it for a meeting.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void create()} disabled={busy || !clientId || !title.trim()}>
            {busy ? "Creating…" : "Create brief"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
