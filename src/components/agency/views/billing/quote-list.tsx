"use client";

/**
 * AgencyOS — Billing › Quotes tab (list).
 * Filter bar: debounced search, status, client, sort. Rows navigate to the
 * quote detail. Expiry dates inside 7 days of a SENT quote are highlighted.
 */
import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { FileText, ListX, Plus, Search, SearchX } from "lucide-react";
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
import { openQuote, useAppStore } from "@/components/agency/store";
import { apiFetch, QUOTE_STATUSES, label, type Paginated, type QuoteRecord } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useClientsLookup, useDebouncedValue } from "@/components/agency/views/tasks/lookups";
import { ListPagination } from "@/components/agency/views/tasks/list-pagination";
import { BillingListSkeleton, MoneyText } from "@/components/agency/views/billing/bits";
import { QuoteFormDialog } from "@/components/agency/views/billing/quote-form-dialog";

const PAGE_SIZE = 20;

type SortChoice = "newest" | "issue" | "expiry";

const SORT_PARAM: Record<SortChoice, string> = {
  newest: "createdAt",
  issue: "issueDate",
  expiry: "expiryDate",
};

/** True when a SENT quote expires within 7 days. */
function expiringSoon(quote: QuoteRecord): boolean {
  if (quote.status !== "SENT" || !quote.expiryDate) return false;
  const expiry = new Date(quote.expiryDate).getTime();
  if (Number.isNaN(expiry)) return false;
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  return expiry - Date.now() <= sevenDays;
}

interface QuoteFilters {
  status: string;
  clientId: string;
  sort: SortChoice;
}

export function QuoteList() {
  const params = useAppStore((s) => s.params);

  const [filters, setFilters] = useState<QuoteFilters>(() => ({
    status: (QUOTE_STATUSES as readonly string[]).includes(params.status ?? "")
      ? params.status
      : "",
    clientId: params.clientId ?? "",
    sort: "newest",
  }));
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState(params.q ?? "");
  const debouncedSearch = useDebouncedValue(searchInput);
  const [createOpen, setCreateOpen] = useState(false);

  const setFilter = (patch: Partial<QuoteFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };

  const listQueryKey = useMemo(
    () =>
      [
        "quotes",
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
      apiFetch<Paginated<QuoteRecord>>(
        `/api/billing/quotes${buildQuery({
          page,
          pageSize: PAGE_SIZE,
          q: debouncedSearch || undefined,
          status: filters.status || undefined,
          clientId: filters.clientId || undefined,
          sort: SORT_PARAM[filters.sort],
          dir: "desc",
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
    setFilters({ status: "", clientId: "", sort: "newest" });
    setSearchInput("");
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {/* Tab toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {listQuery.isLoading
            ? "Loading quotes…"
            : `${total} ${total === 1 ? "quote" : "quotes"}`}
        </p>
        <Button onClick={() => setCreateOpen(true)} className="min-h-9">
          <Plus aria-hidden />
          New quote
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
            placeholder="Search quotes…"
            aria-label="Search quotes"
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
              {QUOTE_STATUSES.map((status) => (
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
            <SelectTrigger className="w-full lg:w-40" aria-label="Sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Sort: Newest</SelectItem>
              <SelectItem value="issue">Sort: Issue date</SelectItem>
              <SelectItem value="expiry">Sort: Expiry</SelectItem>
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
          title="Quotes could not be loaded"
          description={(listQuery.error as Error)?.message ?? "Something went wrong."}
          action={
            <Button variant="outline" onClick={() => void listQuery.refetch()}>
              Try again
            </Button>
          }
        />
      ) : total === 0 && !hasActiveFilters ? (
        <EmptyState
          icon={FileText}
          title="No quotes yet"
          description="Draft a quote with line items, then mark it as sent once you have delivered it to the client."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden />
              New quote
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ListX}
          title="No quotes match the current filters"
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
                  <TableHead>Quote</TableHead>
                  <TableHead className="w-36">Status</TableHead>
                  <TableHead className="w-28">Issued</TableHead>
                  <TableHead className="w-28">Valid until</TableHead>
                  <TableHead className="w-32 text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((quote) => (
                  <TableRow
                    key={quote.id}
                    onClick={() => openQuote(quote.id)}
                    className="record-row cursor-pointer"
                  >
                    <TableCell className="max-w-md">
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">{quote.displayNumber}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {quote.client?.businessName ?? "—"}
                          {quote.project ? ` · ${quote.project.name}` : ""}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={quote.status} />
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                      {formatDate(quote.issueDate)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-sm whitespace-nowrap",
                        expiringSoon(quote)
                          ? "font-medium text-warning-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {formatDate(quote.expiryDate)}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      <MoneyText minor={quote.totalMinor} currency={quote.currency} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="grid gap-2 md:hidden">
            {items.map((quote) => (
              <button
                key={quote.id}
                type="button"
                onClick={() => openQuote(quote.id)}
                className="flex min-h-11 items-start justify-between gap-3 rounded-xl border bg-card p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{quote.displayNumber}</span>
                    <StatusBadge value={quote.status} />
                  </span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">
                    {quote.client?.businessName ?? "—"}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Issued {formatDate(quote.issueDate)} · Valid until{" "}
                    <span className={cn(expiringSoon(quote) && "font-medium text-warning-foreground")}>
                      {formatDate(quote.expiryDate)}
                    </span>
                  </span>
                </span>
                <MoneyText
                  minor={quote.totalMinor}
                  currency={quote.currency}
                  className="shrink-0 text-sm font-medium"
                />
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

      <QuoteFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={(created) => openQuote(created.id)}
      />
    </div>
  );
}
