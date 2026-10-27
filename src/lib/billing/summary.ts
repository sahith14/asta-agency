/**
 * AgencyOS — billing metrics (Phase 3, server-only).
 *
 * Real DB queries only; every figure documents its own formula via the
 * `definitions` array returned with the summary. Honest accounting rules:
 * - only VERIFIED payments count as collected (net of refunds);
 * - PENDING payments are informational and never count as money received;
 * - unpaid invoices are NOT revenue; MRR excludes one-off invoices;
 * - DRAFT and VOID invoices are excluded from invoiced totals.
 */
import "server-only";
import { db } from "@/lib/db";
import { monthlyEquivalentMinor } from "@/lib/money";
import { getBillingSettings } from "@/lib/billing/settings";
import { getGatewayStatus } from "@/lib/billing/gateway";
import { getLastBillingJobRun } from "@/lib/billing/jobs";
import {
  computeDerived,
  groupPaymentsFromAllocations,
  startOfToday,
} from "@/lib/billing/invoice-math";
import {
  paymentInclude,
  subscriptionInclude,
  toBillingRenewalItem,
  toPaymentRecord,
} from "@/lib/billing/record";
import { UNPAID_INVOICE_STATUSES, type BillingSummaryData, type BillingRenewalItem } from "@/lib/types";

// ---------------------------------------------------------------------------
// Shared queries
// ---------------------------------------------------------------------------

interface UnpaidInvoiceRow {
  id: string;
  status: string;
  totalMinor: number;
  dueDate: Date | null;
  allocations: {
    id: string;
    paymentId: string;
    amountMinor: number;
    payment: { id: string; status: string; amountMinor: number; refundMinor: number };
  }[];
}

async function loadUnpaidInvoiceRows(): Promise<UnpaidInvoiceRow[]> {
  return db.invoice.findMany({
    where: { status: { in: [...UNPAID_INVOICE_STATUSES] } },
    select: {
      id: true,
      status: true,
      totalMinor: true,
      dueDate: true,
      allocations: {
        select: { id: true, paymentId: true, amountMinor: true, payment: { select: { id: true, status: true, amountMinor: true, refundMinor: true } } },
      },
    },
  });
}

/** Σ outstanding (total − verified-effective) over unpaid issued invoices. */
export function sumOutstanding(rows: UnpaidInvoiceRow[], today: Date): number {
  let total = 0;
  for (const row of rows) {
    const derived = computeDerived(row, groupPaymentsFromAllocations(row.allocations), today);
    total += derived.outstandingMinor;
  }
  return total;
}

/** Σ (amount − refund) of VERIFIED payments (optionally since a given date). */
export async function sumCollected(since?: Date): Promise<number> {
  const payments = await db.payment.findMany({
    where: { status: "VERIFIED", ...(since ? { paidAt: { gte: since } } : {}) },
    select: { amountMinor: true, refundMinor: true },
  });
  return payments.reduce((sum, p) => sum + Math.max(0, p.amountMinor - p.refundMinor), 0);
}

/** MRR: Σ monthly-normalised agreed prices of ACTIVE + PAST_DUE subscriptions. */
export async function computeMrrMinor(): Promise<number> {
  const subs = await db.subscription.findMany({
    where: { status: { in: ["ACTIVE", "PAST_DUE"] } },
    select: { agreedPriceMinor: true, billingInterval: true },
  });
  return subs.reduce((sum, s) => sum + monthlyEquivalentMinor(s.agreedPriceMinor, s.billingInterval), 0);
}

// ---------------------------------------------------------------------------
// Summary (GET /api/billing/summary)
// ---------------------------------------------------------------------------

export const BILLING_METRIC_DEFINITIONS: BillingSummaryData["definitions"] = [
  {
    key: "outstandingMinor",
    label: "Outstanding",
    definition:
      "Sum of (invoice total − verified payment allocations) across invoices in Issued, Overdue or Partially paid status. Draft and void invoices are excluded; unpaid invoices are not revenue.",
  },
  {
    key: "overdueMinor",
    label: "Overdue",
    definition:
      "The subset of outstanding money on invoices whose due date has passed (and every unpaid renewal invoice past due). Counted in overdueCount/overdueMinor.",
  },
  {
    key: "collectedMinor",
    label: "Collected",
    definition:
      "Sum of verified payments (amount − refunds) all time. Pending payments are excluded until verified; fully refunded payments contribute nothing.",
  },
  {
    key: "collectedThisMonthMinor",
    label: "Collected this month",
    definition: "Same formula as Collected, counting only payments with a paid date in the current calendar month.",
  },
  {
    key: "invoicedMinor",
    label: "Invoiced",
    definition:
      "Sum of invoice totals in Issued, Overdue, Partially paid or Paid status — i.e. everything actually billed. Draft, void and fully refunded invoices are excluded (a fully refunded invoice has zero net financial effect; refunds are already netted out of collected figures).",
  },
  {
    key: "mrrMinor",
    label: "MRR",
    definition:
      "Monthly recurring revenue: agreed subscription prices normalised to a monthly figure (monthly = price, quarterly = price ÷ 3, yearly = price ÷ 12) for Active + Past-due subscriptions. One-off invoices are never part of MRR.",
  },
  {
    key: "pendingPaymentsMinor",
    label: "Pending payments",
    definition:
      "Sum of recorded-but-unverified payments. Informational only — pending money has NOT been received and never reduces an invoice balance.",
  },
  {
    key: "quotesAwaiting",
    label: "Quotes awaiting response",
    definition: "Count of quotes in Sent status (delivered to the client, awaiting accept/reject).",
  },
];

export async function getBillingSummary(): Promise<BillingSummaryData> {
  const today = startOfToday();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const settings = await getBillingSettings();

  const [unpaidRows, collectedAllTime, collectedThisMonth, mrrMinor, activeSubscriptions, pastDueSubscriptions, quotesAwaiting, invoicedAgg, pendingAgg, upcomingRaw, recentPaymentRows, lastJobRunAt] =
    await Promise.all([
      loadUnpaidInvoiceRows(),
      sumCollected(),
      sumCollected(startOfMonth),
      computeMrrMinor(),
      db.subscription.count({ where: { status: "ACTIVE" } }),
      db.subscription.count({ where: { status: "PAST_DUE" } }),
      db.quote.count({ where: { status: "SENT" } }),
      db.invoice.aggregate({
        where: { status: { in: ["ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE"] } },
        _sum: { totalMinor: true },
      }),
      db.payment.aggregate({ where: { status: "PENDING" }, _sum: { amountMinor: true }, _count: { _all: true } }),
      db.subscription.findMany({
        where: { status: { in: ["ACTIVE", "PAST_DUE"] }, nextRenewalDate: { not: null } },
        include: {
          client: { select: { businessName: true } },
          website: { select: { name: true } },
        },
        orderBy: { nextRenewalDate: "asc" },
        take: 10,
      }),
      db.payment.findMany({
        include: paymentInclude,
        orderBy: [{ createdAt: "desc" }],
        take: 8,
      }),
      getLastBillingJobRun(),
    ]);

  let outstandingMinor = 0;
  let overdueCount = 0;
  let overdueMinor = 0;
  for (const row of unpaidRows) {
    const derived = computeDerived(row, groupPaymentsFromAllocations(row.allocations), today);
    outstandingMinor += derived.outstandingMinor;
    if (derived.isOverdue) {
      overdueCount += 1;
      overdueMinor += derived.outstandingMinor;
    }
  }

  return {
    outstandingMinor,
    overdueCount,
    overdueMinor,
    collectedMinor: collectedAllTime,
    collectedThisMonthMinor: collectedThisMonth,
    pendingPaymentsMinor: pendingAgg._sum.amountMinor ?? 0,
    pendingPaymentsCount: pendingAgg._count._all,
    invoicedMinor: invoicedAgg._sum.totalMinor ?? 0,
    mrrMinor,
    activeSubscriptions,
    pastDueSubscriptions,
    quotesAwaiting,
    upcomingRenewals: upcomingRaw.map(toBillingRenewalItem),
    recentPayments: recentPaymentRows.map((p) => toPaymentRecord(p, settings.paymentRefPrefix)),
    definitions: BILLING_METRIC_DEFINITIONS,
    gateway: getGatewayStatus(),
    lastJobRunAt: lastJobRunAt ? lastJobRunAt.toISOString() : null,
  };
}

// ---------------------------------------------------------------------------
// Dashboard slice (additive Phase 3 block — falls back to nulls on failure)
// ---------------------------------------------------------------------------

export interface DashboardBillingData {
  outstandingInvoices: number;
  recurringRevenue: number;
  kpis: {
    overdueInvoices: number;
    paymentsReceivedMinor: number;
    activeSubscriptions: number;
    quotesAwaiting: number;
    upcomingSubscriptionRenewals: number;
  };
  billingRenewals: BillingRenewalItem[];
}

export async function getDashboardBilling(): Promise<DashboardBillingData> {
  const today = startOfToday();
  const in30 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [unpaidRows, collected, mrrMinor, activeSubscriptions, quotesAwaiting, upcomingRenewals] =
    await Promise.all([
      loadUnpaidInvoiceRows(),
      sumCollected(),
      computeMrrMinor(),
      db.subscription.count({ where: { status: "ACTIVE" } }),
      db.quote.count({ where: { status: "SENT" } }),
      db.subscription.findMany({
        where: { status: { in: ["ACTIVE", "PAST_DUE"] }, nextRenewalDate: { not: null } },
        include: { client: { select: { businessName: true } }, website: { select: { name: true } } },
        orderBy: { nextRenewalDate: "asc" },
        take: 5,
      }),
    ]);

  let overdueCount = 0;
  let outstandingMinor = 0;
  for (const row of unpaidRows) {
    const derived = computeDerived(row, groupPaymentsFromAllocations(row.allocations), today);
    outstandingMinor += derived.outstandingMinor;
    if (derived.isOverdue) overdueCount += 1;
  }

  const upcomingSubscriptionRenewals = await db.subscription.count({
    where: {
      status: { in: ["ACTIVE", "PAST_DUE"] },
      nextRenewalDate: { lte: in30 },
    },
  });

  return {
    outstandingInvoices: outstandingMinor,
    recurringRevenue: mrrMinor,
    kpis: {
      overdueInvoices: overdueCount,
      paymentsReceivedMinor: collected,
      activeSubscriptions,
      quotesAwaiting,
      upcomingSubscriptionRenewals,
    },
    billingRenewals: upcomingRenewals.map(toBillingRenewalItem),
  };
}
