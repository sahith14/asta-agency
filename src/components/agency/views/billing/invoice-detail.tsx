"use client";

/**
 * AgencyOS — invoice detail (Phase 3, task 2-b).
 *
 * Header (number, kind, status, client, dates) + body: line items, payments &
 * allocations, activity. Actions derive from allowedTransitions:
 * DRAFT → Edit / Issue / Void; ISSUED-family → Record payment / Void.
 * Status mutations are optimistic with rollback; the server message surfaces
 * verbatim on failure. Print uses the self-contained HTML window.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity as ActivityIcon,
  AlertTriangle,
  Banknote,
  ExternalLink,
  Loader2,
  Pencil,
  Printer,
  Send,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/agency/shared/confirm-dialog";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { ActivityTimeline } from "@/components/agency/views/dashboard/activity-timeline";
import { openBilling, openClient, openQuote, openSubscription, useAppStore } from "@/components/agency/store";
import { apiFetch, label, type InvoiceDetailData } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  BillingDetailSkeleton,
  DocumentHeader,
  LineTotalsTable,
  MoneyText,
  TotalsBlock,
  buildDocumentHtml,
  printDocument,
  useBillingSettings,
} from "@/components/agency/views/billing/bits";
import { InvoiceFormDialog } from "@/components/agency/views/billing/invoice-form-dialog";
import { PaymentDialog } from "@/components/agency/views/billing/payment-dialog";

export default function InvoiceDetail() {
  const id = useAppStore((s) => s.params.id);
  const back = useAppStore((s) => s.back);
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [payOpen, setPayOpen] = useState(false);

  const detailKey = ["invoice", id] as const;
  const detailQuery = useQuery({
    queryKey: detailKey,
    queryFn: () => apiFetch<InvoiceDetailData>(`/api/billing/invoices/${id}`),
    enabled: !!id,
  });

  const settings = useBillingSettings();

  // --- issue / void (optimistic with rollback) -------------------------------
  const statusMutation = useMutation({
    mutationFn: ({ action, body }: { action: "issue" | "void"; body?: Record<string, unknown> }) =>
      apiFetch<{ invoice: InvoiceDetailData["invoice"] }>(
        `/api/billing/invoices/${id}/${action}`,
        { method: "POST", body: JSON.stringify(body ?? {}) },
      ),
    onMutate: async ({ action }) => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<InvoiceDetailData>(detailKey);
      queryClient.setQueryData<InvoiceDetailData>(detailKey, (old) =>
        old
          ? {
              ...old,
              invoice: {
                ...old.invoice,
                status: action === "issue" ? "ISSUED" : "VOID",
                issuedAt: action === "issue" ? new Date().toISOString() : old.invoice.issuedAt,
              },
              allowedTransitions: action === "issue" ? ["PARTIALLY_PAID", "PAID", "OVERDUE", "VOID"] : [],
            }
          : old,
      );
      return { previous };
    },
    onSuccess: () => {
      toast.success("Invoice updated.");
    },
    onError: (error: Error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(detailKey, context.previous);
      toast.error(error.message || "Could not update the invoice.");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: detailKey });
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["billing-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["billing-invoices-open"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  // --- render gates -----------------------------------------------------------

  if (!id) {
    return (
      <div className="space-y-6">
        <DocumentHeader title="Invoice" onBack={back} />
        <EmptyState
          title="No invoice selected"
          description="Pick an invoice from the Billing list."
          action={
            <Button variant="outline" onClick={back}>
              Back to Billing
            </Button>
          }
        />
      </div>
    );
  }

  const detailError = detailQuery.error as (Error & { code?: string }) | null;
  if (detailQuery.isError && detailError?.code === "NOT_FOUND") {
    return (
      <div className="space-y-6">
        <DocumentHeader title="Invoice" onBack={back} />
        <EmptyState
          title="Invoice not found"
          description="This invoice may have been removed or the link is out of date."
          action={
            <Button variant="outline" onClick={back}>
              Back to Billing
            </Button>
          }
        />
      </div>
    );
  }
  if (detailQuery.isError) {
    return (
      <div className="space-y-6">
        <DocumentHeader title="Invoice" onBack={back} />
        <EmptyState
          title="Could not load this invoice"
          description={detailError?.message ?? "Check your connection and try again."}
          action={
            <Button variant="outline" onClick={() => void detailQuery.refetch()}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }
  if (detailQuery.isLoading || !detailQuery.data) {
    return <BillingDetailSkeleton />;
  }

  const data = detailQuery.data;
  const invoice = data.invoice;
  const allowed = data.allowedTransitions ?? [];
  const canIssue = invoice.status === "DRAFT" && allowed.includes("ISSUED");
  const canVoid = allowed.includes("VOID");
  const canRecordPayment = ["ISSUED", "OVERDUE", "PARTIALLY_PAID"].includes(invoice.status);
  const canEdit = invoice.status === "DRAFT";

  function handlePrint() {
    const settingsData = settings.data;
    printDocument(
      `Invoice ${invoice.displayNumber}`,
      buildDocumentHtml({
        heading: "Invoice",
        displayNumber: invoice.displayNumber,
        business: {
          name: settingsData?.businessName ?? "",
          address: settingsData?.businessAddress ?? "",
          email: settingsData?.businessEmail ?? "",
          phone: settingsData?.businessPhone ?? "",
          vatNumber: settingsData?.vatNumber ?? "",
        },
        metaRows: [
          ["Issue date", formatDate(invoice.issueDate)],
          ["Due date", invoice.dueDate ? formatDate(invoice.dueDate) : "—"],
          ["Status", label(invoice.status)],
        ],
        clientBlock: invoice.client?.businessName ?? "—",
        referenceBlock: invoice.website
          ? { heading: "Website", text: invoice.website.name }
          : null,
        lines: data.lines,
        totals: {
          subtotalMinor: invoice.subtotalMinor,
          taxMinor: invoice.taxMinor,
          totalMinor: invoice.totalMinor,
        },
        currency: invoice.currency,
        taxInclusive: invoice.taxInclusive,
        notes: invoice.notes,
        terms: invoice.terms,
        balanceNote:
          invoice.status === "DRAFT" || invoice.status === "VOID"
            ? null
            : `Paid ${formatMinor(invoice.paidMinor)}${
                invoice.pendingMinor > 0 ? ` · pending ${formatMinor(invoice.pendingMinor)}` : ""
              } · outstanding ${formatMinor(invoice.outstandingMinor)}`,
      }),
    );
  }

  function formatMinor(minor: number): string {
    return formatCurrency(minor, invoice.currency);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <DocumentHeader
        title={invoice.displayNumber}
        onBack={back}
        badges={
          <>
            <StatusBadge value={invoice.status} />
            <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {label(invoice.kind)}
            </span>
          </>
        }
        meta={
          <>
            {invoice.client ? (
              <button
                type="button"
                onClick={() => openClient(invoice.client!.id)}
                className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
              >
                {invoice.client.businessName}
                <ExternalLink aria-hidden className="size-3.5" />
              </button>
            ) : (
              <span>—</span>
            )}
            <span aria-hidden>·</span>
            <span>Issued {formatDate(invoice.issueDate)}</span>
            <span aria-hidden>·</span>
            <span>
              Due{" "}
              <span className={cn(invoice.isOverdue && "font-medium text-destructive")}>
                {formatDate(invoice.dueDate)}
              </span>
            </span>
          </>
        }
        actions={
          <>
            <Button variant="outline" className="min-h-9" onClick={handlePrint}>
              <Printer aria-hidden />
              Print
            </Button>
            {canEdit ? (
              <Button variant="outline" className="min-h-9" onClick={() => setEditOpen(true)}>
                <Pencil aria-hidden />
                Edit
              </Button>
            ) : null}
            {canIssue ? (
              <Button
                className="min-h-9"
                onClick={() => setIssueOpen(true)}
                disabled={statusMutation.isPending}
              >
                <Send aria-hidden />
                Issue
              </Button>
            ) : null}
            {canRecordPayment ? (
              <Button className="min-h-9" onClick={() => setPayOpen(true)}>
                <Banknote aria-hidden />
                Record payment
              </Button>
            ) : null}
            {canVoid ? (
              <Button
                variant="outline"
                className="min-h-9 text-destructive hover:text-destructive"
                onClick={() => {
                  setVoidReason("");
                  setVoidOpen(true);
                }}
              >
                <XCircle aria-hidden />
                Void
              </Button>
            ) : null}
          </>
        }
      />

      {/* Overdue warning */}
      {invoice.isOverdue && invoice.outstandingMinor > 0 ? (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden className="size-4" />
          <AlertTitle>This invoice is overdue</AlertTitle>
          <AlertDescription>
            The due date has passed and {formatMinor(invoice.outstandingMinor)} is still
            outstanding. Chase the client or record a payment when the money arrives.
          </AlertDescription>
        </Alert>
      ) : null}

      {invoice.status === "VOID" && invoice.voidReason ? (
        <Alert>
          <XCircle aria-hidden className="size-4" />
          <AlertTitle>Invoice voided</AlertTitle>
          <AlertDescription>
            {formatDate(invoice.voidedAt)} — {invoice.voidReason}
          </AlertDescription>
        </Alert>
      ) : null}

      {invoice.status === "REFUNDED" ? (
        <Alert>
          <XCircle aria-hidden className="size-4" />
          <AlertTitle>Fully refunded</AlertTitle>
          <AlertDescription>
            Every verified payment on this invoice has been refunded, so nothing is
            paid and nothing is outstanding. The payment and refund history below is
            preserved for audit; the invoice cannot accept new payments or be reissued.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Body */}
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <div className="min-w-0 space-y-4">
          {/* Lines */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Line items</CardTitle>
              {invoice.quote ? (
                <CardDescription>
                  Converted from quote{" "}
                  <button
                    type="button"
                    onClick={() => openQuote(invoice.quote!.id)}
                    className="font-medium underline underline-offset-2"
                  >
                    {invoice.quote.displayNumber}
                  </button>
                </CardDescription>
              ) : null}
            </CardHeader>
            <CardContent>
              <LineTotalsTable lines={data.lines} currency={invoice.currency} taxInclusive={invoice.taxInclusive} />
            </CardContent>
          </Card>

          {/* Notes / terms */}
          {invoice.notes || invoice.terms ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notes &amp; terms</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {invoice.notes ? (
                  <div>
                    <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Notes
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{invoice.notes}</p>
                  </div>
                ) : null}
                {invoice.terms ? (
                  <div>
                    <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Terms
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{invoice.terms}</p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {/* Payments & allocations */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payments &amp; allocations</CardTitle>
              <CardDescription>
                Only verified payments reduce the balance. Pending payments are shown for
                information until you verify them.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.payments.length === 0 ? (
                <EmptyState
                  icon={Banknote}
                  title="No payments recorded"
                  description={
                    canRecordPayment
                      ? "Use “Record payment” to log money received against this invoice."
                      : "Payments cannot be recorded against this invoice status."
                  }
                  className="border-0 py-8"
                />
              ) : (
                <ul className="divide-y">
                  {data.payments.map((row) => (
                    <li key={row.allocationId} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => openBilling("payments")}
                          className="flex items-center gap-2 text-sm font-medium underline-offset-2 hover:underline"
                        >
                          {row.displayNumber}
                        </button>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <StatusBadge value={row.status} />
                          <span>{label(row.method)}</span>
                          <span aria-hidden>·</span>
                          <span>{formatDate(row.paidAt)}</span>
                          {row.effectiveMinor !== row.allocatedMinor ? (
                            <span className="font-medium text-warning-foreground">
                              (effective {formatMinor(row.effectiveMinor)} after refund share)
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <div className="shrink-0 text-right text-sm font-medium">
                        <MoneyText minor={row.allocatedMinor} currency={invoice.currency} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <aside className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Balance</CardTitle>
            </CardHeader>
            <CardContent>
              <TotalsBlock
                totals={{
                  subtotalMinor: invoice.subtotalMinor,
                  taxMinor: invoice.taxMinor,
                  totalMinor: invoice.totalMinor,
                }}
                currency={invoice.currency}
                paidMinor={invoice.paidMinor}
                pendingMinor={invoice.pendingMinor}
                outstandingMinor={invoice.outstandingMinor}
              />
            </CardContent>
          </Card>

          {invoice.kind === "RENEWAL" && (invoice.periodStart || invoice.subscription) ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Renewal period</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Period start</span>
                  <span>{formatDate(invoice.periodStart)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Period end</span>
                  <span>{formatDate(invoice.periodEnd)}</span>
                </div>
                {invoice.subscription ? (
                  <button
                    type="button"
                    onClick={() => openSubscription(invoice.subscription!.id)}
                    className="mt-1 inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-primary underline-offset-2 hover:underline"
                  >
                    View subscription
                    <ExternalLink aria-hidden className="size-3.5" />
                  </button>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ActivityIcon aria-hidden className="size-4 text-muted-foreground" />
                Activity
              </CardTitle>
              <CardDescription>History for this invoice.</CardDescription>
            </CardHeader>
            <CardContent className="scrollbar-thin max-h-96 overflow-y-auto">
              <ActivityTimeline
                items={data.activity}
                loading={detailQuery.isLoading}
                emptyTitle="No activity yet"
                emptyDescription="Issue, payment and void events will appear here."
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Draft invoices are freely editable. Once issued, an invoice becomes a formal
                financial record — corrections are made by voiding it (with a reason) and issuing a
                replacement. {invoice.status === "DRAFT" ? "It has no number on the ledger until issued." : ""}
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>

      {/* Edit dialog */}
      {editOpen ? (
        <InvoiceFormDialog
          open
          onOpenChange={setEditOpen}
          invoice={invoice}
          lines={data.lines}
        />
      ) : null}

      {/* Issue confirm */}
      <ConfirmDialog
        open={issueOpen}
        onOpenChange={setIssueOpen}
        title={`Issue ${invoice.displayNumber}?`}
        description="It becomes a formal financial record; corrections are made by voiding. The client is expected to pay by the due date."
        confirmLabel="Issue invoice"
        loading={statusMutation.isPending}
        onConfirm={() => {
          statusMutation.mutate({ action: "issue" }, { onSuccess: () => setIssueOpen(false) });
        }}
      />

      {/* Void dialog — reason required */}
      <Dialog open={voidOpen} onOpenChange={(open) => !open && setVoidOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Void {invoice.displayNumber}</DialogTitle>
            <DialogDescription>
              Voiding is permanent — the invoice keeps its number for the audit trail but no money
              can be allocated to it. A reason is required.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="invoice-void-reason">Reason</Label>
            <Textarea
              id="invoice-void-reason"
              rows={3}
              value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
              placeholder="e.g. Raised in error — replaced by INV-0007."
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidOpen(false)} disabled={statusMutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!voidReason.trim() || statusMutation.isPending}
              onClick={() => {
                statusMutation.mutate(
                  { action: "void", body: { reason: voidReason.trim() } },
                  { onSuccess: () => setVoidOpen(false) },
                );
              }}
            >
              {statusMutation.isPending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
              Void invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record payment */}
      <PaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        invoice={{
          id: invoice.id,
          displayNumber: invoice.displayNumber,
          clientId: invoice.clientId,
          clientName: invoice.client?.businessName ?? null,
          outstandingMinor: invoice.outstandingMinor,
        }}
      />
    </div>
  );
}
