"use client";

/**
 * AgencyOS — subscription detail (Phase 3, task 2-b).
 *
 * Header + period card, inline auto-invoice/auto-renew switches (optimistic
 * PATCH), status actions from allowedTransitions (Cancel offers "now" vs
 * "at period end" when ACTIVE), manual renewal invoice generation (server 409
 * surfaces verbatim), linked invoices, subscription event timeline and
 * editable internal notes.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity as ActivityIcon,
  CalendarClock,
  ExternalLink,
  Loader2,
  PauseCircle,
  Pencil,
  PlayCircle,
  ReceiptText,
} from "lucide-react";
import { toast } from "sonner";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/agency/shared/confirm-dialog";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { openClient, openInvoice, openWebsite, useAppStore } from "@/components/agency/store";
import {
  apiFetch,
  label,
  type SubscriptionDetailData,
  type SubscriptionRecord,
} from "@/lib/types";
import { formatCurrency, formatDate, formatDateTime, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  BillingDetailSkeleton,
  DocumentHeader,
  intervalNoun,
} from "@/components/agency/views/billing/bits";
import { SubscriptionFormDialog } from "@/components/agency/views/billing/subscription-form-dialog";

type StatusAction = "activate" | "pause" | "resume" | "cancel" | "end";

export default function SubscriptionDetail() {
  const id = useAppStore((s) => s.params.id);
  const back = useAppStore((s) => s.back);
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [action, setAction] = useState<StatusAction | null>(null);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [notes, setNotes] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);

  const detailKey = ["subscription", id] as const;
  const detailQuery = useQuery({
    queryKey: detailKey,
    queryFn: () => apiFetch<SubscriptionDetailData>(`/api/billing/subscriptions/${id}`),
    enabled: !!id,
  });

  const subscription = detailQuery.data?.subscription;

  useEffect(() => {
    if (subscription && !notesDirty) {
      setNotes(subscription.internalNotes ?? "");
    }
  }, [subscription, notesDirty]);

  // --- status (optimistic with rollback) --------------------------------------
  const statusMutation = useMutation({
    mutationFn: (body: { action: StatusAction; cancelAtPeriodEnd?: boolean }) =>
      apiFetch<SubscriptionRecord>(
        `/api/billing/subscriptions/${id}/status`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<SubscriptionDetailData>(detailKey);
      const nextStatus =
        body.action === "activate" || body.action === "resume"
          ? "ACTIVE"
          : body.action === "pause"
            ? "PAUSED"
            : body.action === "end"
              ? "ENDED"
              : "CANCELLED";
      queryClient.setQueryData<SubscriptionDetailData>(detailKey, (old) =>
        old
          ? {
              ...old,
              subscription: {
                ...old.subscription,
                status: body.cancelAtPeriodEnd ? old.subscription.status : nextStatus,
                cancelAtPeriodEnd: body.cancelAtPeriodEnd ?? false,
              },
            }
          : old,
      );
      return { previous };
    },
    onSuccess: (result, body) => {
      // The status API returns the updated SubscriptionRecord directly.
      const updatedSub = result;
      queryClient.setQueryData<SubscriptionDetailData>(detailKey, (old) =>
        old ? { ...old, subscription: updatedSub } : old,
      );
      toast.success(
        body.cancelAtPeriodEnd
          ? `The subscription will be cancelled at the end of the current period (${formatDate(updatedSub.nextRenewalDate)}).`
          : `Subscription ${label(updatedSub.status).toLowerCase()}.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      void queryClient.invalidateQueries({ queryKey: ["billing-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: Error, _body, context) => {
      if (context?.previous) queryClient.setQueryData(detailKey, context.previous);
      toast.error(error.message || "Could not update the subscription.");
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: detailKey }),
  });

  // --- auto flags (optimistic) ------------------------------------------------
  const flagsMutation = useMutation({
    mutationFn: (body: { autoInvoice?: boolean; autoRenew?: boolean }) =>
      apiFetch<SubscriptionRecord>(`/api/billing/subscriptions/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<SubscriptionDetailData>(detailKey);
      queryClient.setQueryData<SubscriptionDetailData>(detailKey, (old) =>
        old
          ? {
              ...old,
              subscription: { ...old.subscription, ...body },
            }
          : old,
      );
      return { previous };
    },
    onSuccess: (record, body) => {
      queryClient.setQueryData<SubscriptionDetailData>(detailKey, (old) =>
        old ? { ...old, subscription: record } : old,
      );
      toast.success(
        "autoInvoice" in body
          ? `Auto-invoicing ${record.autoInvoice ? "enabled" : "disabled"}.`
          : `Auto-renew ${record.autoRenew ? "enabled" : "disabled"}.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
    },
    onError: (error: Error, _body, context) => {
      if (context?.previous) queryClient.setQueryData(detailKey, context.previous);
      toast.error(error.message || "Could not update the subscription.");
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: detailKey }),
  });

  // --- notes -------------------------------------------------------------------
  const notesMutation = useMutation({
    mutationFn: () =>
      apiFetch<SubscriptionRecord>(`/api/billing/subscriptions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ internalNotes: notes.trim() || null }),
      }),
    onSuccess: () => {
      toast.success("Internal notes saved");
      setNotesDirty(false);
      void queryClient.invalidateQueries({ queryKey: detailKey });
    },
    onError: (error: Error) => toast.error(error.message || "Could not save the notes."),
  });

  // --- manual renewal ----------------------------------------------------------
  const renewMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ invoiceId: string }>(`/api/billing/subscriptions/${id}/renew`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: (result) => {
      toast.success("Renewal invoice created");
      void queryClient.invalidateQueries({ queryKey: detailKey });
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["billing-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      if (result?.invoiceId) openInvoice(result.invoiceId);
    },
    onError: (error: Error) => {
      // Surface the server message verbatim (e.g. duplicate-renewal 409).
      toast.error(error.message || "Could not create the renewal invoice.");
    },
  });

  // --- render gates -----------------------------------------------------------

  if (!id) {
    return (
      <div className="space-y-6">
        <DocumentHeader title="Subscription" onBack={back} />
        <EmptyState
          title="No subscription selected"
          description="Pick a subscription from the Billing list."
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
        <DocumentHeader title="Subscription" onBack={back} />
        <EmptyState
          title="Subscription not found"
          description="This subscription may have been removed or the link is out of date."
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
        <DocumentHeader title="Subscription" onBack={back} />
        <EmptyState
          title="Could not load this subscription"
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
  if (detailQuery.isLoading || !detailQuery.data || !subscription) {
    return <BillingDetailSkeleton />;
  }

  const data = detailQuery.data;
  const allowed: string[] = data.allowedTransitions ?? [];

  const nextStatusAction = (status: string): { label: string; action: StatusAction; icon: typeof PlayCircle } | null => {
    if (allowed.includes("ACTIVE")) {
      if (status === "PENDING") return { label: "Activate", action: "activate", icon: PlayCircle };
      if (status === "PAUSED") return { label: "Resume", action: "resume", icon: PlayCircle };
    }
    if (allowed.includes("PAUSED")) return { label: "Pause", action: "pause", icon: PauseCircle };
    return null;
  };
  const primary = nextStatusAction(subscription.status);
  const canCancel = allowed.includes("CANCELLED");
  const canEnd = allowed.includes("ENDED");

  return (
    <div className="space-y-6">
      {/* Header */}
      <DocumentHeader
        title={subscription.planName ?? "Custom subscription"}
        onBack={back}
        badges={<StatusBadge value={subscription.status} />}
        meta={
          <>
            {subscription.client ? (
              <button
                type="button"
                onClick={() => openClient(subscription.client!.id)}
                className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
              >
                {subscription.client.businessName}
                <ExternalLink aria-hidden className="size-3.5" />
              </button>
            ) : null}
            {subscription.website ? (
              <>
                <span aria-hidden>·</span>
                <button
                  type="button"
                  onClick={() => openWebsite(subscription.website!.id)}
                  className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
                >
                  {subscription.website.name}
                  <ExternalLink aria-hidden className="size-3.5" />
                </button>
              </>
            ) : null}
            <span aria-hidden>·</span>
            <span className="font-medium tabular-nums">
              {formatCurrency(subscription.agreedPriceMinor, subscription.currency)} /{" "}
              {intervalNoun(subscription.billingInterval)}
            </span>
            {subscription.taxRateBps > 0 ? (
              <>
                <span aria-hidden>·</span>
                <span>{(subscription.taxRateBps / 100).toFixed(subscription.taxRateBps % 100 === 0 ? 0 : 2)}% tax</span>
              </>
            ) : null}
          </>
        }
        actions={
          <>
            <Button
              variant="outline"
              className="min-h-9"
              onClick={() => renewMutation.mutate()}
              disabled={renewMutation.isPending}
              title="Create a renewal invoice for the current due period"
            >
              {renewMutation.isPending ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : (
                <ReceiptText aria-hidden />
              )}
              Generate renewal invoice now
            </Button>
            {primary ? (
              <Button
                className="min-h-9"
                onClick={() => {
                  setCancelAtPeriodEnd(false);
                  if (primary.action === "cancel") {
                    setAction("cancel");
                  } else {
                    setAction(primary.action);
                  }
                }}
                disabled={statusMutation.isPending}
              >
                <primary.icon aria-hidden />
                {primary.label}
              </Button>
            ) : null}
            <Button variant="outline" className="min-h-9" onClick={() => setEditOpen(true)}>
              <Pencil aria-hidden />
              Edit
            </Button>
          </>
        }
      />

      {/* Cancel-at-period-end notice */}
      {subscription.cancelAtPeriodEnd ? (
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-warning-foreground">
          This subscription is set to be cancelled at the end of the current period (
          {formatDate(subscription.currentPeriodEnd ?? subscription.nextRenewalDate)}). Turn
          auto-renew back on or resume it to keep it running.
        </div>
      ) : null}

      {/* Body */}
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <div className="min-w-0 space-y-4">
          {/* Linked invoices */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Invoices</CardTitle>
              <CardDescription>
                Renewal invoices generated for this subscription.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.invoices.length === 0 ? (
                <p className="rounded-lg border border-dashed bg-muted/30 px-3 py-4 text-center text-sm text-muted-foreground">
                  No invoices yet. Renewal invoices appear here (use “Generate renewal invoice now”
                  to create the next one manually).
                </p>
              ) : (
                <ul className="divide-y">
                  {data.invoices.map((invoice) => (
                    <li key={invoice.id} className="flex items-center justify-between gap-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => openInvoice(invoice.id)}
                        className="flex min-h-9 flex-wrap items-center gap-2 text-sm font-medium underline-offset-2 hover:underline"
                      >
                        {invoice.displayNumber}
                        <StatusBadge value={invoice.status} />
                        <span className="text-xs font-normal text-muted-foreground">
                          {invoice.periodStart
                            ? `period ${formatDate(invoice.periodStart)} – ${formatDate(invoice.periodEnd)}`
                            : ""}
                        </span>
                      </button>
                      <span className="shrink-0 text-sm font-medium tabular-nums">
                        {formatCurrency(invoice.totalMinor, invoice.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Events timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ActivityIcon aria-hidden className="size-4 text-muted-foreground" />
                Subscription events
              </CardTitle>
              <CardDescription>
                Creation, plan/price changes, status changes and renewal invoices.
              </CardDescription>
            </CardHeader>
            <CardContent className="scrollbar-thin max-h-96 overflow-y-auto">
              {data.events.length === 0 ? (
                <EmptyState
                  icon={ActivityIcon}
                  title="No events yet"
                  description="Changes to this subscription are recorded here."
                  className="border-0 py-8"
                />
              ) : (
                <ol className="relative space-y-4">
                  <span aria-hidden className="absolute top-2 bottom-2 left-[5px] w-px bg-border" />
                  {data.events.map((event) => (
                    <li key={event.id} className="relative flex gap-3">
                      <span
                        aria-hidden
                        className="z-10 mt-1.5 size-2.5 shrink-0 rounded-full bg-muted-foreground/40 ring-4 ring-card"
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-sm leading-snug font-medium break-words">{event.summary}</p>
                        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-px text-[11px] font-medium">
                            {label(event.kind)}
                          </span>
                          {event.actorName ? <span>{event.actorName}</span> : null}
                          <span aria-hidden>·</span>
                          <span>{timeAgo(event.createdAt)}</span>
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <aside className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock aria-hidden className="size-4 text-muted-foreground" />
                Billing period
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <PeriodRow label="Start date" value={formatDate(subscription.startDate)} />
              <PeriodRow
                label="Current period start"
                value={formatDate(subscription.currentPeriodStart)}
              />
              <PeriodRow
                label="Current period end"
                value={formatDate(subscription.currentPeriodEnd)}
              />
              <PeriodRow
                label="Next renewal"
                value={formatDate(subscription.nextRenewalDate)}
                className={cn(
                  subscription.status === "ACTIVE" &&
                    subscription.nextRenewalDate &&
                    new Date(subscription.nextRenewalDate).getTime() < Date.now()
                    ? "font-medium text-destructive"
                    : "",
                )}
              />
              <PeriodRow label="Trial ends" value={formatDate(subscription.trialEndDate)} />
              <div className="border-t pt-2 text-xs text-muted-foreground">
                {subscription.autoInvoice
                  ? "Renewal invoices are created automatically when the renewal date arrives."
                  : "Auto-invoicing is off — create renewal invoices manually."}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Automation</CardTitle>
              <CardDescription>Saved immediately.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <label
                htmlFor="sub-detail-auto-invoice"
                className="flex cursor-pointer items-center justify-between gap-4"
              >
                <span className="text-sm font-medium">Auto-invoice renewals</span>
                <Switch
                  id="sub-detail-auto-invoice"
                  checked={subscription.autoInvoice}
                  onCheckedChange={(checked) => flagsMutation.mutate({ autoInvoice: checked })}
                  disabled={flagsMutation.isPending}
                />
              </label>
              <label
                htmlFor="sub-detail-auto-renew"
                className="flex cursor-pointer items-center justify-between gap-4"
              >
                <span className="text-sm font-medium">Auto-renew</span>
                <Switch
                  id="sub-detail-auto-renew"
                  checked={subscription.autoRenew}
                  onCheckedChange={(checked) => flagsMutation.mutate({ autoRenew: checked })}
                  disabled={flagsMutation.isPending}
                />
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Agreement</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <PeriodRow label="Plan" value={subscription.planName ?? "Custom"} />
              <PeriodRow
                label="Agreed price"
                value={`${formatCurrency(subscription.agreedPriceMinor, subscription.currency)} / ${intervalNoun(subscription.billingInterval)}`}
              />
              <PeriodRow
                label="MRR contribution"
                value={formatCurrency(subscription.monthlyEquivalentMinor, subscription.currency)}
              />
              <PeriodRow
                label="Tax rate"
                value={
                  subscription.taxRateBps > 0
                    ? `${(subscription.taxRateBps / 100).toFixed(subscription.taxRateBps % 100 === 0 ? 0 : 2)}%`
                    : "—"
                }
              />
              <PeriodRow label="Created" value={formatDateTime(subscription.createdAt)} />
            </CardContent>
          </Card>

          {/* Internal notes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Internal notes</CardTitle>
              <CardDescription>Only visible to your team.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Label htmlFor="sub-internal-notes" className="sr-only">
                Internal notes
              </Label>
              <Textarea
                id="sub-internal-notes"
                rows={4}
                value={notes}
                onChange={(event) => {
                  setNotes(event.target.value);
                  setNotesDirty(true);
                }}
                placeholder="e.g. Agreed on a call — 3 months at a discount."
              />
              <Button
                size="sm"
                className="min-h-9"
                onClick={() => notesMutation.mutate()}
                disabled={notesMutation.isPending || !notesDirty}
              >
                {notesMutation.isPending ? (
                  <Loader2 aria-hidden className="size-4 animate-spin" />
                ) : null}
                Save notes
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>

      {/* Edit dialog */}
      {editOpen ? (
        <SubscriptionFormDialog
          open
          onOpenChange={setEditOpen}
          subscription={subscription}
        />
      ) : null}

      {/* Simple status confirms (activate / pause / resume / end) */}
      <ConfirmDialog
        open={action === "activate" || action === "resume" || action === "pause" || action === "end"}
        onOpenChange={(open) => !open && setAction(null)}
        title={
          action === "activate"
            ? "Activate this subscription?"
            : action === "resume"
              ? "Resume this subscription?"
              : action === "pause"
                ? "Pause this subscription?"
                : "End this subscription?"
        }
        description={
          action === "activate"
            ? "The subscription becomes active — renewals are billed according to its settings."
            : action === "resume"
              ? "Billing resumes from the current period."
              : action === "pause"
                ? "Renewals and renewal invoices are suspended while paused. You can resume it at any time."
                : "Ending is final — the subscription stops permanently and cannot be reactivated. Historical invoices are kept."
        }
        confirmLabel={
          action === "activate"
            ? "Activate"
            : action === "resume"
              ? "Resume"
              : action === "pause"
                ? "Pause"
                : "End subscription"
        }
        destructive={action === "end"}
        loading={statusMutation.isPending}
        onConfirm={() => {
          if (!action) return;
          statusMutation.mutate(
            { action },
            { onSuccess: () => setAction(null) },
          );
        }}
      />

      {/* Cancel dialog — now vs at period end */}
      <Dialog open={action === "cancel"} onOpenChange={(open) => !open && setAction(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel this subscription?</DialogTitle>
            <DialogDescription>
              Choose whether to cancel immediately or at the end of the current period
              {subscription.currentPeriodEnd ? ` (${formatDate(subscription.currentPeriodEnd)})` : ""}.
              Historical invoices are kept either way.
            </DialogDescription>
          </DialogHeader>
          <label
            htmlFor="sub-cancel-period-end"
            className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border p-3.5 transition-colors hover:bg-muted/40"
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium">
                Cancel at period end
                {subscription.currentPeriodEnd
                  ? ` (${formatDate(subscription.currentPeriodEnd)})`
                  : ""}
              </span>
              <span className="block text-xs text-muted-foreground">
                Leave unchecked to cancel immediately.
              </span>
            </span>
            <Switch
              id="sub-cancel-period-end"
              checked={cancelAtPeriodEnd}
              onCheckedChange={setCancelAtPeriodEnd}
              disabled={subscription.status !== "ACTIVE"}
            />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAction(null)} disabled={statusMutation.isPending}>
              Keep subscription
            </Button>
            <Button
              variant="destructive"
              disabled={statusMutation.isPending}
              onClick={() => {
                statusMutation.mutate(
                  { action: "cancel", cancelAtPeriodEnd: cancelAtPeriodEnd || undefined },
                  { onSuccess: () => setAction(null) },
                );
              }}
            >
              {statusMutation.isPending ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : null}
              {cancelAtPeriodEnd ? "Cancel at period end" : "Cancel now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PeriodRow({
  label: rowLabel,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-xs text-muted-foreground">{rowLabel}</span>
      <span className={cn("text-right text-sm", className)}>{value}</span>
    </div>
  );
}
