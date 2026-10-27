"use client";

/**
 * AgencyOS — shared billing tab for client detail AND website detail.
 * Props: {clientId?, websiteId?} — every section is filtered by whichever id
 * is set. Reads-only rows navigate to the full billing views.
 */
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Banknote,
  FileText,
  ReceiptText,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { buildQuery } from "@/components/agency/shared/record-list-helpers";
import { openBilling, openInvoice, openQuote, openSubscription } from "@/components/agency/store";
import {
  apiFetch,
  UNPAID_INVOICE_STATUSES,
  type InvoiceRecord,
  type Paginated,
  type PaymentRecord,
  type QuoteRecord,
  type SubscriptionRecord,
} from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";
import { intervalNoun, MoneyText } from "@/components/agency/views/billing/bits";

const SECTION_SIZE = 5;
const SUMMARY_SIZE = 50;

export function EntityBillingTab({ clientId, websiteId }: { clientId?: string; websiteId?: string }) {
  const scope: Record<string, string> = clientId ? { clientId } : websiteId ? { websiteId } : {};

  const invoicesQuery = useQuery({
    queryKey: ["invoices", "entity", clientId ?? "", websiteId ?? ""],
    queryFn: () =>
      apiFetch<Paginated<InvoiceRecord>>(
        `/api/billing/invoices${buildQuery({ ...scope, pageSize: SUMMARY_SIZE, sort: "issueDate", dir: "desc" })}`,
      ),
  });
  const quotesQuery = useQuery({
    queryKey: ["quotes", "entity", clientId ?? "", websiteId ?? ""],
    queryFn: () =>
      apiFetch<Paginated<QuoteRecord>>(
        `/api/billing/quotes${buildQuery({ ...scope, pageSize: SECTION_SIZE, sort: "issueDate", dir: "desc" })}`,
      ),
  });
  const subscriptionsQuery = useQuery({
    queryKey: ["subscriptions", "entity", clientId ?? "", websiteId ?? ""],
    queryFn: () =>
      apiFetch<Paginated<SubscriptionRecord>>(
        `/api/billing/subscriptions${buildQuery({ ...scope, pageSize: SUMMARY_SIZE, sort: "nextRenewalDate", dir: "asc" })}`,
      ),
  });
  const paymentsQuery = useQuery({
    queryKey: ["payments", "entity", clientId ?? "", websiteId ?? ""],
    queryFn: () =>
      apiFetch<Paginated<PaymentRecord>>(
        `/api/billing/payments${buildQuery({ ...scope, pageSize: SECTION_SIZE, sort: "paidAt", dir: "desc" })}`,
      ),
  });

  const invoices = invoicesQuery.data?.items ?? [];
  const quotes = quotesQuery.data?.items ?? [];
  const subscriptions = subscriptionsQuery.data?.items ?? [];
  const payments = paymentsQuery.data?.items ?? [];

  // Outstanding balance — computed client-side from the invoice list.
  const outstandingMinor = invoices
    .filter((invoice) => (UNPAID_INVOICE_STATUSES as readonly string[]).includes(invoice.status))
    .reduce((sum, invoice) => sum + invoice.outstandingMinor, 0);

  const activeSubscriptions = subscriptions.filter(
    (subscription) => subscription.status === "ACTIVE" || subscription.status === "PAST_DUE",
  );
  const nextRenewal = activeSubscriptions
    .map((subscription) => subscription.nextRenewalDate)
    .filter((date): date is string => Boolean(date))
    .sort()[0];

  const invoicesTotal = invoicesQuery.data?.total ?? 0;
  const quotesTotal = quotesQuery.data?.total ?? 0;
  const subscriptionsTotal = subscriptionsQuery.data?.total ?? 0;
  const paymentsTotal = paymentsQuery.data?.total ?? 0;

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Outstanding balance</p>
          {invoicesQuery.isLoading ? (
            <Skeleton className="mt-2 h-7 w-24" />
          ) : (
            <p
              className={`mt-1 text-2xl font-semibold tabular-nums ${
                outstandingMinor > 0 ? "text-destructive" : ""
              }`}
            >
              {formatCurrency(outstandingMinor)}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">Unpaid issued invoices</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Subscriptions</p>
          {subscriptionsQuery.isLoading ? (
            <Skeleton className="mt-2 h-7 w-24" />
          ) : (
            <p className="mt-1 text-2xl font-semibold tabular-nums">{activeSubscriptions.length}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {nextRenewal ? `Next renewal ${formatDate(nextRenewal)}` : "No active agreements"}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Quotes awaiting decision</p>
          {quotesQuery.isLoading ? (
            <Skeleton className="mt-2 h-7 w-24" />
          ) : (
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {quotes.filter((quote) => quote.status === "SENT").length}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">Sent, not yet accepted</p>
        </div>
      </div>

      {/* Invoices */}
      <SectionCard
        title="Invoices"
        icon={ReceiptText}
        count={invoicesTotal}
        loading={invoicesQuery.isLoading}
        error={(invoicesQuery.error as Error | undefined)?.message}
        onRetry={() => void invoicesQuery.refetch()}
        seeAllLabel="See all invoices"
        onSeeAll={() => openBilling("invoices", { ...scope })}
        emptyTitle="No invoices yet"
        emptyDescription="Invoices drafted or issued for this record will appear here."
      >
        {invoices.slice(0, SECTION_SIZE).map((invoice) => (
          <SectionRow
            key={invoice.id}
            onClick={() => openInvoice(invoice.id)}
            title={invoice.displayNumber}
            subtitle={formatDate(invoice.issueDate)}
            badge={<StatusBadge value={invoice.status} />}
            right={
              <span className="text-right">
                <MoneyText
                  minor={invoice.totalMinor}
                  currency={invoice.currency}
                  className="block text-sm font-medium"
                />
                {invoice.outstandingMinor > 0 ? (
                  <MoneyText
                    minor={invoice.outstandingMinor}
                    currency={invoice.currency}
                    className="block text-xs text-destructive"
                  />
                ) : null}
              </span>
            }
          />
        ))}
      </SectionCard>

      {/* Quotes */}
      <SectionCard
        title="Quotes"
        icon={FileText}
        count={quotesTotal}
        loading={quotesQuery.isLoading}
        error={(quotesQuery.error as Error | undefined)?.message}
        onRetry={() => void quotesQuery.refetch()}
        seeAllLabel="See all quotes"
        onSeeAll={() => openBilling("quotes", { ...scope })}
        emptyTitle="No quotes yet"
        emptyDescription="Quotes drafted for this record will appear here."
      >
        {quotes.map((quote) => (
          <SectionRow
            key={quote.id}
            onClick={() => openQuote(quote.id)}
            title={quote.displayNumber}
            subtitle={`Issued ${formatDate(quote.issueDate)}`}
            badge={<StatusBadge value={quote.status} />}
            right={
              <MoneyText
                minor={quote.totalMinor}
                currency={quote.currency}
                className="text-sm font-medium"
              />
            }
          />
        ))}
      </SectionCard>

      {/* Subscriptions */}
      <SectionCard
        title="Subscriptions"
        icon={RefreshCw}
        count={subscriptionsTotal}
        loading={subscriptionsQuery.isLoading}
        error={(subscriptionsQuery.error as Error | undefined)?.message}
        onRetry={() => void subscriptionsQuery.refetch()}
        seeAllLabel="See all subscriptions"
        onSeeAll={() => openBilling("subscriptions", { ...scope })}
        emptyTitle="No subscriptions yet"
        emptyDescription="Recurring agreements for this record will appear here."
      >
        {subscriptions.slice(0, SECTION_SIZE).map((subscription) => (
          <SectionRow
            key={subscription.id}
            onClick={() => openSubscription(subscription.id)}
            title={subscription.planName ?? "Custom"}
            subtitle={
              subscription.nextRenewalDate
                ? `Renews ${formatDate(subscription.nextRenewalDate)}`
                : `Started ${formatDate(subscription.startDate)}`
            }
            badge={<StatusBadge value={subscription.status} />}
            right={
              <span className="text-sm font-medium tabular-nums">
                {formatCurrency(subscription.agreedPriceMinor, subscription.currency)}
                <span className="block text-xs font-normal text-muted-foreground">
                  / {intervalNoun(subscription.billingInterval)}
                </span>
              </span>
            }
          />
        ))}
      </SectionCard>

      {/* Payments (read-only here) */}
      <SectionCard
        title="Payments"
        icon={Banknote}
        count={paymentsTotal}
        loading={paymentsQuery.isLoading}
        error={(paymentsQuery.error as Error | undefined)?.message}
        onRetry={() => void paymentsQuery.refetch()}
        seeAllLabel="See all payments"
        onSeeAll={() => openBilling("payments", { ...scope })}
        emptyTitle="No payments yet"
        emptyDescription="Recorded payments will appear here. Manage them from the Billing › Payments tab."
      >
        {payments.map((payment) => (
          <SectionRow
            key={payment.id}
            onClick={() => openBilling("payments", { ...scope })}
            title={payment.displayNumber}
            subtitle={`${formatDate(payment.paidAt)}${payment.referenceNum ? ` · ref ${payment.referenceNum}` : ""}`}
            badge={<StatusBadge value={payment.status} />}
            right={
              <MoneyText
                minor={payment.effectiveMinor}
                currency={payment.currency}
                className="text-sm font-medium"
              />
            }
          />
        ))}
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SectionCard({
  title,
  icon: Icon,
  count,
  loading,
  error,
  onRetry,
  seeAllLabel,
  onSeeAll,
  emptyTitle,
  emptyDescription,
  children,
}: {
  title: string;
  icon: typeof ReceiptText;
  count: number;
  loading: boolean;
  error?: string;
  onRetry: () => void;
  seeAllLabel: string;
  onSeeAll: () => void;
  emptyTitle: string;
  emptyDescription: string;
  children: React.ReactNode;
}) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon aria-hidden className="size-4 text-muted-foreground" />
            {title}
            {!loading && !error ? (
              <span className="text-xs font-normal tabular-nums text-muted-foreground">
                ({count})
              </span>
            ) : null}
          </CardTitle>
        </div>
        {count > 0 ? (
          <Button variant="outline" size="sm" className="min-h-9" onClick={onSeeAll}>
            {seeAllLabel}
            <ArrowRight aria-hidden />
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2" aria-busy>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm">
            <span className="text-destructive">Could not load {title.toLowerCase()}.</span>
            <Button variant="outline" size="sm" className="min-h-9" onClick={onRetry}>
              Retry
            </Button>
          </div>
        ) : count === 0 || !hasRows ? (
          <EmptyState icon={Icon} title={emptyTitle} description={emptyDescription} className="border-0 py-6" />
        ) : (
          <div className="divide-y">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

function SectionRow({
  onClick,
  title,
  subtitle,
  badge,
  right,
}: {
  onClick: () => void;
  title: string;
  subtitle: string;
  badge: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full min-h-11 items-center justify-between gap-3 py-2.5 text-left outline-none transition-colors first:pt-0 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{title}</span>
          {badge}
        </span>
        <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          {subtitle}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {right}
        <ArrowRight aria-hidden className="size-4 text-muted-foreground/60" />
      </span>
    </button>
  );
}
