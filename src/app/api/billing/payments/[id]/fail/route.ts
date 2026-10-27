/**
 * AgencyOS — Payment failure marking (Phase 3).
 * POST /api/billing/payments/[id]/fail  { reason? } → PENDING → FAILED.
 * Allocations are KEPT for audit (they never counted — FAILED payments are
 * ignored by the derived math); caches are recomputed so pendingMinor drops.
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { requireRoles } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { getBillingSettings } from "@/lib/billing/settings";
import { recomputeInvoicePaidCache } from "@/lib/billing/invoice-math";
import { paymentInclude, toPaymentRecord } from "@/lib/billing/record";
import { label } from "@/lib/types";

const failSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const POST = withAuth(async (req, user, { params }) => {
  // RBAC: failing a pending payment is support/finance (+ founder superuser).
  requireRoles(user, ["SUPPORT_FINANCE"]);
  const { id } = await params;
  const body = await parseBody(req, failSchema);
  const settings = await getBillingSettings();

  const payment = await db.payment.findUnique({
    where: { id },
    include: { allocations: { select: { invoiceId: true } } },
  });
  if (!payment) throw new NotFoundError("Payment not found.");
  if (payment.status !== "PENDING") {
    throw new BadRequestError(`Only pending payments can be marked failed (this payment is ${label(payment.status)}).`);
  }

  await db.$transaction(async (tx) => {
    await tx.payment.update({ where: { id }, data: { status: "FAILED" } });
    // Allocations stay for audit; FAILED payments never count toward
    // balances, but recompute so pending caches reflect the change.
    for (const alloc of payment.allocations) {
      await recomputeInvoicePaidCache(tx, alloc.invoiceId);
    }
  });

  const display = `${settings.paymentRefPrefix}${String(payment.reference).padStart(4, "0")}`;
  await logActivity({
    action: "PAYMENT_MARKED_FAILED",
    kind: "AUDIT",
    entityType: "PAYMENT",
    entityId: payment.id,
    entityLabel: display,
    summary: `Marked payment ${display} as failed${body.reason ? ` — reason: ${body.reason}` : ""}.`,
    actor: user,
    clientId: payment.clientId,
    metadata: { reason: body.reason ?? null, method: payment.method },
  });

  const full = await db.payment.findUnique({ where: { id }, include: paymentInclude });
  if (!full) throw new NotFoundError("Payment not found.");
  return jsonOk(toPaymentRecord(full, settings.paymentRefPrefix));
});
