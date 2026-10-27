"use client";

/**
 * AgencyOS — Billing › Overview tab.
 *
 * Summary KPI grid (every card states where its figure comes from — the API
 * embeds metric definitions), upcoming renewals queue, recent payments,
 * honest gateway status and a manual billing-jobs maintenance card.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  BadgeCheck,
  CalendarClock,
  ChevronDown,
  CircleAlert,
  CreditCard,
  FileClock,
  Info,
  Loader2,
  ReceiptText,
  RefreshCw,
  Repeat,
  Wallet,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { KpiCard } from "@/components/agency/shared/kpi-card";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { openBilling, openSubscription, useAppStore } from "@/components/agency/store";
import { apiFetch, type BillingJobRunData } from "@/lib/types";
import { formatCurrency, formatDate, timeAgo } from "@/lib/format";
import {
  BillingListSkeleton,
  MoneyText,
  intervalNoun,
  useBillingSummary,
} from "@/components/agency/views/billing/bits";

export function OverviewTab() {
  const navigate = useAppStore((s) => s.navigate);
  const summary = useBillingSummary();
  const data = summary.data;

  if (summary.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4" aria-busy>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-4">
              <div className="h-3.5 w-24 animate-pulse rounded bg-muted" />
              <div className="mt-3 h-7 w-16 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
        <BillingListSkeleton rows={3} />
      </div>
    );
  }

  if (summary.isError || !data) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Billing summary could not be loaded"
        description={(summary.error as Error | undefined)?.message ?? "Something went wrong."}
        action={
          <Button variant="outline" onClick={() => void summary.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <GatewayAlert gateway={data.gateway} />

      {/* Summary KPIs */}
      <section aria-label="Billing summary" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <KpiCard
          title="Outstanding balance"
          icon={ReceiptText}
          value={formatCurrency(data.outstandingMinor)}
          tone={data.outstandingMinor > 0 ? "danger" : "default"}
          hint="Unpaid issued invoices"
          onClick={() => openBilling("invoices")}
        />
        <KpiCard
          title="Overdue"
          icon={CircleAlert}
          value={String(data.overdueCount)}
          tone={data.overdueCount > 0 ? "danger" : "default"}
          hint={formatCurrency(data.overdueMinor)}
          onClick={() => openBilling("invoices", { status: "OVERDUE" })}
        />
        <KpiCard
          title="Payments received"
          icon={Wallet}
          value={formatCurrency(data.collectedMinor)}
          tone="success"
          hint={`${formatCurrency(data.collectedThisMonthMinor)} this month`}
          onClick={() => openBilling("payments")}
        />
        <KpiCard
          title="Pending payments"
          icon={FileClock}
          value={formatCurrency(data.pendingPaymentsMinor)}
          tone={data.pendingPaymentsCount > 0 ? "warning" : "default"}
          hint={`${data.pendingPaymentsCount} awaiting verification`}
          onClick={() => openBilling("payments", { status: "PENDING" })}
        />
        <KpiCard
          title="MRR"
          icon={Repeat}
          value={formatCurrency(data.mrrMinor)}
          hint="Normalised monthly recurring revenue"
        />
        <KpiCard
          title="Active subscriptions"
          icon={RefreshCw}
          value={String(data.activeSubscriptions)}
          hint={data.pastDueSubscriptions > 0 ? `${data.pastDueSubscriptions} past due` : "recurring plans"}
          onClick={() => openBilling("subscriptions")}
        />
        <KpiCard
          title="Quotes awaiting decision"
          icon={CreditCard}
          value={String(data.quotesAwaiting)}
          tone={data.quotesAwaiting > 0 ? "warning" : "default"}
          hint="Sent, not yet accepted"
          onClick={() => openBilling("quotes", { status: "SENT" })}
        />
        <KpiCard
          title="Invoiced total"
          icon={BadgeCheck}
          value={formatCurrency(data.invoicedMinor)}
          hint="Issued (non-void) invoices"
        />
      </section>

      {/* Metric definitions — makes the figures transparent */}
      <MetricDefinitions definitions={data.definitions} />

      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        <UpcomingRenewalsCard
          items={data.upcomingRenewals.map((item) => ({
            subscriptionId: item.subscriptionId,
            clientName: item.clientName,
            websiteName: item.websiteName,
            planName: item.planName,
            nextRenewalDate: item.nextRenewalDate,
            amountMinor: item.amountMinor,
            currency: item.currency,
            billingInterval: item.billingInterval,
          }))}
        />
        <RecentPaymentsCard
          payments={data.recentPayments}
          onOpenPayments={() => navigate("billing", { tab: "payments" })}
        />
      </div>

      <MaintenanceCard lastJobRunAt={data.lastJobRunAt} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function GatewayAlert({ gateway }: { gateway: { provider: string | null; configured: boolean; message: string } }) {
  if (gateway.configured) {
    return (
      <Alert>
        <BadgeCheck aria-hidden className="size-4" />
        <AlertTitle>Online payments enabled</AlertTitle>
        <AlertDescription>
          {gateway.message || `Gateway: ${gateway.provider ?? "configured"}.`}
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert>
      <Info aria-hidden className="size-4" />
      <AlertTitle>Online payment collection is unavailable</AlertTitle>
      <AlertDescription>
        {gateway.message ||
          "No payment gateway is connected. Record payments manually — when a gateway is configured, online collection becomes available here."}
      </AlertDescription>
    </Alert>
  );
}

function MetricDefinitions({
  definitions,
}: {
  definitions: { key: string; label: string; definition: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 h-9 w-fit gap-1.5 text-sm font-medium"
              aria-expanded={open}
            >
              <ChevronDown
                aria-hidden
                className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
              />
              Metric definitions — how these figures are calculated
            </Button>
          </CollapsibleTrigger>
          <CardDescription className="sr-only">
            Exact data sources behind every number on this page.
          </CardDescription>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-2.5 pt-0">
            {definitions.map((definition) => (
              <div key={definition.key} className="grid gap-0.5 border-b pb-2.5 last:border-0 sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-4 sm:pb-2">
                <span className="text-sm font-medium">{definition.label}</span>
                <span className="text-sm text-muted-foreground">{definition.definition}</span>
              </div>
            ))}
            {definitions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No definitions provided.</p>
            ) : null}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

interface RenewalItem {
  subscriptionId: string;
  clientName: string;
  websiteName: string | null;
  planName: string | null;
  nextRenewalDate: string;
  amountMinor: number;
  currency: string;
  billingInterval: string;
}

export function UpcomingRenewalsCard({ items }: { items: RenewalItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock aria-hidden className="size-4 text-muted-foreground" />
          Upcoming renewals
        </CardTitle>
        <CardDescription>Subscription renewals coming up.</CardDescription>
      </CardHeader>
      <CardContent className="scrollbar-thin max-h-80 space-y-1 overflow-y-auto">
        {items.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No upcoming renewals"
            description="Active subscriptions with a renewal date will appear here."
            className="border-0 py-8"
          />
        ) : (
          items.map((item) => (
            <button
              key={item.subscriptionId}
              type="button"
              onClick={() => openSubscription(item.subscriptionId)}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{item.clientName}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {item.planName ?? "Custom"}
                  {item.websiteName ? ` · ${item.websiteName}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-medium tabular-nums">
                  {formatCurrency(item.amountMinor, item.currency)}
                  <span className="text-xs font-normal text-muted-foreground">
                    {" "}
                    / {intervalNoun(item.billingInterval)}
                  </span>
                </span>
                <span className="block text-xs text-muted-foreground">
                  {formatDate(item.nextRenewalDate)}
                </span>
              </span>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function RecentPaymentsCard({
  payments,
  onOpenPayments,
}: {
  payments: { id: string; displayNumber: string; status: string; amountMinor: number; currency: string; effectiveMinor: number; paidAt: string; client?: { businessName: string } | null }[];
  onOpenPayments: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet aria-hidden className="size-4 text-muted-foreground" />
            Recent payments
          </CardTitle>
          <CardDescription>Latest recorded payments across all clients.</CardDescription>
        </div>
        <Button variant="outline" size="sm" className="min-h-9" onClick={onOpenPayments}>
          View all
        </Button>
      </CardHeader>
      <CardContent className="scrollbar-thin max-h-80 space-y-1 overflow-y-auto">
        {payments.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No payments yet"
            description="Record a payment from the Payments tab or an issued invoice."
            className="border-0 py-8"
          />
        ) : (
          payments.map((payment) => (
            <button
              key={payment.id}
              type="button"
              onClick={onOpenPayments}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <StatusBadge value={payment.status} />
                  <span className="truncate text-xs text-muted-foreground">
                    {payment.displayNumber} · {payment.client?.businessName ?? "—"}
                  </span>
                </span>
              </span>
              <span className="shrink-0 text-right">
                <MoneyText minor={payment.effectiveMinor} currency={payment.currency} className="block text-sm font-medium" />
                <span className="block text-xs text-muted-foreground">{timeAgo(payment.paidAt)}</span>
              </span>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function MaintenanceCard({ lastJobRunAt }: { lastJobRunAt: string | null }) {
  const queryClient = useQueryClient();
  const runMutation = useMutation({
    mutationFn: () =>
      apiFetch<BillingJobRunData>("/api/billing/jobs/run", {
        method: "POST",
        body: JSON.stringify({ trigger: "MANUAL" }),
      }),
    onSuccess: (data) => {
      const byTask = new Map(data.results.map((result) => [result.task, result.changed]));
      const expired = byTask.get("EXPIRE_QUOTES") ?? 0;
      const flagged = byTask.get("FLAG_OVERDUE") ?? 0;
      const created = byTask.get("RENEWAL_INVOICES") ?? 0;
      toast.success(
        `Expired ${expired} quotes · flagged ${flagged} invoices · created ${created} renewal invoices`,
      );
      void queryClient.invalidateQueries({ queryKey: ["billing-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["quotes"] });
      void queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: Error) => toast.error(error.message || "Billing tasks could not run."),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wrench aria-hidden className="size-4 text-muted-foreground" />
          Billing maintenance
        </CardTitle>
        <CardDescription>
          Expires sent quotes past their expiry date, flags overdue invoices, marks past-due
          subscriptions and creates renewal invoices for subscriptions due. The server also runs
          these tasks automatically on a schedule.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {lastJobRunAt ? (
            <>
              Last run: <span className="font-medium text-foreground">{formatDate(lastJobRunAt)}</span> (
              {timeAgo(lastJobRunAt)})
            </>
          ) : (
            "Billing tasks have not run yet."
          )}
        </p>
        <Button
          variant="outline"
          className="min-h-9"
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending}
        >
          {runMutation.isPending ? (
            <Loader2 aria-hidden className="size-4 animate-spin" />
          ) : (
            <RefreshCw aria-hidden />
          )}
          Run billing tasks now
        </Button>
      </CardContent>
    </Card>
  );
}
