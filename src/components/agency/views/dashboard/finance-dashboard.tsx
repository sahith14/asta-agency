"use client";

/**
 * AgencyOS — Support & Finance dashboard (Phase 5, spec §7).
 * Ticket queues by priority, awaiting response, reconciliation queue, failed
 * payments, overdue invoices, renewals. Revenue figures distinguish collected
 * cash (verified payments) from outstanding invoices — unpaid invoices are
 * never counted as cash.
 */
import { navigate, openInvoice, openTicket } from "@/components/agency/store";
import { KpiCard } from "@/components/agency/shared/kpi-card";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { BillingRenewalsCard } from "@/components/agency/views/billing/renewals-card";
import { formatCurrency } from "@/lib/format";
import { type DashboardData } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import {
  AlarmClock,
  CircleAlert,
  Clock,
  LifeBuoy,
  ReceiptText,
  RefreshCw,
  Wallet,
} from "lucide-react";

function formatMoney(minor: number, currency: string): string {
  return formatCurrency(minor, currency);
}

export function FinanceDashboard({ data }: { data: NonNullable<DashboardData["finance"]> }) {
  const k = data.kpis;
  const money = (m: number) => formatMoney(m, "GBP");

  const kpis = [
    { title: "Open tickets", icon: LifeBuoy, value: k.openTickets, onClick: () => navigate("support") },
    { title: "Awaiting response", icon: Clock, value: k.ticketsAwaitingResponse, tone: k.ticketsAwaitingResponse > 0 ? ("warning" as const) : ("default" as const) },
    { title: "SLA breached", icon: AlarmClock, value: k.slaBreached, tone: k.slaBreached > 0 ? ("danger" as const) : ("default" as const) },
    { title: "Reconciliation queue", icon: Wallet, value: k.reconciliationQueue, hint: "unverified payments", onClick: () => navigate("billing", { tab: "payments", status: "PENDING" }) },
    { title: "Failed payments", icon: CircleAlert, value: k.failedPayments, tone: k.failedPayments > 0 ? ("danger" as const) : ("default" as const), onClick: () => navigate("billing", { tab: "payments", status: "FAILED" }) },
    { title: "Overdue invoices", icon: ReceiptText, value: k.overdueInvoices, tone: k.overdueInvoices > 0 ? ("danger" as const) : ("default" as const), onClick: () => navigate("billing", { tab: "invoices", status: "OVERDUE" }) },
    { title: "Outstanding", icon: ReceiptText, value: money(k.outstandingMinor), hint: "unpaid invoices only", onClick: () => navigate("billing", { tab: "invoices" }) },
    { title: "Renewals (30d)", icon: RefreshCw, value: k.upcomingRenewals30d, onClick: () => navigate("billing", { tab: "subscriptions" }) },
  ];

  return (
    <div className="space-y-6">
      <section aria-label="Finance KPIs" className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        {kpis.map((def) => (
          <KpiCard key={def.title} title={def.title} value={def.value} icon={def.icon} tone={def.tone ?? "default"} hint={def.hint} onClick={def.onClick} />
        ))}
      </section>

      <section aria-label="Ticket load" className="flex flex-wrap gap-2">
        {[
          { key: "CRITICAL", count: data.ticketsByPriority.critical },
          { key: "HIGH", count: data.ticketsByPriority.high },
          { key: "NORMAL", count: data.ticketsByPriority.normal },
          { key: "LOW", count: data.ticketsByPriority.low },
        ].map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => navigate("support", { priority: p.key })}
            className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-accent/40"
          >
            <span className="text-xs font-medium text-muted-foreground">{p.key}</span>
            <span className={p.count > 0 && (p.key === "CRITICAL" || p.key === "HIGH") ? "font-semibold text-destructive" : "font-semibold"}>
              {p.count}
            </span>
          </button>
        ))}
      </section>

      <section aria-label="Finance queues" className="grid gap-4 lg:grid-cols-2">
        {/* Awaiting response */}
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Tickets awaiting first response</h3>
            <span className="text-xs text-muted-foreground">{data.ticketsAwaitingResponseTop.length}</span>
          </div>
          {data.ticketsAwaitingResponseTop.length === 0 ? (
            <EmptyState title="Nothing awaiting response" className="border-0" />
          ) : (
            <ul className="max-h-72 divide-y overflow-y-auto scrollbar-thin">
              {data.ticketsAwaitingResponseTop.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => openTicket(t.id)} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-accent/40">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {t.displayNumber} · {t.subject}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t.clientName} · opened {formatDateTime(t.createdAt)}
                      </span>
                    </span>
                    <StatusBadge value={t.priority} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Reconciliation queue */}
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Payment reconciliation queue</h3>
            <span className="text-xs text-muted-foreground">{data.reconciliationQueueTop.length}</span>
          </div>
          {data.reconciliationQueueTop.length === 0 ? (
            <EmptyState title="No pending payments" description="Manually recorded transfers await verification here." className="border-0" />
          ) : (
            <ul className="max-h-72 divide-y overflow-y-auto scrollbar-thin">
              {data.reconciliationQueueTop.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => navigate("billing", { tab: "payments", status: "PENDING" })} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-accent/40">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {p.displayRef} · {money(p.amountMinor)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {p.clientName} · {p.invoiceNumber ?? "unallocated"} · {p.method}
                      </span>
                    </span>
                    <StatusBadge value="PENDING" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Failed payments */}
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Failed payments</h3>
            <span className="text-xs text-muted-foreground">{data.failedPaymentsTop.length}</span>
          </div>
          {data.failedPaymentsTop.length === 0 ? (
            <EmptyState title="No failed payments" className="border-0" />
          ) : (
            <ul className="max-h-72 divide-y overflow-y-auto scrollbar-thin">
              {data.failedPaymentsTop.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {p.invoiceNumber ?? "Unallocated"} · {money(p.amountMinor)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {p.clientName} · {formatDateTime(p.createdAt)}
                    </span>
                  </span>
                  <StatusBadge value="FAILED" />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Overdue invoices */}
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Overdue invoices</h3>
            <span className="text-xs text-muted-foreground">{data.overdueInvoicesTop.length}</span>
          </div>
          {data.overdueInvoicesTop.length === 0 ? (
            <EmptyState title="No overdue invoices" className="border-0" />
          ) : (
            <ul className="max-h-72 divide-y overflow-y-auto scrollbar-thin">
              {data.overdueInvoicesTop.map((inv) => (
                <li key={inv.id}>
                  <button type="button" onClick={() => openInvoice(inv.id)} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-accent/40">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {inv.displayNumber} · {money(inv.outstandingMinor)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {inv.clientName} · {inv.dueDate ? `due ${formatDateTime(inv.dueDate)}` : "no due date"}
                      </span>
                    </span>
                    <StatusBadge value="OVERDUE" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {data.upcomingRenewals.length > 0 ? (
        <section aria-label="Upcoming renewals">
          <BillingRenewalsCard items={data.upcomingRenewals} />
        </section>
      ) : null}
    </div>
  );
}
