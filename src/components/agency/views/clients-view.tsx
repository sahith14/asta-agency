"use client";

/**
 * AgencyOS — Clients view. Handles BOTH modes from the registry:
 * - view.name === "clients"        → paginated, filterable list (below)
 * - view.name === "client-detail"  → <ClientDetail /> (params.id)
 *
 * Filter-state contract: filters live in LOCAL state, seeded ONCE from store
 * params via useState initializers (the shell re-keys content per navigation,
 * so KPI-driven params like {status:"ACTIVE"} or {archived:"1"} re-seed on
 * mount). Nothing is written back to the store except the Archived toggle,
 * which navigates with the archived flag — history stays clean.
 *
 * params.create CONVENTION: `create=1` auto-opens the create dialog on mount
 * (used by the dashboard quick actions; 4-b/4-c follow the same pattern).
 */
import { useEffect, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  ChevronRight,
  Eye,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  apiFetch,
  CLIENT_STATUSES,
  CLIENT_TYPES,
  label,
  type ClientRecord,
  type Paginated,
} from "@/lib/types";
import { timeAgo } from "@/lib/format";
import { openClient, useAppStore } from "@/components/agency/store";
import { PageHeader } from "@/components/agency/shared/page-header";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { ConfirmDialog } from "@/components/agency/shared/confirm-dialog";
import { buildQuery } from "@/components/agency/shared/record-list-helpers";
import { ListPagination } from "@/components/agency/views/dashboard/list-pagination";
import { ClientFormDialog } from "@/components/agency/views/clients/client-form-dialog";
import { ClientDetail } from "@/components/agency/views/clients/client-detail";
import { SampleBadge } from "@/components/agency/views/clients/sample-badge";

const PAGE_SIZE = 20;

const SORT_CHOICES = {
  newest: { sort: "createdAt", dir: "desc" },
  oldest: { sort: "createdAt", dir: "asc" },
  "name-asc": { sort: "businessName", dir: "asc" },
  "name-desc": { sort: "businessName", dir: "desc" },
} as const;

type SortChoice = keyof typeof SORT_CHOICES;

function sortChoiceFromParams(params: Record<string, string>): SortChoice {
  if (params.sort === "businessName") return params.dir === "asc" ? "name-asc" : "name-desc";
  if (params.sort === "createdAt" && params.dir === "asc") return "oldest";
  return "newest";
}

function initialPage(params: Record<string, string>): number {
  const parsed = Number.parseInt(params.page ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default function ClientsView() {
  const view = useAppStore((s) => s.view);
  return view === "client-detail" ? <ClientDetail /> : <ClientsList />;
}

function ClientsList() {
  const params = useAppStore((s) => s.params);
  const navigate = useAppStore((s) => s.navigate);
  const queryClient = useQueryClient();

  // ── Local filter state, seeded once from the store params ──────────
  const [searchInput, setSearchInput] = useState(params.search ?? "");
  const [search, setSearch] = useState(params.search ?? "");
  const [status, setStatus] = useState(params.status ?? "all");
  const [type, setType] = useState(params.type ?? "all");
  const [sortChoice, setSortChoice] = useState<SortChoice>(() => sortChoiceFromParams(params));
  const [page, setPage] = useState(() => initialPage(params));
  const archived = params.archived === "1";

  // Debounced search (300ms) — never pushed into navigation history.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // ── Dialog state ───────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(params.create === "1");
  const [editing, setEditing] = useState<ClientRecord | null>(null);
  const [archiving, setArchiving] = useState<ClientRecord | null>(null);
  const [restoring, setRestoring] = useState<ClientRecord | null>(null);
  const [rowBusy, setRowBusy] = useState(false);

  const sortFor = SORT_CHOICES[sortChoice];
  const hasFilters = search !== "" || status !== "all" || type !== "all";

  const clientsQuery = useQuery({
    queryKey: ["clients", { search, status, type, sortChoice, archived, page }],
    queryFn: () =>
      apiFetch<Paginated<ClientRecord>>(
        `/api/clients${buildQuery({
          page,
          pageSize: PAGE_SIZE,
          search: search || undefined,
          status: status !== "all" ? status : undefined,
          type: type !== "all" ? type : undefined,
          sort: sortFor.sort,
          dir: sortFor.dir,
          archived: archived ? "1" : undefined,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });

  const items = clientsQuery.data?.items ?? [];
  const total = clientsQuery.data?.total ?? 0;
  const pageCount = clientsQuery.data?.pageCount ?? 1;
  const isFiltered = hasFilters || archived;

  function clearFilters() {
    setSearchInput("");
    setSearch("");
    setStatus("all");
    setType("all");
    setSortChoice("newest");
    setPage(1);
  }

  function toggleArchived() {
    navigate("clients", archived ? {} : { archived: "1" });
  }

  async function archiveClient() {
    if (!archiving) return;
    setRowBusy(true);
    try {
      await apiFetch(`/api/clients/${archiving.id}`, { method: "DELETE" });
      toast.success(`Archived ${archiving.businessName}`, {
        description: "Historical records are preserved. Restore it any time.",
      });
      invalidateShared();
    } catch (err) {
      toast.error((err as Error).message || "Could not archive the client.");
    } finally {
      setRowBusy(false);
      setArchiving(null);
    }
  }

  async function restoreClient() {
    if (!restoring) return;
    setRowBusy(true);
    try {
      await apiFetch(`/api/clients/${restoring.id}/restore`, { method: "POST" });
      toast.success(`Restored ${restoring.businessName}`);
      invalidateShared();
    } catch (err) {
      toast.error((err as Error).message || "Could not restore the client.");
    } finally {
      setRowBusy(false);
      setRestoring(null);
    }
  }

  function invalidateShared() {
    void queryClient.invalidateQueries({ queryKey: ["clients"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["activity"] });
  }

  function rowMenu(row: ClientRecord) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`Actions for ${row.businessName}`}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onSelect={() => openClient(row.id)}>
            <Eye aria-hidden />
            View
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setEditing(row)}>
            <Pencil aria-hidden />
            Edit
          </DropdownMenuItem>
          {row.archivedAt ? (
            <DropdownMenuItem onSelect={() => setRestoring(row)}>
              <ArchiveRestore aria-hidden />
              Restore
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem variant="destructive" onSelect={() => setArchiving(row)}>
              <Archive aria-hidden />
              Archive
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Clients"
        description={
          clientsQuery.isLoading
            ? "Loading…"
            : archived
              ? `${total} archived ${total === 1 ? "client" : "clients"}`
              : `${total} ${total === 1 ? "client" : "clients"}`
        }
        actions={
          <>
            <Button
              variant={archived ? "secondary" : "outline"}
              aria-pressed={archived}
              onClick={toggleArchived}
            >
              <Archive aria-hidden />
              {archived ? "Viewing archived" : "Archived"}
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden />
              New client
            </Button>
          </>
        }
      />

      {/* Filter bar */}
      <div className="rounded-xl border bg-card p-3 sm:p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="relative">
            <Search
              aria-hidden
              className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search business name, email, phone…"
              aria-label="Search clients"
              className="pl-8"
            />
          </div>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {CLIENT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {label(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={type}
            onValueChange={(v) => {
              setType(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full" aria-label="Filter by type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {CLIENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {label(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortChoice} onValueChange={(v) => setSortChoice(v as SortChoice)}>
            <SelectTrigger className="w-full" aria-label="Sort clients">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="name-asc">Name A–Z</SelectItem>
              <SelectItem value="name-desc">Name Z–A</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-xl border bg-card">
        {clientsQuery.isError ? (
          <EmptyState
            icon={Users}
            title="Could not load clients"
            description="Check your connection and try again."
            action={
              <Button variant="outline" onClick={() => void clientsQuery.refetch()}>
                Retry
              </Button>
            }
            className="border-0"
          />
        ) : clientsQuery.isLoading ? (
          <>
            {/* Desktop skeleton */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">Business</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">W·P·T</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell className="pl-4">
                        <Skeleton className="h-8 w-40" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-36" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-16" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="ml-auto h-4 w-14" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {/* Mobile skeleton */}
            <div className="space-y-3 p-3 md:hidden" aria-busy aria-label="Loading clients">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))}
            </div>
          </>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Users}
            title={
              archived
                ? "No archived clients"
                : hasFilters
                  ? "No clients match your filters"
                  : "No clients yet"
            }
            description={
              archived
                ? "Clients you archive will appear here."
                : hasFilters
                  ? "Try a different search, or clear the filters to see everyone."
                  : "Create your first client to start building the workspace."
            }
            action={
              archived ? (
                <Button variant="outline" onClick={toggleArchived}>
                  Back to active clients
                </Button>
              ) : hasFilters ? (
                <Button variant="outline" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : (
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus aria-hidden />
                  Create your first client
                </Button>
              )
            }
            className="border-0"
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">Business</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right" title="Websites / Projects / Tasks">
                      W·P·T
                    </TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((row) => (
                    <TableRow
                      key={row.id}
                      className="record-row group cursor-pointer"
                      onClick={() => openClient(row.id)}
                    >
                      <TableCell className="max-w-56 pl-4">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openClient(row.id);
                          }}
                          className="flex flex-col items-start text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="flex max-w-[210px] min-w-0 items-center gap-1.5 sm:max-w-[260px]">
                            <span className="truncate text-sm font-medium group-hover:text-primary">
                              {row.businessName}
                            </span>
                            {row.isSample ? <SampleBadge /> : null}
                          </span>
                          {row.primaryContactName ? (
                            <span className="max-w-44 truncate text-xs text-muted-foreground">
                              {row.primaryContactName}
                            </span>
                          ) : null}
                        </button>
                      </TableCell>
                      <TableCell>
                        {row.email || row.phone ? (
                          <span className="flex flex-col text-xs text-muted-foreground">
                            {row.email ? <span className="truncate">{row.email}</span> : null}
                            {row.phone ? <span className="tabular-nums">{row.phone}</span> : null}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {label(row.clientType)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge value={row.status} />
                      </TableCell>
                      <TableCell
                        className="text-right text-sm tabular-nums text-muted-foreground"
                        title="Websites / Projects / Tasks"
                      >
                        {row._count
                          ? `${row._count.websites} · ${row._count.projects} · ${row._count.tasks}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                        {timeAgo(row.updatedAt)}
                      </TableCell>
                      <TableCell className="pr-3">{rowMenu(row)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <div className="space-y-3 p-3 md:hidden">
              {items.map((row) => (
                <div
                  key={row.id}
                  className="record-row flex items-start justify-between gap-2 rounded-xl border p-4"
                >
                  <button
                    type="button"
                    onClick={() => openClient(row.id)}
                    className="min-w-0 flex-1 text-left outline-none"
                    aria-label={`Open ${row.businessName}`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{row.businessName}</span>
                      {row.isSample ? <SampleBadge /> : null}
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <StatusBadge value={row.status} />
                      <span className="text-xs text-muted-foreground">{label(row.clientType)}</span>
                    </span>
                    {row.email ? (
                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        {row.email}
                      </span>
                    ) : null}
                    <span className="mt-2.5 flex items-center gap-3 text-xs tabular-nums text-muted-foreground">
                      <span>{row._count?.websites ?? 0} websites</span>
                      <span>{row._count?.projects ?? 0} projects</span>
                      <span>{row._count?.tasks ?? 0} tasks</span>
                    </span>
                  </button>
                  <span className="flex shrink-0 items-center gap-0.5">
                    {rowMenu(row)}
                    <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
                  </span>
                </div>
              ))}
            </div>

            <ListPagination
              page={page}
              pageCount={pageCount}
              total={total}
              pageSize={PAGE_SIZE}
              onPage={setPage}
            />
          </>
        )}
      </div>

      {/* Dialogs */}
      {createOpen ? <ClientFormDialog key="create" open onOpenChange={setCreateOpen} /> : null}
      {editing ? (
        <ClientFormDialog
          key={`edit-${editing.id}-${editing.updatedAt}`}
          open
          client={editing}
          onOpenChange={(o) => {
            if (!o) setEditing(null);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={!!archiving}
        onOpenChange={(o) => {
          if (!o) setArchiving(null);
        }}
        title={`Archive ${archiving?.businessName ?? "client"}?`}
        description="Historical records are preserved. The client leaves the active list but can be restored from the Archived view at any time."
        confirmLabel="Archive"
        destructive
        loading={rowBusy}
        onConfirm={() => void archiveClient()}
      />
      <ConfirmDialog
        open={!!restoring}
        onOpenChange={(o) => {
          if (!o) setRestoring(null);
        }}
        title={`Restore ${restoring?.businessName ?? "client"}?`}
        description="The client will appear in the active Clients list again."
        confirmLabel="Restore"
        loading={rowBusy}
        onConfirm={() => void restoreClient()}
      />
    </div>
  );
}
