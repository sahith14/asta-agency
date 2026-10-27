/**
 * AgencyOS — Payment verification (Phase 3).
 * POST /api/billing/payments/[id]/verify → PENDING → VERIFIED.
 * This is the moment money becomes real: verified allocations reduce invoice
 * outstanding balances and roll invoice statuses (via the paid cache).
 */
import { db } from "@/lib/db";
import { BadRequestError, NotFoundError, jsonOk, withAuth } from "@/lib/api";
import { requireRoles } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { rateLimit } from "@/lib/rate-limit";
import { getBillingSettings } from "@/lib/billing/settings";
import { recomputeInvoicePaidCache } from "@/lib/billing/invoice-math";
import { paymentInclude, toPaymentRecord } from "@/lib/billing/record";
import { label } from "@/lib/types";

export const POST = withAuth(async (req, user, { params }) => {
  // RBAC: verifying money is support/finance (+ founder superuser).
  requireRoles(user, ["SUPPORT_FINANCE"]);
  const { id } = await params;
  const limit = rateLimit(`payment-verify:${user.id}`, 60, 60_000);
  if (!limit.ok) {
    throw new BadRequestError(`Too many verification attempts — try again in ${limit.retryAfterSeconds}s.`);
  }

  const settings = await getBillingSettings();
  const payment = await db.payment.findUnique({
    where: { id },
    include: { allocations: { select: { invoiceId: true } } },
  });
  if (!payment) throw new NotFoundError("Payment not found.");
  if (payment.status !== "PENDING") {
    throw new BadRequestError(`Only pending payments can be verified (this payment is ${label(payment.status)}).`);
  }

  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id },
      data: { status: "VERIFIED", verifiedAt: now, verifiedById: user.id },
    });
    for (const alloc of payment.allocations) {
      // Where outstanding actually drops; statuses roll to PARTIALLY_PAID/PAID here.
      await recomputeInvoicePaidCache(tx, alloc.invoiceId);
    }
  });

  await logActivity({
    action: "PAYMENT_VERIFIED",
    kind: "AUDIT",
    entityType: "PAYMENT",
    entityId: payment.id,
    entityLabel: `${settings.paymentRefPrefix}${String(payment.reference).padStart(4, "0")}`,
    summary: `Verified payment ${settings.paymentRefPrefix}${String(payment.reference).padStart(4, "0")} — allocated invoices updated.`,
    actor: user,
    clientId: payment.clientId,
    metadata: { method: payment.method, amountMinor: payment.amountMinor, allocatedCount: payment.allocations.length },
  });

  const full = await db.payment.findUnique({ where: { id }, include: paymentInclude });
  if (!full) throw new NotFoundError("Payment not found.");
  return jsonOk(toPaymentRecord(full, settings.paymentRefPrefix));
});
