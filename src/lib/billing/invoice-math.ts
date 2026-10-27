/**
 * AgencyOS — invoice derived-amount math (Phase 3, server-only).
 *
 * Single source of truth for every invoice surface (APIs, dashboard, jobs):
 * - paidMinor: Σ effective amounts of VERIFIED payments allocated to the
 *   invoice (effective = after FIFO refund share, per money.ts).
 * - pendingMinor: Σ allocations of PENDING payments (informational only —
 *   pending money never reduces the balance).
 * - outstandingMinor: 0 for DRAFT/VOID/PAID, otherwise max(0, total − paid).
 * - isOverdue: ISSUED/PARTIALLY_PAID/OVERDUE with a past due date and an
 *   outstanding balance.
 *
 * recomputeInvoicePaidCache() is the ONLY writer of Invoice.paidMinor and the
 * only place the payment-driven status machine (→ PARTIALLY_PAID/PAID) runs.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { effectiveAllocations } from "@/lib/money";
import { UNPAID_INVOICE_STATUSES } from "@/lib/types";

// ---------------------------------------------------------------------------
// Date helpers (local server time, consistent with the dashboard route)
// ---------------------------------------------------------------------------

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfToday(): Date {
  const d = startOfToday();
  d.setDate(d.getDate() + 1);
  return d;
}

// ---------------------------------------------------------------------------
// Derived math (pure — no DB access)
// ---------------------------------------------------------------------------

/** Minimal structural shape of an invoice needed for derived amounts. */
export interface DerivedInvoiceLike {
  status: string;
  totalMinor: number;
  dueDate: Date | null;
}

/** Minimal structural shape of a payment (with its allocations) needed here. */
export interface DerivedPaymentLike {
  status: string;
  amountMinor: number;
  refundMinor: number;
  allocations: { id: string; amountMinor: number }[];
}

export interface InvoiceDerived {
  paidMinor: number;
  pendingMinor: number;
  outstandingMinor: number;
  isOverdue: boolean;
}

const OVERDUE_CAPABLE_STATUSES = ["ISSUED", "PARTIALLY_PAID", "OVERDUE"];

/**
 * Computes the derived amounts for one invoice from its payments.
 * `today` defaults to the current start-of-day; callers may pass their own
 * for consistency across a batch.
 */
export function computeDerived(
  invoice: DerivedInvoiceLike,
  payments: DerivedPaymentLike[],
  today: Date = startOfToday()
): InvoiceDerived {
  let paidMinor = 0;
  let pendingMinor = 0;

  for (const payment of payments) {
    if (payment.status === "PENDING") {
      for (const alloc of payment.allocations) {
        pendingMinor += Math.max(0, alloc.amountMinor);
      }
    } else if (payment.status === "VERIFIED" || payment.status === "REFUNDED") {
      // VERIFIED payments count net of refunds (FIFO share). REFUNDED payments
      // contribute exactly 0 (their refundMinor >= amountMinor) — running them
      // through effectiveAllocations keeps the FIFO schedule authoritative.
      const schedule = effectiveAllocations(payment.amountMinor, payment.refundMinor, payment.allocations);
      for (const entry of schedule) paidMinor += Math.max(0, entry.effectiveMinor);
    }
    // FAILED payments are ignored (kept only for audit).
  }

  let outstandingMinor = 0;
  if (
    invoice.status !== "DRAFT" &&
    invoice.status !== "VOID" &&
    invoice.status !== "REFUNDED"
  ) {
    outstandingMinor = Math.max(0, invoice.totalMinor - paidMinor);
  }
  // REFUNDED (fully refunded): the verified-effective paid is 0 AND nothing is
  // owed either — the obligation was discharged by the refund. paidMinor stays
  // honest (0) and the refund history lives on the Payment rows + audit log.
  // PAID with paid >= total yields 0 naturally; if a refund has dropped the
  // verified-effective paid below the total (partial refund), the outstanding
  // above is honest even in the transient window before
  // recomputeInvoicePaidCache downgrades the persisted status to PARTIALLY_PAID.

  const isOverdue =
    OVERDUE_CAPABLE_STATUSES.includes(invoice.status) &&
    invoice.dueDate != null &&
    invoice.dueDate.getTime() < today.getTime() &&
    outstandingMinor > 0;

  return { paidMinor, pendingMinor, outstandingMinor, isOverdue };
}

// ---------------------------------------------------------------------------
// Allocation grouping helper
// ---------------------------------------------------------------------------

interface AllocationWithPayment {
  id: string;
  paymentId: string;
  amountMinor: number;
  payment: { status: string; amountMinor: number; refundMinor: number };
}

/**
 * Groups allocation rows (each joined with its payment's status/amounts) by
 * payment, so per-payment FIFO math can run. Allocations must already be
 * filtered to the invoices of interest.
 */
export function groupPaymentsFromAllocations(allocations: AllocationWithPayment[]): DerivedPaymentLike[] {
  const byPayment = new Map<string, DerivedPaymentLike>();
  for (const alloc of allocations) {
    let payment = byPayment.get(alloc.paymentId);
    if (!payment) {
      payment = {
        status: alloc.payment.status,
        amountMinor: alloc.payment.amountMinor,
        refundMinor: alloc.payment.refundMinor,
        allocations: [],
      };
      byPayment.set(alloc.paymentId, payment);
    }
    payment.allocations.push({ id: alloc.id, amountMinor: alloc.amountMinor });
  }
  return [...byPayment.values()];
}

/** Prisma select for the payment fields the derived math needs. */
export const paymentDerivedSelect = { id: true, status: true, amountMinor: true, refundMinor: true } as const;

// ---------------------------------------------------------------------------
// DB-backed loaders
// ---------------------------------------------------------------------------

/** Loads one invoice's derived amounts (null when the invoice does not exist). */
export async function loadInvoiceDerived(
  invoiceId: string
): Promise<InvoiceDerived | null> {
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      status: true,
      totalMinor: true,
      dueDate: true,
      allocations: { select: { id: true, paymentId: true, amountMinor: true, payment: { select: paymentDerivedSelect } } },
    },
  });
  if (!invoice) return null;
  return computeDerived(invoice, groupPaymentsFromAllocations(invoice.allocations));
}

// ---------------------------------------------------------------------------
// paidMinor cache maintenance (the ONLY writer of Invoice.paidMinor)
// ---------------------------------------------------------------------------

/**
 * Recomputes Invoice.paidMinor from verified allocations inside `tx` and rolls
 * the payment-driven status machine in BOTH directions:
 * - paid >= total > 0 and status ISSUED/OVERDUE/PARTIALLY_PAID → PAID (+paidAt)
 * - paid > 0 and status ISSUED/OVERDUE → PARTIALLY_PAID
 * - paid < total (but > 0) and status PAID (a partial refund re-opened the
 *   balance) → PARTIALLY_PAID with paidAt cleared (the refund lives on in the
 *   audit trail; the balance is honest again).
 * - paid == 0 and status PAID or PARTIALLY_PAID (every verified-effective
 *   pound was refunded) → REFUNDED: a terminal, auditable state. paidAt is
 *   KEPT (the invoice genuinely was settled once); refund history stays on
 *   the Payment rows. The invoice accepts no new allocations (not in
 *   UNPAID_INVOICE_STATUSES) and contributes 0 to outstanding balances.
 * VOID and DRAFT are untouched.
 */
export async function recomputeInvoicePaidCache(
  tx: Prisma.TransactionClient,
  invoiceId: string
): Promise<{ id: string; status: string; paidMinor: number }> {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, status: true, totalMinor: true, dueDate: true },
  });
  if (!invoice) throw new Error(`recomputeInvoicePaidCache: invoice ${invoiceId} not found.`);

  const allocations = await tx.paymentAllocation.findMany({
    where: { invoiceId },
    select: { id: true, paymentId: true, amountMinor: true, payment: { select: paymentDerivedSelect } },
  });
  const { paidMinor } = computeDerived(invoice, groupPaymentsFromAllocations(allocations));

  let status = invoice.status;
  let paidAt: Date | null = null;
  let clearPaidAt = false;
  const rollable = ["ISSUED", "OVERDUE", "PARTIALLY_PAID"];
  if (
    rollable.includes(invoice.status) &&
    invoice.totalMinor > 0 &&
    paidMinor >= invoice.totalMinor
  ) {
    status = "PAID";
    paidAt = new Date();
  } else if (paidMinor > 0 && (invoice.status === "ISSUED" || invoice.status === "OVERDUE")) {
    status = "PARTIALLY_PAID";
  } else if (invoice.status === "PAID" && paidMinor < invoice.totalMinor) {
    if (paidMinor === 0) {
      // Fully refunded: nothing paid AND nothing owed. Terminal REFUNDED
      // keeps paidAt — the invoice was genuinely settled before the refund.
      status = "REFUNDED";
    } else {
      status = "PARTIALLY_PAID";
      clearPaidAt = true; // no longer fully settled; refund recorded in the audit trail
    }
  } else if (invoice.status === "PARTIALLY_PAID" && paidMinor === 0) {
    // Can only be reached via refunds (payments never leave VERIFIED except
    // through refunds; PENDING payments never set PARTIALLY_PAID).
    status = "REFUNDED";
  }

  await tx.invoice.update({
    where: { id: invoiceId },
    data: {
      paidMinor,
      ...(status !== invoice.status
        ? {
            status,
            ...(status === "PAID" ? { paidAt } : {}),
            ...(clearPaidAt ? { paidAt: null } : {}),
          }
        : {}),
    },
  });

  return { id: invoiceId, status, paidMinor };
}

/** Statuses an invoice must be in to accept new payment allocations. */
export function isUnpaidStatus(status: string): boolean {
  return (UNPAID_INVOICE_STATUSES as readonly string[]).includes(status);
}
