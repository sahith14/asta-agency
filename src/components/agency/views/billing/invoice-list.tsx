"use client";

/**
 * AgencyOS — Billing › Invoices tab (list).
 *
 * Filter bar: debounced search, status (All / Draft / Issued / Partially paid /
 * Paid / Overdue / Void), client, sort (newest / issue date / due date) and
 * pagination. Filters are LOCAL state seeded ONCE from store params
 * (status / clientId / websiteId deep links, e.g. from dashboard KPI cards or
 * entity billing tabs).
 */
import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ListX, Plus, ReceiptText, Search, SearchX } from "lucide-react";
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
import { openInvoice, useAppStore } from "@/components/agency/store";
import { apiFetch, INVOICE_STATUSES, label, type InvoiceRecord, type Paginated } from "@/lib/types";
import { formatDate, isOverdue } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  useClientsLookup,
  useDebouncedValue,
} from "@/components/agency/views/tasks/lookups";
import { ListPagination } from "@/components/agency/views/tasks/list-pagination";
import { BillingListSkeleton, MoneyText } from "@/components/agency/views/billing/bits";
import { InvoiceFormDialog } from "@/components/agency/views/billing/invoice-form-dialog";

const PAGE_SIZE = 20;

type SortChoice = "newest" | "issue" | "due";

const SORT_PARAM: Record<SortChoice, string> = {
  newest: "createdAt",
  issue: "issueDate",
  due: "dueDate",
};

interface InvoiceFilters {
  status: string; // "" = all
  clientId: string;
  websiteId: string;
  sort: SortChoice;
}

export function InvoiceList() {
  const params = useAppStore((s) => s.params);

  const [filters, setFilters] = useState<InvoiceFilters>(() => ({
    status: (INVOICE_STATUSES as readonly string[]).includes(params.status ?? "")
      ? params.status
      : "",
    clientId: params.clientId ?? "",
    websiteId: params.websiteId ?? "",
    sort: "newest",
  }));
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState(params.q ?? "");
  const debouncedSearch = useDebouncedValue(searchInput);
  const [createOpen, setCreateOpen] = useState(false);

  const setFilter = (patch: Partial<InvoiceFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };

  const listQueryKey = useMemo(
    () =>
      [
        "invoices",
        {
          page,
          search: debouncedSearch,
          status: filters.status,
          clientId: filters.clientId,
          websiteId: filters.websiteId,
          sort: SORT_PARAM[filters.sort],
        },
      ] as const,
    [page, debouncedSearch, filters.status, filters.clientId, filters.websiteId, filters.sort],
  );

  const listQuery = useQuery({
    queryKey: listQueryKey,
    queryFn: () =>
      apiFetch<Paginated<InvoiceRecord>>(
        `/api/billing/invoices${buildQuery({
          page,
          pageSize: PAGE_SIZE,
          q: debouncedSearch || undefined,
          status: filters.status || undefined,
          clientId: filters.clientId || undefined,
          websiteId: filters.websiteId || undefined,
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
  const hasActiveFilters =
    !!debouncedSearch || !!filters.status || !!filters.clientId || !!filters.websiteId;

  const clearFilters = () => {
    setFilters({ status: "", clientId: "", websiteId: "", sort: "newest" });
    setSearchInput("");
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {/* Tab toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {listQuery.isLoading
            ? "Loading invoices…"
            : `${total} ${total === 1 ? "invoice" : "invoices"}`}
        </p>
        <Button onClick={() => setCreateOpen(true)} className="min-h-9">
          <Plus aria-hidden />
          New invoice
        </Button>
      </div>

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
              placeholder="Search invoices…"
              aria-label="Search invoices"
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
                {INVOICE_STATUSES.map((status) => (
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
                <SelectItem value="due">Sort: Due date</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* List */}
      {listQuery.isLoading ? (
        <BillingListSkeleton rows={6} />
      ) : listQuery.isError ? (
        <EmptyState
          icon={SearchX}
          title="Invoices could not be loaded"
          description={(listQuery.error as Error)?.message ?? "Something went wrong."}
          action={
            <Button variant="outline" onClick={() => void listQuery.refetch()}>
              Try again
            </Button>
          }
        />
      ) : total === 0 && !hasActiveFilters ? (
        <EmptyState
          icon={ReceiptText}
          title="No invoices yet"
          description="Draft an invoice manually or convert an accepted quote — invoices start as editable drafts until you issue them."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden />
              New invoice
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ListX}
          title="No invoices match the current filters"
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
                  <TableHead>Invoice</TableHead>
                  <TableHead className="w-40">Status</TableHead>
                  <TableHead className="w-28">Issued</TableHead>
                  <TableHead className="w-28">Due</TableHead>
                  <TableHead className="w-32 text-right">Total</TableHead>
                  <TableHead className="w-32 text-right">Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((invoice) => (
                  <TableRow
                    key={invoice.id}
                    onClick={() => openInvoice(invoice.id)}
                    className="record-row cursor-pointer"
                  >
                    <TableCell className="max-w-md">
                      <div className="space-y-0.5">
                        <p className="flex items-center gap-2 text-sm font-medium">
                          {invoice.displayNumber}
                          {invoice.kind === "RENEWAL" ? (
                            <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-px text-[11px] font-medium text-muted-foreground">
                              {label(invoice.kind)}
                            </span>
                          ) : null}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {invoice.client?.businessName ?? "—"}
                          {invoice.subscription?.planName
                            ? ` · ${invoice.subscription.planName}`
                            : ""}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={invoice.status} />
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                      {formatDate(invoice.issueDate)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-sm whitespace-nowrap",
                        isOverdue(invoice.dueDate) && invoice.outstandingMinor > 0
                          ? "font-medium text-destructive"
                          : "text-muted-foreground",
                      )}
                    >
                      {formatDate(invoice.dueDate)}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      <MoneyText minor={invoice.totalMinor} currency={invoice.currency} />
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      <MoneyText
                        minor={invoice.outstandingMinor}
                        currency={invoice.currency}
                        className={cn(
                          invoice.outstandingMinor > 0 ? "font-medium text-destructive" : "text-muted-foreground",
                        )}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="grid gap-2 md:hidden">
            {items.map((invoice) => (
              <button
                key={invoice.id}
                type="button"
                onClick={() => openInvoice(invoice.id)}
                className="flex min-h-11 items-start justify-between gap-3 rounded-xl border bg-card p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{invoice.displayNumber}</span>
                    <StatusBadge value={invoice.status} />
                  </span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">
                    {invoice.client?.businessName ?? "—"}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Issued {formatDate(invoice.issueDate)} · Due{" "}
                    <span
                      className={cn(
                        isOverdue(invoice.dueDate) && invoice.outstandingMinor > 0
                          ? "font-medium text-destructive"
                          : "",
                      )}
                    >
                      {formatDate(invoice.dueDate)}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <MoneyText
                    minor={invoice.totalMinor}
                    currency={invoice.currency}
                    className="block text-sm font-medium"
                  />
                  <MoneyText
                    minor={invoice.outstandingMinor}
                    currency={invoice.currency}
                    className={cn(
                      "block text-xs",
                      invoice.outstandingMinor > 0 ? "text-destructive" : "text-muted-foreground",
                    )}
                  />
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

      <InvoiceFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={(created) => openInvoice(created.id)}
      />
    </div>
  );
}
