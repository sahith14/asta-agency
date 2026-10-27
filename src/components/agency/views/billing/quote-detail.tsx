"use client";

/**
 * AgencyOS — quote detail (Phase 3, task 2-b).
 *
 * Actions derive from allowedTransitions:
 * DRAFT → Edit / Mark as sent / Cancel; SENT → Accept (with name) / Reject /
 * Cancel; ACCEPTED → Create invoice from this quote + frozen snapshot card.
 * Print uses the self-contained HTML window. Linked invoices list beneath.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity as ActivityIcon,
  BadgeCheck,
  CircleCheck,
  CircleX,
  ExternalLink,
  FileText,
  Loader2,
  Lock,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/agency/shared/confirm-dialog";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { ActivityTimeline } from "@/components/agency/views/dashboard/activity-timeline";
import { openClient, openInvoice, openWebsite, useAppStore } from "@/components/agency/store";
import { apiFetch, label, type QuoteDetailData, type QuoteRecord } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  BillingDetailSkeleton,
  DocumentHeader,
  LineTotalsTable,
  TotalsBlock,
  buildDocumentHtml,
  printDocument,
  useBillingSettings,
} from "@/components/agency/views/billing/bits";
import { QuoteFormDialog } from "@/components/agency/views/billing/quote-form-dialog";
import { InvoiceFormDialog } from "@/components/agency/views/billing/invoice-form-dialog";

export default function QuoteDetail() {
  const id = useAppStore((s) => s.params.id);
  const back = useAppStore((s) => s.back);
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [acceptedByName, setAcceptedByName] = useState("");
  const [convertOpen, setConvertOpen] = useState(false);

  const detailKey = ["quote", id] as const;
  const detailQuery = useQuery({
    queryKey: detailKey,
    queryFn: () => apiFetch<QuoteDetailData>(`/api/billing/quotes/${id}`),
    enabled: !!id,
  });

  const settings = useBillingSettings();

  // --- status actions (optimistic with rollback) ------------------------------
  const statusMutation = useMutation({
    mutationFn: (body: { action: string; acceptedByName?: string }) =>
      apiFetch<QuoteRecord>(`/api/billing/quotes/${id}/status`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<QuoteDetailData>(detailKey);
      const nextStatus =
        body.action === "send"
          ? "SENT"
          : body.action === "accept"
            ? "ACCEPTED"
            : body.action === "reject"
              ? "REJECTED"
              : "CANCELLED";
      queryClient.setQueryData<QuoteDetailData>(detailKey, (old) =>
        old ? { ...old, quote: { ...old.quote, status: nextStatus } } : old,
      );
      return { previous };
    },
    onSuccess: (result, body) => {
      // The status API returns the updated QuoteRecord directly.
      queryClient.setQueryData<QuoteDetailData>(detailKey, (old) =>
        old ? { ...old, quote: result } : old,
      );
      toast.success(
        body.action === "send"
          ? "Quote marked as sent."
          : body.action === "accept"
            ? "Quote accepted — the commercial record is now frozen."
            : body.action === "reject"
              ? "Quote marked as rejected."
              : "Quote cancelled.",
      );
      void queryClient.invalidateQueries({ queryKey: ["quotes"] });
      void queryClient.invalidateQueries({ queryKey: ["billing-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["billing-quotes-convertible"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: Error, _body, context) => {
      if (context?.previous) queryClient.setQueryData(detailKey, context.previous);
      toast.error(error.message || "Could not update the quote.");
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: detailKey }),
  });

  // --- render gates -----------------------------------------------------------

  if (!id) {
    return (
      <div className="space-y-6">
        <DocumentHeader title="Quote" onBack={back} />
        <EmptyState
          title="No quote selected"
          description="Pick a quote from the Billing list."
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
        <DocumentHeader title="Quote" onBack={back} />
        <EmptyState
          title="Quote not found"
          description="This quote may have been removed or the link is out of date."
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
        <DocumentHeader title="Quote" onBack={back} />
        <EmptyState
          title="Could not load this quote"
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
  const quote = data.quote;
  const allowed = data.allowedTransitions ?? [];
  const canSend = allowed.includes("SENT");
  const canAccept = allowed.includes("ACCEPTED");
  const canReject = allowed.includes("REJECTED");
  const canCancel = allowed.includes("CANCELLED");
  const canEdit = quote.status === "DRAFT";
  const isAccepted = quote.status === "ACCEPTED";
  const snapshot = data.acceptedSnapshot;

  function handlePrint() {
    const settingsData = settings.data;
    printDocument(
      `Quote ${quote.displayNumber}`,
      buildDocumentHtml({
        heading: "Quote",
        displayNumber: quote.displayNumber,
        business: {
          name: settingsData?.businessName ?? "",
          address: settingsData?.businessAddress ?? "",
          email: settingsData?.businessEmail ?? "",
          phone: settingsData?.businessPhone ?? "",
          vatNumber: settingsData?.vatNumber ?? "",
        },
        metaRows: [
          ["Issue date", formatDate(quote.issueDate)],
          ["Valid until", quote.expiryDate ? formatDate(quote.expiryDate) : "—"],
          ["Status", label(quote.status)],
        ],
        clientBlock: quote.client?.businessName ?? "—",
        clientHeading: "Prepared for",
        referenceBlock: quote.website
          ? { heading: "Website", text: quote.website.name }
          : null,
        lines: data.lines,
        totals: {
          subtotalMinor: quote.subtotalMinor,
          taxMinor: quote.taxMinor,
          totalMinor: quote.totalMinor,
        },
        currency: quote.currency,
        taxInclusive: quote.taxInclusive,
        notes: quote.scope ? `Scope of work\n${quote.scope}` : null,
        terms: quote.terms,
      }),
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <DocumentHeader
        title={quote.displayNumber}
        onBack={back}
        badges={<StatusBadge value={quote.status} />}
        meta={
          <>
            {quote.client ? (
              <button
                type="button"
                onClick={() => openClient(quote.client!.id)}
                className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
              >
                {quote.client.businessName}
                <ExternalLink aria-hidden className="size-3.5" />
              </button>
            ) : (
              <span>—</span>
            )}
            {quote.website ? (
              <>
                <span aria-hidden>·</span>
                <button
                  type="button"
                  onClick={() => openWebsite(quote.website!.id)}
                  className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
                >
                  {quote.website.name}
                  <ExternalLink aria-hidden className="size-3.5" />
                </button>
              </>
            ) : null}
            {quote.project ? (
              <>
                <span aria-hidden>·</span>
                <span>{quote.project.name}</span>
              </>
            ) : null}
            <span aria-hidden>·</span>
            <span>Issued {formatDate(quote.issueDate)}</span>
            <span aria-hidden>·</span>
            <span>Valid until {formatDate(quote.expiryDate)}</span>
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
            {canSend ? (
              <Button
                variant="outline"
                className="min-h-9"
                onClick={() => setSendOpen(true)}
                disabled={statusMutation.isPending}
              >
                <Send aria-hidden />
                Mark as sent
              </Button>
            ) : null}
            {canAccept ? (
              <Button className="min-h-9" onClick={() => setAcceptOpen(true)} disabled={statusMutation.isPending}>
                <CircleCheck aria-hidden />
                Accept
              </Button>
            ) : null}
            {canReject ? (
              <Button
                variant="outline"
                className="min-h-9 text-destructive hover:text-destructive"
                onClick={() => setRejectOpen(true)}
                disabled={statusMutation.isPending}
              >
                <CircleX aria-hidden />
                Reject
              </Button>
            ) : null}
            {canCancel ? (
              <Button
                variant="outline"
                className="min-h-9 text-destructive hover:text-destructive"
                onClick={() => setCancelOpen(true)}
                disabled={statusMutation.isPending}
              >
                <XCircle aria-hidden />
                Cancel
              </Button>
            ) : null}
          </>
        }
      />

      {/* Accepted banner */}
      {isAccepted ? (
        <Alert>
          <Lock aria-hidden className="size-4" />
          <AlertTitle>Accepted — frozen commercial record</AlertTitle>
          <AlertDescription>
            This quote was accepted{quote.acceptedAt ? ` on ${formatDate(quote.acceptedAt)}` : ""}
            {quote.acceptedByName ? ` by ${quote.acceptedByName}` : ""}. Its line items and totals
            are frozen; invoicing is done from this snapshot.
          </AlertDescription>
        </Alert>
      ) : null}

      {canSend ? (
        <Alert>
          <FileText aria-hidden className="size-4" />
          <AlertTitle>AgencyOS does not email the client automatically</AlertTitle>
          <AlertDescription>
            Mark this quote as sent after sending it yourself (e.g. from your own email). The
            status change is recorded with your name and the date.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Body */}
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Line items</CardTitle>
            </CardHeader>
            <CardContent>
              <LineTotalsTable lines={data.lines} currency={quote.currency} taxInclusive={quote.taxInclusive} />
            </CardContent>
          </Card>

          {quote.scope || quote.terms ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Scope &amp; terms</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {quote.scope ? (
                  <div>
                    <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Scope of work
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{quote.scope}</p>
                  </div>
                ) : null}
                {quote.terms ? (
                  <div>
                    <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Terms
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{quote.terms}</p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {/* Linked invoices */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Linked invoices</CardTitle>
              <CardDescription>Invoices created from this quote.</CardDescription>
            </CardHeader>
            <CardContent>
              {data.invoices.length === 0 ? (
                <p className="rounded-lg border border-dashed bg-muted/30 px-3 py-4 text-center text-sm text-muted-foreground">
                  {isAccepted
                    ? "No invoice yet — create one from this accepted quote."
                    : "Invoices appear here once this quote is converted."}
                </p>
              ) : (
                <ul className="divide-y">
                  {data.invoices.map((invoice) => (
                    <li key={invoice.id} className="flex items-center justify-between gap-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => openInvoice(invoice.id)}
                        className="flex min-h-9 items-center gap-2 text-sm font-medium underline-offset-2 hover:underline"
                      >
                        {invoice.displayNumber}
                        <StatusBadge value={invoice.status} />
                      </button>
                      <span className="text-sm font-medium tabular-nums">
                        {formatCurrency(invoice.totalMinor, invoice.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <aside className="min-w-0 space-y-4">
          {isAccepted && snapshot ? (
            <Card className="border-success/30 bg-success/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BadgeCheck aria-hidden className="size-4 text-success" />
                  Accepted snapshot
                </CardTitle>
                <CardDescription>
                  Accepted on {formatDate(snapshot.acceptedAt)}
                  {snapshot.acceptedByName ? ` by ${snapshot.acceptedByName}` : ""} — frozen
                  commercial record.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TotalsBlock
                  totals={snapshot.totals}
                  currency={quote.currency}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  {snapshot.lines.length} line item{snapshot.lines.length === 1 ? "" : "s"} frozen at
                  acceptance.
                </p>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Total</CardTitle>
            </CardHeader>
            <CardContent>
              <TotalsBlock
                totals={{
                  subtotalMinor: quote.subtotalMinor,
                  taxMinor: quote.taxMinor,
                  totalMinor: quote.totalMinor,
                }}
                currency={quote.currency}
              />
              {isAccepted ? (
                <Button className="mt-4 w-full min-h-11" onClick={() => setConvertOpen(true)}>
                  <FileText aria-hidden />
                  Create invoice from this quote
                </Button>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ActivityIcon aria-hidden className="size-4 text-muted-foreground" />
                Activity
              </CardTitle>
              <CardDescription>History for this quote.</CardDescription>
            </CardHeader>
            <CardContent className="scrollbar-thin max-h-96 overflow-y-auto">
              <ActivityTimeline
                items={data.activity}
                loading={detailQuery.isLoading}
                emptyTitle="No activity yet"
                emptyDescription="Send, accept and rejection events will appear here."
              />
            </CardContent>
          </Card>
        </aside>
      </div>

      {/* Edit dialog */}
      {editOpen ? <QuoteFormDialog open onOpenChange={setEditOpen} quote={quote} lines={data.lines} /> : null}

      {/* Mark as sent confirm */}
      <ConfirmDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        title={`Mark ${quote.displayNumber} as sent?`}
        description="AgencyOS does not email the client automatically. Mark this quote as sent after sending it yourself."
        confirmLabel="Mark as sent"
        loading={statusMutation.isPending}
        onConfirm={() => {
          statusMutation.mutate(
            { action: "send" },
            { onSuccess: () => setSendOpen(false) },
          );
        }}
      />

      {/* Accept dialog — accepted-by name */}
      <Dialog open={acceptOpen} onOpenChange={(open) => !open && setAcceptOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Accept {quote.displayNumber}</DialogTitle>
            <DialogDescription>
              Accepting freezes the line items and totals as a commercial record. Optionally record
              who accepted it (e.g. the client contact on the phone).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="quote-accepted-by">Accepted by (optional)</Label>
            <Input
              id="quote-accepted-by"
              value={acceptedByName}
              onChange={(event) => setAcceptedByName(event.target.value)}
              placeholder="e.g. Sarah Chen, owner"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcceptOpen(false)} disabled={statusMutation.isPending}>
              Cancel
            </Button>
            <Button
              disabled={statusMutation.isPending}
              onClick={() => {
                statusMutation.mutate(
                  { action: "accept", acceptedByName: acceptedByName.trim() || undefined },
                  {
                    onSuccess: () => {
                      setAcceptOpen(false);
                      setAcceptedByName("");
                    },
                  },
                );
              }}
            >
              {statusMutation.isPending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
              Accept quote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject confirm */}
      <ConfirmDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title={`Reject ${quote.displayNumber}?`}
        description="The client declined this quote. Rejected quotes are terminal and cannot be reopened — draft a new quote if the conversation continues."
        confirmLabel="Reject quote"
        destructive
        loading={statusMutation.isPending}
        onConfirm={() => {
          statusMutation.mutate({ action: "reject" }, { onSuccess: () => setRejectOpen(false) });
        }}
      />

      {/* Cancel confirm */}
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={`Cancel ${quote.displayNumber}?`}
        description="Cancelled quotes are terminal — they stay on the list for the record but cannot be sent or accepted."
        confirmLabel="Cancel quote"
        destructive
        loading={statusMutation.isPending}
        onConfirm={() => {
          statusMutation.mutate({ action: "cancel" }, { onSuccess: () => setCancelOpen(false) });
        }}
      />

      {/* Convert to invoice */}
      {convertOpen ? (
        <InvoiceFormDialog
          open
          onOpenChange={setConvertOpen}
          initialQuoteId={quote.id}
          onSaved={(created) => openInvoice(created.id)}
        />
      ) : null}
    </div>
  );
}
