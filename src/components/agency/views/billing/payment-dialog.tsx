"use client";

/**
 * AgencyOS — record-payment dialog (shared by the Payments tab and invoice
 * detail).
 *
 * The allocation editor lists the client's unpaid invoices (ISSUED / OVERDUE /
 * PARTIALLY_PAID) with their outstanding amounts; Σ allocations must stay ≤
 * the payment amount and each allocation ≤ the invoice's outstanding (the
 * server re-validates everything).
 *
 * Honest hint: the payment is recorded as PENDING — it reduces invoice
 * balances only after you verify it.
 */
import { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Info, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Textarea } from "@/components/ui/textarea";
import { buildQuery } from "@/components/agency/shared/record-list-helpers";
import { apiFetch, PAYMENT_METHODS, label, type InvoiceRecord, type Paginated } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";
import { useClientsLookup } from "@/components/agency/views/tasks/lookups";
import { majorInputToMinor, minorToMajorInput, todayInput } from "@/components/agency/views/billing/bits";

const NONE = "none";

export interface PaymentDialogInvoice {
  id: string;
  displayNumber: string;
  clientId: string;
  clientName: string | null;
  outstandingMinor: number;
}

export function PaymentDialog({
  open,
  onOpenChange,
  invoice,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set (invoice detail), the client + a first allocation are prefilled. */
  invoice?: PaymentDialogInvoice | null;
  onSaved?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent className="max-h-[92svh] overflow-y-auto scrollbar-thin sm:max-w-xl lg:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
            <DialogDescription>
              Log money received from a client. It is recorded as Pending until you verify it.
            </DialogDescription>
          </DialogHeader>
          <PaymentFormInner invoice={invoice ?? null} onOpenChange={onOpenChange} onSaved={onSaved} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function PaymentFormInner({
  invoice,
  onOpenChange,
  onSaved,
}: {
  invoice: PaymentDialogInvoice | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const clients = useClientsLookup();

  const [serverError, setServerError] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [allocationError, setAllocationError] = useState<string | null>(null);

  const [clientId, setClientId] = useState(invoice?.clientId ?? "");
  const [amount, setAmount] = useState(
    invoice ? minorToMajorInput(invoice.outstandingMinor) : "",
  );
  const [method, setMethod] = useState<string>("BANK_TRANSFER");
  const [paidAt, setPaidAt] = useState(todayInput());
  const [referenceNum, setReferenceNum] = useState("");
  const [notes, setNotes] = useState("");
  /** invoiceId -> major-unit string */
  const [allocations, setAllocations] = useState<Record<string, string>>(() =>
    invoice ? { [invoice.id]: minorToMajorInput(invoice.outstandingMinor) } : {},
  );

  // Open invoices for the chosen client.
  const openInvoicesQuery = useQuery({
    queryKey: ["billing-invoices-open", clientId],
    queryFn: () =>
      apiFetch<Paginated<InvoiceRecord>>(
        `/api/billing/invoices${buildQuery({
          clientId,
          status: "ISSUED,OVERDUE,PARTIALLY_PAID",
          pageSize: 50,
          sort: "issueDate",
          dir: "desc",
        })}`,
      ),
    enabled: !!clientId,
    placeholderData: keepPreviousData,
  });

  const openInvoices = useMemo(
    () => (openInvoicesQuery.data?.items ?? []).filter((item) => item.outstandingMinor > 0),
    [openInvoicesQuery.data],
  );

  // Allocations are reset in the client Select's onValueChange handler.

  const amountMinor = majorInputToMinor(amount);
  const allocatedTotalMinor = Object.entries(allocations).reduce(
    (sum, [, value]) => sum + majorInputToMinor(value),
    0,
  );
  const unallocatedMinor = amountMinor - allocatedTotalMinor;

  const saveMutation = useMutation({
    mutationFn: () => {
      const allocationList = Object.entries(allocations)
        .map(([invoiceId, value]) => ({ invoiceId, amountMinor: majorInputToMinor(value) }))
        .filter((entry) => entry.amountMinor > 0);
      return apiFetch<{ id: string }>("/api/billing/payments", {
        method: "POST",
        body: JSON.stringify({
          clientId,
          amountMinor,
          method,
          paidAt,
          referenceNum: referenceNum.trim() || null,
          notes: notes.trim() || null,
          allocations: allocationList,
        }),
      });
    },
    onSuccess: () => {
      toast.success("Payment recorded as pending", {
        description: "Verify it once the money has cleared — only then does it reduce balances.",
      });
      void queryClient.invalidateQueries({ queryKey: ["payments"] });
      void queryClient.invalidateQueries({ queryKey: ["payment"] });
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["invoice"] });
      void queryClient.invalidateQueries({ queryKey: ["billing-invoices-open"] });
      void queryClient.invalidateQueries({ queryKey: ["billing-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["client"] });
      onOpenChange(false);
      onSaved?.();
    },
    onError: (error: Error) => {
      setServerError(error.message || "Could not record the payment.");
    },
  });

  function submit() {
    setServerError(null);
    setClientError(null);
    setAllocationError(null);

    if (!clientId) {
      setClientError("Client is required.");
      return;
    }
    if (amountMinor <= 0) {
      setAllocationError("Enter the payment amount.");
      return;
    }
    if (allocatedTotalMinor > amountMinor) {
      setAllocationError("Allocations exceed the payment amount.");
      return;
    }
    for (const entry of openInvoices) {
      const value = allocations[entry.id];
      if (!value) continue;
      if (majorInputToMinor(value) > entry.outstandingMinor) {
        setAllocationError(
          `Allocation for ${entry.displayNumber} exceeds its outstanding ${formatCurrency(
            entry.outstandingMinor,
            entry.currency,
          )}.`,
        );
        return;
      }
    }
    saveMutation.mutate();
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="space-y-4"
      noValidate
    >
      {serverError ? (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Client</Label>
          {invoice ? (
            <Input value={invoice.clientName ?? "Client"} readOnly aria-label="Client" />
          ) : (
            <>
              <Select
                value={clientId || NONE}
                onValueChange={(value) => {
                  setClientId(value === NONE ? "" : value);
                  setAllocations({});
                  setClientError(null);
                }}
              >
                <SelectTrigger className="w-full" aria-label="Client">
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {(clients.data ?? []).map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.businessName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {clientError ? <p className="text-xs text-destructive">{clientError}</p> : null}
            </>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="payment-amount">Amount received</Label>
          <Input
            id="payment-amount"
            type="number"
            min={0.01}
            step="0.01"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Method</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="w-full" aria-label="Payment method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((item) => (
                <SelectItem key={item} value={item}>
                  {label(item)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="payment-paid-at">Date received</Label>
          <Input
            id="payment-paid-at"
            type="date"
            value={paidAt}
            onChange={(event) => setPaidAt(event.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="payment-reference">Reference (optional)</Label>
          <Input
            id="payment-reference"
            value={referenceNum}
            onChange={(event) => setReferenceNum(event.target.value)}
            placeholder="e.g. bank statement ref"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="payment-notes">Notes (optional)</Label>
          <Input
            id="payment-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Internal context only"
          />
        </div>
      </div>

      {/* Allocation editor */}
      <div className="space-y-2">
        <Label>Allocate to invoices</Label>
        {!clientId ? (
          <p className="rounded-lg border border-dashed bg-muted/30 px-3 py-4 text-center text-sm text-muted-foreground">
            Choose a client to see their unpaid invoices.
          </p>
        ) : openInvoicesQuery.isLoading ? (
          <div className="space-y-2" aria-busy>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : openInvoices.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-muted/30 px-3 py-4 text-center text-sm text-muted-foreground">
            This client has no unpaid invoices — the payment can be recorded without allocations.
          </p>
        ) : (
          <div className="scrollbar-thin max-h-64 space-y-2 overflow-y-auto pr-1">
            {openInvoices.map((openInvoice) => {
              const value = allocations[openInvoice.id] ?? "";
              return (
                <div
                  key={openInvoice.id}
                  className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{openInvoice.displayNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      Due {formatDate(openInvoice.dueDate)} · outstanding{" "}
                      <span className="font-medium tabular-nums">
                        {formatCurrency(openInvoice.outstandingMinor, openInvoice.currency)}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={openInvoice.outstandingMinor / 100}
                      step="0.01"
                      inputMode="decimal"
                      value={value}
                      onChange={(event) =>
                        setAllocations((current) => ({
                          ...current,
                          [openInvoice.id]: event.target.value,
                        }))
                      }
                      placeholder="0.00"
                      aria-label={`Allocate to ${openInvoice.displayNumber}`}
                      className="w-28"
                    />
                    {value ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-9 shrink-0 text-muted-foreground"
                        aria-label={`Clear allocation for ${openInvoice.displayNumber}`}
                        onClick={() =>
                          setAllocations((current) => {
                            const next = { ...current };
                            delete next[openInvoice.id];
                            return next;
                          })
                        }
                      >
                        <Trash2 aria-hidden className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
          <span className="text-sm text-muted-foreground">
            Unallocated:{" "}
            <span
              className={
                unallocatedMinor < 0
                  ? "font-semibold text-destructive"
                  : unallocatedMinor === 0 && amountMinor > 0
                    ? "font-semibold text-success"
                    : "font-semibold text-foreground"
              }
            >
              {formatCurrency(unallocatedMinor)}
            </span>
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatCurrency(allocatedTotalMinor)} of {formatCurrency(amountMinor)} allocated
          </span>
        </div>
        {allocationError ? <p className="text-xs text-destructive">{allocationError}</p> : null}
      </div>

      <Alert>
        <Info aria-hidden className="size-4" />
        <AlertDescription>
          Payment is recorded as Pending — it reduces the invoice balance only after you verify it
          (e.g. you can see it on the bank statement).
        </AlertDescription>
      </Alert>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={saveMutation.isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? (
            <Loader2 aria-hidden className="size-4 animate-spin" />
          ) : (
            <Banknote aria-hidden />
          )}
          Record payment
        </Button>
      </DialogFooter>
    </form>
  );
}
