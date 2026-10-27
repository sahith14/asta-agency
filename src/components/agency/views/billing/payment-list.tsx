"use client";

/**
 * AgencyOS — Billing › Payments tab (list).
 *
 * Rows: reference, client, effective amount ("£X − £Y refund" when refunded),
 * status, method, paidAt, reference number and allocated invoice chips.
 * Row actions (per status): PENDING → Verify / Mark failed;
 * VERIFIED → Record refund. All optimistic with rollback; server error
 * messages surface verbatim.
 */
import { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Banknote,
  CircleOff,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  SearchX,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { ConfirmDialog } from "@/components/agency/shared/confirm-dialog";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { buildQuery } from "@/components/agency/shared/record-list-helpers";
import { openInvoice, useAppStore } from "@/components/agency/store";
import {
  apiFetch,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  label,
  type Paginated,
  type PaymentRecord,
} from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";
import { useClientsLookup, useDebouncedValue } from "@/components/agency/views/tasks/lookups";
import { ListPagination } from "@/components/agency/views/tasks/list-pagination";
import { BillingListSkeleton, majorInputToMinor } from "@/components/agency/views/billing/bits";
import { PaymentDialog } from "@/components/agency/views/billing/payment-dialog";

const PAGE_SIZE = 20;

interface PaymentFilters {
  status: string;
  clientId: string;
  method: string;
}

export function PaymentList() {
  const params = useAppStore((s) => s.params);
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<PaymentFilters>(() => ({
    status: (PAYMENT_STATUSES as readonly string[]).includes(params.status ?? "")
      ? params.status
      : "",
    clientId: params.clientId ?? "",
    method: (PAYMENT_METHODS as readonly string[]).includes(params.method ?? "")
      ? params.method
      : "",
  }));
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState(params.q ?? "");
  const debouncedSearch = useDebouncedValue(searchInput);
  const [createOpen, setCreateOpen] = useState(false);

  // Row action state
  const [verifying, setVerifying] = useState<PaymentRecord | null>(null);
  const [failing, setFailing] = useState<PaymentRecord | null>(null);
  const [failReason, setFailReason] = useState("");
  const [refunding, setRefunding] = useState<PaymentRecord | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");

  const setFilter = (patch: Partial<PaymentFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };

  const listQueryKey = useMemo(
    () =>
      [
        "payments",
        {
          page,
          search: debouncedSearch,
          status: filters.status,
          clientId: filters.clientId,
          method: filters.method,
        },
      ] as const,
    [page, debouncedSearch, filters.status, filters.clientId, filters.method],
  );

  const listQuery = useQuery({
    queryKey: listQueryKey,
    queryFn: () =>
      apiFetch<Paginated<PaymentRecord>>(
        `/api/billing/payments${buildQuery({
          page,
          pageSize: PAGE_SIZE,
          q: debouncedSearch || undefined,
          status: filters.status || undefined,
          clientId: filters.clientId || undefined,
          method: filters.method || undefined,
          sort: "paidAt",
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
    !!debouncedSearch || !!filters.status || !!filters.clientId || !!filters.method;

  const clearFilters = () => {
    setFilters({ status: "", clientId: "", method: "" });
    setSearchInput("");
    setPage(1);
  };

  function invalidateAfterPaymentMutation() {
    void queryClient.invalidateQueries({ queryKey: ["payments"] });
    void queryClient.invalidateQueries({ queryKey: ["payment"] });
    void queryClient.invalidateQueries({ queryKey: ["invoices"] });
    void queryClient.invalidateQueries({ queryKey: ["invoice"] });
    void queryClient.invalidateQueries({ queryKey: ["billing-invoices-open"] });
    void queryClient.invalidateQueries({ queryKey: ["billing-summary"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["client"] });
  }

  // --- verify (optimistic) -----------------------------------------------------
  const verifyMutation = useMutation({
    mutationFn: (paymentId: string) =>
      apiFetch<PaymentRecord>(`/api/billing/payments/${paymentId}/verify`, { method: "POST" }),
    onMutate: async (paymentId) => {
      await queryClient.cancelQueries({ queryKey: ["payments"] });
      const previousLists = queryClient.getQueriesData<Paginated<PaymentRecord>>({
        queryKey: ["payments"],
      });
      const previousDetail = queryClient.getQueryData<PaymentRecord>(["payment", paymentId]);
      const patch = (payment: PaymentRecord): PaymentRecord => ({
        ...payment,
        status: "VERIFIED",
        verifiedAt: new Date().toISOString(),
      });
      queryClient.setQueriesData<Paginated<PaymentRecord>>({ queryKey: ["payments"] }, (old) =>
        old
          ? { ...old, items: old.items.map((item) => (item.id === paymentId ? patch(item) : item)) }
          : old,
      );
      if (previousDetail) queryClient.setQueryData(["payment", paymentId], patch(previousDetail));
      return { previousLists, previousDetail };
    },
    onSuccess: () => {
      toast.success("Payment verified — invoice balances updated.");
    },
    onError: (error: Error, _id, context) => {
      if (context?.previousLists) {
        for (const [key, value] of context.previousLists) {
          queryClient.setQueryData(key, value);
        }
      }
      if (context?.previousDetail) {
        queryClient.setQueryData(["payment", context.previousDetail.id], context.previousDetail);
      }
      toast.error(error.message || "Could not verify the payment.");
    },
    onSettled: () => invalidateAfterPaymentMutation(),
  });

  // --- fail (optimistic) -------------------------------------------------------
  const failMutation = useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason: string }) =>
      apiFetch<PaymentRecord>(`/api/billing/payments/${paymentId}/fail`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onMutate: async ({ paymentId }) => {
      await queryClient.cancelQueries({ queryKey: ["payments"] });
      const previousLists = queryClient.getQueriesData<Paginated<PaymentRecord>>({
        queryKey: ["payments"],
      });
      queryClient.setQueriesData<Paginated<PaymentRecord>>({ queryKey: ["payments"] }, (old) =>
        old
          ? {
              ...old,
              items: old.items.map((item) =>
                item.id === paymentId ? { ...item, status: "FAILED" } : item,
              ),
            }
          : old,
      );
      return { previousLists };
    },
    onSuccess: () => {
      toast.success("Payment marked as failed.");
    },
    onError: (error: Error, _vars, context) => {
      if (context?.previousLists) {
        for (const [key, value] of context.previousLists) {
          queryClient.setQueryData(key, value);
        }
      }
      toast.error(error.message || "Could not mark the payment as failed.");
    },
    onSettled: () => invalidateAfterPaymentMutation(),
  });

  // --- refund (optimistic) -----------------------------------------------------
  const refundMutation = useMutation({
    mutationFn: ({ paymentId, amountMinor, reason }: { paymentId: string; amountMinor: number; reason: string }) =>
      apiFetch<PaymentRecord>(`/api/billing/payments/${paymentId}/refund`, {
        method: "POST",
        body: JSON.stringify({ amountMinor, reason }),
      }),
    onMutate: async ({ paymentId, amountMinor }) => {
      await queryClient.cancelQueries({ queryKey: ["payments"] });
      const previousLists = queryClient.getQueriesData<Paginated<PaymentRecord>>({
        queryKey: ["payments"],
      });
      queryClient.setQueriesData<Paginated<PaymentRecord>>({ queryKey: ["payments"] }, (old) =>
        old
          ? {
              ...old,
              items: old.items.map((item) => {
                if (item.id !== paymentId) return item;
                const refundMinor = item.refundMinor + amountMinor;
                const fullyRefunded = refundMinor >= item.amountMinor;
                return {
                  ...item,
                  refundMinor,
                  effectiveMinor: item.amountMinor - refundMinor,
                  status: fullyRefunded ? "REFUNDED" : item.status,
                };
              }),
            }
          : old,
      );
      return { previousLists };
    },
    onSuccess: () => {
      toast.success("Refund recorded — allocations reduced oldest-first.");
    },
    onError: (error: Error, _vars, context) => {
      if (context?.previousLists) {
        for (const [key, value] of context.previousLists) {
          queryClient.setQueryData(key, value);
        }
      }
      toast.error(error.message || "Could not record the refund.");
    },
    onSettled: () => invalidateAfterPaymentMutation(),
  });

  const busy =
    verifyMutation.isPending || failMutation.isPending || refundMutation.isPending;

  function amountCell(payment: PaymentRecord) {
    if (payment.refundMinor > 0) {
      return (
        <span className="text-right text-sm">
          <span className="font-medium tabular-nums">
            {formatCurrency(payment.effectiveMinor, payment.currency)}
          </span>
          <span className="block text-xs text-muted-foreground tabular-nums">
            − {formatCurrency(payment.refundMinor, payment.currency)} refund
          </span>
        </span>
      );
    }
    return (
      <span className="text-sm font-medium tabular-nums">
        {formatCurrency(payment.amountMinor, payment.currency)}
      </span>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tab toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {listQuery.isLoading
            ? "Loading payments…"
            : `${total} ${total === 1 ? "payment" : "payments"}`}
        </p>
        <Button onClick={() => setCreateOpen(true)} className="min-h-9">
          <Plus aria-hidden />
          Record payment
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
            placeholder="Search payments…"
            aria-label="Search payments"
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:w-auto">
          <Select
            value={filters.status || "all"}
            onValueChange={(value) => setFilter({ status: value === "all" ? "" : value })}
          >
            <SelectTrigger className="w-full lg:w-40" aria-label="Status filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {PAYMENT_STATUSES.map((status) => (
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
            value={filters.method || "all"}
            onValueChange={(value) => setFilter({ method: value === "all" ? "" : value })}
          >
            <SelectTrigger className="w-full lg:w-44" aria-label="Method filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All methods</SelectItem>
              {PAYMENT_METHODS.map((method) => (
                <SelectItem key={method} value={method}>
                  {label(method)}
                </SelectItem>
              ))}
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
          title="Payments could not be loaded"
          description={(listQuery.error as Error)?.message ?? "Something went wrong."}
          action={
            <Button variant="outline" onClick={() => void listQuery.refetch()}>
              Try again
            </Button>
          }
        />
      ) : total === 0 && !hasActiveFilters ? (
        <EmptyState
          icon={Banknote}
          title="No payments yet"
          description="Record a payment when money arrives — verify it against the bank statement so it reduces invoice balances."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden />
              Record first payment
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No payments match the current filters"
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
                  <TableHead>Payment</TableHead>
                  <TableHead className="w-36">Status</TableHead>
                  <TableHead className="w-36">Method</TableHead>
                  <TableHead className="w-28">Received</TableHead>
                  <TableHead className="w-28 text-right">Amount</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((payment) => (
                  <TableRow key={payment.id} className="record-row">
                    <TableCell className="max-w-md">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{payment.displayNumber}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {payment.client?.businessName ?? "—"}
                          {payment.referenceNum ? ` · ref ${payment.referenceNum}` : ""}
                        </p>
                        {payment.allocations.length > 0 ? (
                          <p className="flex flex-wrap items-center gap-1 pt-0.5">
                            {payment.allocations.map((allocation) => (
                              <button
                                key={allocation.id}
                                type="button"
                                onClick={() => openInvoice(allocation.invoiceId)}
                                className="inline-flex min-h-6 items-center gap-0.5 rounded-full border border-border bg-background px-2 text-[11px] font-medium text-muted-foreground outline-none hover:border-primary/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                {allocation.invoiceDisplayNumber}
                                <ExternalLink aria-hidden className="size-2.5" />
                              </button>
                            ))}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={payment.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {label(payment.method)}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                      {formatDate(payment.paidAt)}
                    </TableCell>
                    <TableCell className="text-right">{amountCell(payment)}</TableCell>
                    <TableCell className="pr-3">{rowMenu(payment, setVerifying, setFailing, setRefunding, setRefundAmount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="grid gap-2 md:hidden">
            {items.map((payment) => (
              <div
                key={payment.id}
                className="flex items-start justify-between gap-3 rounded-xl border bg-card p-4"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{payment.displayNumber}</span>
                    <StatusBadge value={payment.status} />
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {payment.client?.businessName ?? "—"} · {label(payment.method)} ·{" "}
                    {formatDate(payment.paidAt)}
                  </p>
                  {payment.allocations.length > 0 ? (
                    <p className="mt-1.5 flex flex-wrap items-center gap-1">
                      {payment.allocations.map((allocation) => (
                        <button
                          key={allocation.id}
                          type="button"
                          onClick={() => openInvoice(allocation.invoiceId)}
                          className="inline-flex min-h-8 items-center gap-0.5 rounded-full border border-border bg-background px-2 text-[11px] font-medium text-muted-foreground outline-none hover:border-primary/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {allocation.invoiceDisplayNumber}
                          <ExternalLink aria-hidden className="size-2.5" />
                        </button>
                      ))}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {amountCell(payment)}
                  {rowMenu(payment, setVerifying, setFailing, setRefunding, setRefundAmount)}
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

      <PaymentDialog open={createOpen} onOpenChange={setCreateOpen} />

      {/* Verify confirm */}
      <ConfirmDialog
        open={!!verifying}
        onOpenChange={(open) => {
          if (!open) setVerifying(null);
        }}
        title={`Verify ${verifying?.displayNumber ?? "payment"}?`}
        description="Confirm the money has cleared, e.g. you can see it on the bank statement. Verified payments reduce the allocated invoice balances immediately."
        confirmLabel="Verify payment"
        loading={busy}
        onConfirm={() => {
          if (!verifying) return;
          verifyMutation.mutate(verifying.id, { onSettled: () => setVerifying(null) });
        }}
      />

      {/* Fail dialog — reason required */}
      <Dialog open={!!failing} onOpenChange={(open) => !open && setFailing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark {failing?.displayNumber ?? "payment"} as failed</DialogTitle>
            <DialogDescription>
              The payment stays on record for the audit trail but does not reduce any balances. A
              reason is required.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="payment-fail-reason">Reason</Label>
            <Input
              id="payment-fail-reason"
              value={failReason}
              onChange={(event) => setFailReason(event.target.value)}
              placeholder="e.g. Cheque bounced"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFailing(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!failReason.trim() || busy}
              onClick={() => {
                if (!failing) return;
                failMutation.mutate(
                  { paymentId: failing.id, reason: failReason.trim() },
                  {
                    onSuccess: () => {
                      setFailing(null);
                      setFailReason("");
                    },
                  },
                );
              }}
            >
              {failMutation.isPending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
              Mark as failed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refund dialog */}
      <Dialog open={!!refunding} onOpenChange={(open) => !open && setRefunding(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record refund — {refunding?.displayNumber ?? "payment"}</DialogTitle>
            <DialogDescription>
              Refunds reduce the oldest invoice allocations first. The refunded amount is
              subtracted from the payment&apos;s effective total.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment amount</span>
                <span className="font-medium tabular-nums">
                  {refunding ? formatCurrency(refunding.amountMinor, refunding.currency) : "—"}
                </span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-muted-foreground">Already refunded</span>
                <span className="tabular-nums">
                  {refunding ? formatCurrency(refunding.refundMinor, refunding.currency) : "—"}
                </span>
              </div>
              <div className="mt-1 flex justify-between border-t pt-1">
                <span className="text-muted-foreground">Effective remaining</span>
                <span className="font-medium tabular-nums">
                  {refunding ? formatCurrency(refunding.effectiveMinor, refunding.currency) : "—"}
                </span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="refund-amount">Refund amount</Label>
              <Input
                id="refund-amount"
                type="number"
                min={0.01}
                step="0.01"
                inputMode="decimal"
                value={refundAmount}
                onChange={(event) => setRefundAmount(event.target.value)}
                placeholder="0.00"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="refund-reason">Reason</Label>
              <Input
                id="refund-reason"
                value={refundReason}
                onChange={(event) => setRefundReason(event.target.value)}
                placeholder="e.g. Duplicate charge"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefunding(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={
                busy ||
                !refundReason.trim() ||
                majorInputToMinor(refundAmount) <= 0 ||
                (refunding ? majorInputToMinor(refundAmount) > refunding.effectiveMinor : false)
              }
              onClick={() => {
                if (!refunding) return;
                refundMutation.mutate(
                  {
                    paymentId: refunding.id,
                    amountMinor: majorInputToMinor(refundAmount),
                    reason: refundReason.trim(),
                  },
                  {
                    onSuccess: () => {
                      setRefunding(null);
                      setRefundAmount("");
                      setRefundReason("");
                    },
                  },
                );
              }}
            >
              {refundMutation.isPending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
              Record refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function rowMenu(
  payment: PaymentRecord,
  setVerifying: (payment: PaymentRecord) => void,
  setFailing: (payment: PaymentRecord) => void,
  setRefunding: (payment: PaymentRecord) => void,
  setRefundAmount: (value: string) => void,
) {
  const canVerify = payment.status === "PENDING";
  const canFail = payment.status === "PENDING";
  const canRefund = payment.status === "VERIFIED" && payment.effectiveMinor > 0;
  const nothingAvailable = !canVerify && !canFail && !canRefund;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={`Actions for ${payment.displayNumber}`}
          disabled={nothingAvailable}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44" onClick={(event) => event.stopPropagation()}>
        {canVerify ? (
          <DropdownMenuItem onSelect={() => setVerifying(payment)}>
            <BadgeCheck aria-hidden />
            Verify
          </DropdownMenuItem>
        ) : null}
        {canFail ? (
          <DropdownMenuItem variant="destructive" onSelect={() => setFailing(payment)}>
            <CircleOff aria-hidden />
            Mark failed
          </DropdownMenuItem>
        ) : null}
        {canRefund ? (
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => {
              setRefundAmount((payment.effectiveMinor / 100).toFixed(2));
              setRefunding(payment);
            }}
          >
            <RotateCcw aria-hidden />
            Record refund
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
