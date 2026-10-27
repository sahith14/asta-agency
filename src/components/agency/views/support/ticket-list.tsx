"use client";

/**
 * AgencyOS — ticket list (Support workspace, task 3-b).
 *
 * Filter bar: debounced search, status (All / Open shortcut / 7 statuses),
 * priority, client → website cascade, assignee, awaiting-reply toggle,
 * sort + direction. Filters are local state seeded ONCE from store params
 * (status / priority / clientId / clientName / awaitingReply deep links).
 *
 * Rows navigate to the ticket detail via openTicket(). The create dialog
 * navigates to the new ticket on success.
 */
import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ArrowDownUp,
  Clock,
  Inbox,
  LifeBuoy,
  ListX,
  Mail,
  Plus,
  Search,
  SearchX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { EmptyState } from "@/components/agency/shared/empty-state";
import { PageHeader } from "@/components/agency/shared/page-header";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { buildQuery } from "@/components/agency/shared/record-list-helpers";
import { openTicket, useAppStore } from "@/components/agency/store";
import {
  apiFetch,
  label,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type Paginated,
  type TicketRecord,
} from "@/lib/types";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  useClientsLookup,
  useDebouncedValue,
  useRefName,
  useUsersLookup,
  useWebsitesLookup,
} from "@/components/agency/views/tasks/lookups";
import { ListPagination } from "@/components/agency/views/tasks/list-pagination";
import { FilterChip, PriorityDot, TicketNumberChip } from "@/components/agency/views/support/list-bits";
import { TicketFormDialog } from "@/components/agency/views/support/ticket-form-dialog";

const PAGE_SIZE = 25;
const OPEN_STATUS_CSV = "NEW,OPEN,IN_PROGRESS,WAITING_CLIENT,WAITING_THIRD_PARTY";
const ACTIVE_STATUSES = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_CLIENT", "WAITING_THIRD_PARTY"];

type StatusChoice = "all" | "open" | (typeof TICKET_STATUSES)[number];
type SortChoice = "lastActivity" | "newest" | "oldest" | "priority" | "number";

interface TicketFilters {
  status: StatusChoice;
  priority: string;
  clientId: string;
  websiteId: string;
  assigneeId: string;
  awaitingReply: boolean;
  sort: SortChoice;
  dir: "asc" | "desc";
}

const DEFAULT_FILTERS: TicketFilters = {
  status: "all",
  priority: "",
  clientId: "",
  websiteId: "",
  assigneeId: "",
  awaitingReply: false,
  sort: "lastActivity",
  dir: "desc",
};

const SORT_PARAM: Record<SortChoice, string> = {
  lastActivity: "lastActivityAt",
  newest: "createdAt",
  oldest: "createdAt",
  priority: "priority",
  number: "number",
};

const SORT_DEFAULT_DIR: Record<SortChoice, "asc" | "desc"> = {
  lastActivity: "desc",
  newest: "desc",
  oldest: "asc",
  priority: "asc",
  number: "desc",
};

export function TicketList() {
  const params = useAppStore((s) => s.params);
  const navigate = useAppStore((s) => s.navigate);

  const [filters, setFilters] = useState<TicketFilters>(() => ({
    ...DEFAULT_FILTERS,
    status:
      params.status === "open"
        ? "open"
        : (TICKET_STATUSES as readonly string[]).includes(params.status ?? "")
          ? (params.status as StatusChoice)
          : DEFAULT_FILTERS.status,
    priority: (TICKET_PRIORITIES as readonly string[]).includes(params.priority ?? "")
      ? params.priority
      : "",
    clientId: params.clientId ?? "",
    awaitingReply: params.awaitingReply === "1",
  }));
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput);
  const [createOpen, setCreateOpen] = useState(false);

  const setFilter = (patch: Partial<TicketFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };

  const statusParam =
    filters.status === "open"
      ? OPEN_STATUS_CSV
      : filters.status === "all"
        ? undefined
        : filters.status;

  const listQueryKey = useMemo(
    () =>
      [
        "tickets",
        {
          page,
          search: debouncedSearch,
          status: statusParam ?? "",
          priority: filters.priority,
          clientId: filters.clientId,
          websiteId: filters.websiteId,
          assigneeId: filters.assigneeId,
          awaitingReply: filters.awaitingReply,
          sort: SORT_PARAM[filters.sort],
          dir: filters.dir,
        },
      ] as const,
    [
      page,
      debouncedSearch,
      statusParam,
      filters.priority,
      filters.clientId,
      filters.websiteId,
      filters.assigneeId,
      filters.awaitingReply,
      filters.sort,
      filters.dir,
    ],
  );

  const listQuery = useQuery({
    queryKey: listQueryKey,
    queryFn: () =>
      apiFetch<Paginated<TicketRecord>>(
        `/api/tickets${buildQuery({
          page,
          pageSize: PAGE_SIZE,
          search: debouncedSearch || undefined,
          status: statusParam,
          priority: filters.priority || undefined,
          clientId: filters.clientId || undefined,
          websiteId: filters.websiteId || undefined,
          assigneeId: filters.assigneeId || undefined,
          awaitingReply: filters.awaitingReply ? "1" : undefined,
          sort: SORT_PARAM[filters.sort],
          dir: filters.dir,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });

  // Lightweight totals for the header description.
  const metaQuery = useQuery({
    queryKey: ["tickets", "meta"],
    queryFn: async () => {
      const [open, awaiting] = await Promise.all([
        apiFetch<Paginated<TicketRecord>>(`/api/tickets${buildQuery({ status: OPEN_STATUS_CSV, pageSize: 5 })}`),
        apiFetch<Paginated<TicketRecord>>(`/api/tickets${buildQuery({ awaitingReply: "1", pageSize: 5 })}`),
      ]);
      return { open: open.total, awaiting: awaiting.total };
    },
    staleTime: 30_000,
  });

  const clients = useClientsLookup();
  const websites = useWebsitesLookup(filters.clientId);
  const users = useUsersLookup();

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const pageCount = listQuery.data?.pageCount ?? 1;
  const hasActiveFilters =
    !!debouncedSearch ||
    filters.status !== "all" ||
    !!filters.priority ||
    !!filters.clientId ||
    !!filters.websiteId ||
    !!filters.assigneeId ||
    filters.awaitingReply;

  const clientChipName = useRefName("client", filters.clientId || null, params.clientName);

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setSearchInput("");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support"
        description={
          metaQuery.data
            ? `${metaQuery.data.open} open tickets · ${metaQuery.data.awaiting} awaiting reply`
            : "Customer support tickets."
        }
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden />
            New ticket
          </Button>
        }
      />

      {/* Filter bar */}
      <div className="space-y-3">
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
              placeholder="Search tickets…"
              aria-label="Search tickets"
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={filters.sort}
              onValueChange={(value) => {
                const sort = value as SortChoice;
                setFilter({ sort, dir: SORT_DEFAULT_DIR[sort] });
              }}
            >
              <SelectTrigger className="w-full lg:w-44" aria-label="Sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lastActivity">Sort: Last activity</SelectItem>
                <SelectItem value="newest">Sort: Newest</SelectItem>
                <SelectItem value="oldest">Sort: Oldest</SelectItem>
                <SelectItem value="priority">Sort: Priority</SelectItem>
                <SelectItem value="number">Sort: Ticket no.</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              aria-label={`Sort direction: ${filters.dir === "desc" ? "descending" : "ascending"}`}
              title={`Sort direction: ${filters.dir === "desc" ? "descending" : "ascending"}`}
              onClick={() => setFilter({ dir: filters.dir === "desc" ? "asc" : "desc" })}
            >
              <ArrowDownUp aria-hidden />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:flex-wrap lg:w-auto">
          <Select
            value={filters.status}
            onValueChange={(value) => setFilter({ status: value as StatusChoice })}
          >
            <SelectTrigger className="w-full lg:w-44" aria-label="Status filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="open">Open (active)</SelectItem>
              {TICKET_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {label(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.priority || "all"}
            onValueChange={(value) => setFilter({ priority: value === "all" ? "" : value })}
          >
            <SelectTrigger className="w-full lg:w-40" aria-label="Priority filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              {TICKET_PRIORITIES.map((priority) => (
                <SelectItem key={priority} value={priority}>
                  {label(priority)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.clientId || "all"}
            onValueChange={(value) => setFilter({ clientId: value === "all" ? "" : value, websiteId: "" })}
          >
            <SelectTrigger className="w-full lg:w-44" aria-label="Client filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clients</SelectItem>
              {(clients.data ?? []).map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.businessName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.websiteId || "all"}
            onValueChange={(value) => setFilter({ websiteId: value === "all" ? "" : value })}
          >
            <SelectTrigger className="w-full lg:w-44" aria-label="Website filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All websites</SelectItem>
              {(websites.data ?? []).map((website) => (
                <SelectItem key={website.id} value={website.id}>
                  {website.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.assigneeId || "all"}
            onValueChange={(value) => setFilter({ assigneeId: value === "all" ? "" : value })}
          >
            <SelectTrigger className="w-full lg:w-40" aria-label="Assignee filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All assignees</SelectItem>
              {(users.data ?? []).map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            aria-pressed={filters.awaitingReply}
            onClick={() => setFilter({ awaitingReply: !filters.awaitingReply })}
            className={cn(
              "justify-start gap-2 lg:justify-center",
              filters.awaitingReply && "border-warning/50 bg-warning/15 text-warning-foreground",
            )}
          >
            <Clock aria-hidden />
            Awaiting reply
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {filters.clientId ? (
            <FilterChip
              text={`Client: ${clientChipName ?? "loading…"}`}
              onRemove={() => setFilter({ clientId: "", websiteId: "" })}
            />
          ) : null}
        </div>
      </div>

      {/* List */}
      {listQuery.isLoading ? (
        <ListSkeleton />
      ) : listQuery.isError ? (
        <EmptyState
          icon={SearchX}
          title="Tickets could not be loaded"
          description={(listQuery.error as Error)?.message ?? "Something went wrong."}
          action={
            <Button variant="outline" onClick={() => listQuery.refetch()}>
              Try again
            </Button>
          }
        />
      ) : total === 0 && !hasActiveFilters ? (
        <EmptyState
          icon={LifeBuoy}
          title="No tickets yet"
          description="Tickets appear here when you create one manually or convert a reviewed email from the Inbox."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button onClick={() => setCreateOpen(true)}>
                <Plus aria-hidden />
                Create your first ticket
              </Button>
              <Button variant="outline" onClick={() => navigate("inbox")}>
                <Inbox aria-hidden />
                Open Inbox
              </Button>
            </div>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ListX}
          title="No tickets match the current filters"
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
                  <TableHead>Ticket</TableHead>
                  <TableHead className="w-36">Status</TableHead>
                  <TableHead className="w-28">Priority</TableHead>
                  <TableHead className="w-36">Assignee</TableHead>
                  <TableHead className="w-24">Messages</TableHead>
                  <TableHead className="w-32">Last activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((ticket) => (
                  <TableRow key={ticket.id} onClick={() => openTicket(ticket.id)} className="cursor-pointer">
                    <TableCell className="max-w-md">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <TicketNumberChip number={ticket.number} />
                          <p className="truncate text-sm font-medium">{ticket.subject}</p>
                        </div>
                        {ticket.client ? (
                          <p className="truncate text-xs text-muted-foreground">
                            {ticket.client.businessName}
                          </p>
                        ) : null}
                        {ticket.awaitingReply && ACTIVE_STATUSES.includes(ticket.status) ? (
                          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-warning-foreground">
                            <span aria-hidden className="size-1.5 rounded-full bg-warning" />
                            Awaiting reply
                          </p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={ticket.status} />
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap">
                        <PriorityDot priority={ticket.priority} />
                        {label(ticket.priority)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="truncate text-sm text-muted-foreground">
                        {ticket.assignee?.displayName ?? "Unassigned"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                        <Mail aria-hidden className="size-3.5" />
                        {ticket._count?.messages ?? 0}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs whitespace-nowrap text-muted-foreground">
                        {timeAgo(ticket.lastActivityAt)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="grid gap-2 md:hidden">
            {items.map((ticket) => (
              <div
                key={ticket.id}
                role="button"
                tabIndex={0}
                onClick={() => openTicket(ticket.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openTicket(ticket.id);
                  }
                }}
                className="flex items-start gap-3 rounded-xl border bg-card p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <TicketNumberChip number={ticket.number} />
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">{ticket.subject}</p>
                  </div>
                  {ticket.client ? (
                    <p className="truncate text-xs text-muted-foreground">{ticket.client.businessName}</p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge value={ticket.status} />
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                      <PriorityDot priority={ticket.priority} />
                      {label(ticket.priority)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{ticket.assignee?.displayName ?? "Unassigned"}</span>
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Mail aria-hidden className="size-3" />
                      {ticket._count?.messages ?? 0}
                    </span>
                    <span>{timeAgo(ticket.lastActivityAt)}</span>
                  </div>
                  {ticket.awaitingReply && ACTIVE_STATUSES.includes(ticket.status) ? (
                    <p className="inline-flex items-center gap-1.5 text-xs font-medium text-warning-foreground">
                      <span aria-hidden className="size-1.5 rounded-full bg-warning" />
                      Awaiting reply
                    </p>
                  ) : null}
                </div>
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

      {/* Create dialog — navigates to the new ticket on success */}
      <TicketFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={(created) => openTicket(created.id)}
      />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2" aria-busy>
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-xl border bg-card p-4">
          <Skeleton className="h-5 w-20" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}
