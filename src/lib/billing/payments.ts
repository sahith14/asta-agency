/**
 * AgencyOS — payment allocation validation (Phase 3, server-only).
 *
 * Shared by payment create + re-allocate (PATCH). Enforces the frozen rules:
 * - Σ allocations ≤ payment amount;
 * - one allocation per invoice per payment (DB unique constraint);
 * - every invoice must exist, belong to the payment's client and be awaiting
 *   payment (ISSUED / OVERDUE / PARTIALLY_PAID);
 * - a single allocation cannot exceed the invoice's current verified
 *   outstanding balance (PENDING allocations never reduce it — two pending
 *   payments may therefore both reserve space; verification order settles it).
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { BadRequestError } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { label } from "@/lib/types";
import { isUniqueViolation } from "@/lib/billing-num";
import {
  computeDerived,
  groupPaymentsFromAllocations,
  isUnpaidStatus,
  startOfToday,
} from "@/lib/billing/invoice-math";

/**
 * Payment numbering — same max+1 + P2002-retry strategy as the frozen
 * createWithNumber helper, but aggregating Payment.**reference** (the frozen
 * helper hardcodes `_max: { number: }`, which only exists on Quote/Invoice —
 * documented contract deviation, logged in worklog 2-a).
 */
export async function createPaymentWithNumber<T>(
  create: (reference: number) => Promise<T>
): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const agg = await db.payment.aggregate({ _max: { reference: true } });
    const reference = (agg._max.reference ?? 0) + 1;
    try {
      return await create(reference);
    } catch (err) {
      if (isUniqueViolation(err)) {
        lastError = err;
        continue; // reference lost the race — recompute and try again
      }
      throw err;
    }
  }
  throw lastError ?? new Error("Could not allocate a unique payment reference.");
}

export interface AllocationInput {
  invoiceId: string;
  amountMinor: number;
}

export interface ValidatedAllocations {
  normalized: { invoiceId: string; amountMinor: number }[];
  invoiceIds: string[];
}

export async function validatePaymentAllocations(
  client: Prisma.TransactionClient,
  opts: {
    paymentClientId: string;
    paymentAmountMinor: number;
    paymentCurrency: string;
    allocations: AllocationInput[];
    invoicePrefix: string;
  }
): Promise<ValidatedAllocations> {
  const { paymentClientId, paymentAmountMinor, paymentCurrency, allocations, invoicePrefix } = opts;

  const allocatedSum = allocations.reduce((sum, a) => sum + a.amountMinor, 0);
  if (allocatedSum > paymentAmountMinor) {
    throw new BadRequestError(
      `Allocations (${formatCurrency(allocatedSum, paymentCurrency)}) exceed the payment amount (${formatCurrency(paymentAmountMinor, paymentCurrency)}).`
    );
  }

  const seen = new Set<string>();
  for (const a of allocations) {
    if (seen.has(a.invoiceId)) {
      throw new BadRequestError("Each invoice can only be allocated once per payment.");
    }
    seen.add(a.invoiceId);
  }

  for (const alloc of allocations) {
    const invoice = await client.invoice.findUnique({
      where: { id: alloc.invoiceId },
      select: {
        id: true,
        number: true,
        clientId: true,
        status: true,
        currency: true,
        totalMinor: true,
        dueDate: true,
        allocations: {
          select: {
            id: true,
            paymentId: true,
            amountMinor: true,
            payment: { select: { id: true, status: true, amountMinor: true, refundMinor: true } },
          },
        },
      },
    });
    if (!invoice) throw new BadRequestError("Invoice not found.");

    const display = `${invoicePrefix}${String(invoice.number).padStart(4, "0")}`;
    if (invoice.clientId !== paymentClientId) {
      throw new BadRequestError(`Invoice ${display} belongs to a different client.`);
    }
    if (!isUnpaidStatus(invoice.status)) {
      throw new BadRequestError(`Invoice ${display} is not awaiting payment (status ${label(invoice.status)}).`);
    }
    const derived = computeDerived(invoice, groupPaymentsFromAllocations(invoice.allocations), startOfToday());
    if (alloc.amountMinor > derived.outstandingMinor) {
      throw new BadRequestError(
        `Allocation exceeds the outstanding balance of ${display} (${formatCurrency(derived.outstandingMinor, invoice.currency)}).`
      );
    }
  }

  return {
    normalized: allocations.map((a) => ({ invoiceId: a.invoiceId, amountMinor: a.amountMinor })),
    invoiceIds: allocations.map((a) => a.invoiceId),
  };
}
