"use client";

/**
 * AgencyOS — Billing › Subscriptions tab (list).
 * Rows: client, plan (or Custom), price per interval, status, next renewal
 * (red when past due and still ACTIVE), website. Filters: status / client.
 */
import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ListX, Plus, RefreshCw, Search, SearchX } from "lucide-react";
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
import { openSubscription, useAppStore } from "@/components/agency/store";
import {
  apiFetch,
  SUBSCRIPTION_STATUSES,
  label,
  type Paginated,
  type SubscriptionRecord,
} from "@/lib/types";
import { formatCurrency, formatDate, isOverdue } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useClientsLookup, useDebouncedValue } from "@/components/agency/views/tasks/lookups";
import { ListPagination } from "@/components/agency/views/tasks/list-pagination";
import {
  BillingListSkeleton,
  intervalNoun,
} from "@/components/agency/views/billing/bits";
import { SubscriptionFormDialog } from "@/components/agency/views/billing/subscription-form-dialog";

const PAGE_SIZE = 20;

type SortChoice = "newest" | "renewal";

const SORT_PARAM: Record<SortChoice, string> = {
  newest: "createdAt",
  renewal: "nextRenewalDate",
};

interface SubscriptionFilters {
  status: string;
  clientId: string;
  sort: SortChoice;
}

export function SubscriptionList() {
  const params = useAppStore((s) => s.params);

  const [filters, setFilters] = useState<SubscriptionFilters>(() => ({
    status: (SUBSCRIPTION_STATUSES as readonly string[]).includes(params.status ?? "")
      ? params.status
      : "",
    clientId: params.clientId ?? "",
    sort: "renewal",
  }));
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState(params.q ?? "");
  const debouncedSearch = useDebouncedValue(searchInput);
  const [createOpen, setCreateOpen] = useState(false);

  const setFilter = (patch: Partial<SubscriptionFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };

  const listQueryKey = useMemo(
    () =>
      [
        "subscriptions",
        {
          page,
          search: debouncedSearch,
          status: filters.status,
          clientId: filters.clientId,
          sort: SORT_PARAM[filters.sort],
        },
      ] as const,
    [page, debouncedSearch, filters.status, filters.clientId, filters.sort],
  );

  const listQuery = useQuery({
    queryKey: listQueryKey,
    queryFn: () =>
      apiFetch<Paginated<SubscriptionRecord>>(
        `/api/billing/subscriptions${buildQuery({
          page,
          pageSize: PAGE_SIZE,
          q: debouncedSearch || undefined,
          status: filters.status || undefined,
          clientId: filters.clientId || undefined,
          sort: SORT_PARAM[filters.sort],
          dir: filters.sort === "renewal" ? "asc" : "desc",
        })}`,
      ),
    placeholderData: keepPreviousData,
  });

  const clients = useClientsLookup();

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const pageCount = listQuery.data?.pageCount ?? 1;
  const hasActiveFilters = !!debouncedSearch || !!filters.status || !!filters.clientId;

  const clearFilters = () => {
    setFilters({ status: "", clientId: "", sort: "renewal" });
    setSearchInput("");
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {/* Tab toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {listQuery.isLoading
            ? "Loading subscriptions…"
            : `${total} ${total === 1 ? "subscription" : "subscriptions"}`}
        </p>
        <Button onClick={() => setCreateOpen(true)} className="min-h-9">
          <Plus aria-hidden />
          New subscription
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
            placeholder="Search subscriptions…"
            aria-label="Search subscriptions"
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Select
            value={filters.status || "all"}
            onValueChange={(value) => setFilter({ status: value === "all" ? "" : value })}
          >
            <SelectTrigger className="w-full lg:w-44" aria-label="Status filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {SUBSCRIPTION_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {label(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.clientId || "all"}
            onValueChange={(value) => setFilter({ clientId: value === "all" ? "" : value })}
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
            value={filters.sort}
            onValueChange={(value) => setFilter({ sort: value as SortChoice })}
          >
            <SelectTrigger className="w-full lg:w-48" aria-label="Sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="renewal">Sort: Next renewal</SelectItem>
              <SelectItem value="newest">Sort: Newest</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List */}
      {listQuery.isLoading ? (
        <BillingListSkeleton rows={6} />
      ) : listQuery.isError ? (
        <EmptyState
          icon={SearchX}
          title="Subscriptions could not be loaded"
          description={(listQuery.error as Error)?.message ?? "Something went wrong."}
          action={
            <Button variant="outline" onClick={() => void listQuery.refetch()}>
              Try again
            </Button>
          }
        />
      ) : total === 0 && !hasActiveFilters ? (
        <EmptyState
          icon={RefreshCw}
          title="No subscriptions yet"
          description="Create a recurring agreement from a plan in the Plans tab, or set a custom price."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden />
              New subscription
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ListX}
          title="No subscriptions match the current filters"
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
                  <TableHead>Subscription</TableHead>
                  <TableHead className="w-36">Status</TableHead>
                  <TableHead className="w-32">Price</TableHead>
                  <TableHead className="w-32">Next renewal</TableHead>
                  <TableHead className="w-40">Website</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((subscription) => (
                  <TableRow
                    key={subscription.id}
                    onClick={() => openSubscription(subscription.id)}
                    className="record-row cursor-pointer"
                  >
                    <TableCell className="max-w-md">
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">
                          {subscription.client?.businessName ?? "—"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {subscription.planName ?? "Custom"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={subscription.status} />
                    </TableCell>
                    <TableCell className="text-sm font-medium whitespace-nowrap tabular-nums">
                      {formatCurrency(subscription.agreedPriceMinor, subscription.currency)}
                      <span className="text-xs font-normal text-muted-foreground">
                        {" "}
                        / {intervalNoun(subscription.billingInterval)}
                      </span>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-sm whitespace-nowrap",
                        subscription.status === "ACTIVE" &&
                          isOverdue(subscription.nextRenewalDate)
                          ? "font-medium text-destructive"
                          : "text-muted-foreground",
                      )}
                    >
                      {formatDate(subscription.nextRenewalDate)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {subscription.website?.name ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="grid gap-2 md:hidden">
            {items.map((subscription) => (
              <button
                key={subscription.id}
                type="button"
                onClick={() => openSubscription(subscription.id)}
                className="flex min-h-11 items-start justify-between gap-3 rounded-xl border bg-card p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">
                      {subscription.client?.businessName ?? "—"}
                    </span>
                    <StatusBadge value={subscription.status} />
                  </span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">
                    {subscription.planName ?? "Custom"}
                    {subscription.website?.name ? ` · ${subscription.website.name}` : ""}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Renews{" "}
                    <span
                      className={cn(
                        subscription.status === "ACTIVE" && isOverdue(subscription.nextRenewalDate)
                          ? "font-medium text-destructive"
                          : "",
                      )}
                    >
                      {formatDate(subscription.nextRenewalDate)}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 text-sm font-medium tabular-nums">
                  {formatCurrency(subscription.agreedPriceMinor, subscription.currency)}
                  <span className="block text-xs font-normal text-muted-foreground">
                    / {intervalNoun(subscription.billingInterval)}
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

      <SubscriptionFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={(created) => openSubscription(created.id)}
      />
    </div>
  );
}
