/**
 * AgencyOS — Payment refund (Phase 3).
 * POST /api/billing/payments/[id]/refund  { amountMinor > 0, reason (3..500) }
 *
 * Allowed on VERIFIED payments only. refundMinor is cumulative (single refund
 * record); refunds reduce allocations FIFO (oldest first, money.ts) so Σ
 * effective always equals amount − refunded. The touched invoices' paid
 * caches are recomputed inside a transaction.
 *
 * Documented status-machine behaviour (Phase 4 hardening): a partial refund
 * downgrades PAID → PARTIALLY_PAID (balance re-opened); when refunds bring the
 * verified-effective paid to 0 the invoice becomes REFUNDED — a terminal,
 * auditable state (paidAt preserved, refund history on the Payment rows,
 * outstanding 0, no new allocations accepted).
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { requireFounder } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { rateLimit } from "@/lib/rate-limit";
import { formatCurrency } from "@/lib/format";
import { getBillingSettings } from "@/lib/billing/settings";
import { recomputeInvoicePaidCache } from "@/lib/billing/invoice-math";
import { paymentInclude, toPaymentRecord } from "@/lib/billing/record";
import { positiveMinorAmount } from "@/lib/billing/validate";

const refundSchema = z.object({
  amountMinor: positiveMinorAmount(),
  reason: z
    .string()
    .trim()
    .min(3, "Give a short reason for the refund (at least 3 characters).")
    .max(500, "Reason must be at most 500 characters."),
});

export const POST = withAuth(async (req, user, { params }) => {
  // RBAC: refunds are explicitly founder-only (spec §1D).
  requireFounder(user);
  const { id } = await params;
  const limit = rateLimit(`payment-refund:${user.id}`, 30, 60_000);
  if (!limit.ok) {
    throw new BadRequestError(`Too many refund attempts — try again in ${limit.retryAfterSeconds}s.`);
  }

  const body = await parseBody(req, refundSchema);
  const settings = await getBillingSettings();

  const payment = await db.payment.findUnique({
    where: { id },
    include: { allocations: { select: { invoiceId: true } } },
  });
  if (!payment) throw new NotFoundError("Payment not found.");
  if (payment.status === "PENDING") {
    throw new BadRequestError("This payment has not been verified yet — mark it failed instead of refunding.");
  }
  if (payment.status === "FAILED") {
    throw new BadRequestError("Failed payments carry no money — there is nothing to refund.");
  }
  if (payment.status === "REFUNDED") {
    throw new BadRequestError("This payment has already been fully refunded.");
  }

  const effectiveRemaining = payment.amountMinor - payment.refundMinor;
  if (body.amountMinor > effectiveRemaining) {
    throw new BadRequestError(
      `Refund (${formatCurrency(body.amountMinor, payment.currency)}) exceeds the effective payment amount (${formatCurrency(effectiveRemaining, payment.currency)}).`
    );
  }

  const now = new Date();
  const newRefundMinor = payment.refundMinor + body.amountMinor;

  await db.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id },
      data: {
        refundMinor: newRefundMinor,
        refundReason: body.reason,
        refundedAt: now,
        status: newRefundMinor >= payment.amountMinor ? "REFUNDED" : "VERIFIED",
      },
    });
    // FIFO reduction flows through effectiveAllocations in the recompute.
    for (const alloc of payment.allocations) {
      await recomputeInvoicePaidCache(tx, alloc.invoiceId);
    }
  });

  const display = `${settings.paymentRefPrefix}${String(payment.reference).padStart(4, "0")}`;
  await logActivity({
    action: "PAYMENT_REFUNDED",
    kind: "AUDIT",
    entityType: "PAYMENT",
    entityId: payment.id,
    entityLabel: display,
    summary: `Refunded ${formatCurrency(body.amountMinor, payment.currency)} on payment ${display} — reason: ${body.reason}`,
    actor: user,
    clientId: payment.clientId,
    metadata: { amountMinor: body.amountMinor, reason: body.reason, totalRefundedMinor: newRefundMinor },
  });

  const full = await db.payment.findUnique({ where: { id }, include: paymentInclude });
  if (!full) throw new NotFoundError("Payment not found.");
  return jsonOk(toPaymentRecord(full, settings.paymentRefPrefix));
});
