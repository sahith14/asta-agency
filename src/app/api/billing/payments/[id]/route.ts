/**
 * AgencyOS — Billing payment detail API (Phase 3).
 * GET   /api/billing/payments/[id] → PaymentRecord (allocations FIFO-effective)
 * PATCH /api/billing/payments/[id] → PENDING-only edits: re-allocate, method,
 *       paidAt, referenceNum, notes. Verified payments are immutable —
 *       corrections happen via refunds.
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { requireModule, requireRoles } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { getBillingSettings } from "@/lib/billing/settings";
import { recomputeInvoicePaidCache } from "@/lib/billing/invoice-math";
import { validatePaymentAllocations } from "@/lib/billing/payments";
import { paymentInclude, toPaymentRecord } from "@/lib/billing/record";
import { dateInput, paymentMethodSchema, positiveMinorAmount } from "@/lib/billing/validate";
import type { PaymentRecord } from "@/lib/types";

async function loadPaymentRecord(id: string, paymentRefPrefix: string): Promise<PaymentRecord> {
  const full = await db.payment.findUnique({ where: { id }, include: paymentInclude });
  if (!full) throw new NotFoundError("Payment not found.");
  return toPaymentRecord(full, paymentRefPrefix);
}

// ---------------------------------------------------------------------------
// GET /api/billing/payments/[id]
// ---------------------------------------------------------------------------

export const GET = withAuth(async (_req, user, { params }) => {
  // RBAC: payment records are founder + support/finance only.
  requireModule(user, "billing");
  const { id } = await params;
  const settings = await getBillingSettings();
  return jsonOk(await loadPaymentRecord(id, settings.paymentRefPrefix));
});

// ---------------------------------------------------------------------------
// PATCH /api/billing/payments/[id] — PENDING only
// ---------------------------------------------------------------------------

const allocationInputSchema = z.object({
  invoiceId: z.string().min(1),
  amountMinor: positiveMinorAmount(),
});

const patchPaymentSchema = z.object({
  allocations: z.array(allocationInputSchema).max(50).optional(), // replace-all when provided
  method: paymentMethodSchema.optional(),
  paidAt: dateInput,
  referenceNum: z.string().trim().max(200).nullish(),
  notes: z.string().max(2000).nullish(),
});

export const PATCH = withAuth(async (req, user, { params }) => {
  // RBAC: pending-payment edits are part of the recording flow — support/finance (+ founder).
  requireRoles(user, ["SUPPORT_FINANCE"]);
  const { id } = await params;
  const body = await parseBody(req, patchPaymentSchema);
  const settings = await getBillingSettings();

  const existing = await db.payment.findUnique({
    where: { id },
    include: { allocations: { select: { invoiceId: true } } },
  });
  if (!existing) throw new NotFoundError("Payment not found.");
  if (existing.status !== "PENDING") {
    throw new BadRequestError("Only pending payments can be edited.");
  }

  const now = new Date();
  if (body.paidAt && body.paidAt.getTime() > now.getTime() + 24 * 60 * 60 * 1000) {
    throw new BadRequestError("Payment date cannot be in the future.");
  }

  const oldInvoiceIds = existing.allocations.map((a) => a.invoiceId);
  const display = `${settings.paymentRefPrefix}${String(existing.reference).padStart(4, "0")}`;

  await db.$transaction(async (tx) => {
    let newInvoiceIds: string[] = [];

    if (body.allocations !== undefined) {
      const validated = await validatePaymentAllocations(tx, {
        paymentClientId: existing.clientId,
        paymentAmountMinor: existing.amountMinor,
        paymentCurrency: existing.currency,
        allocations: body.allocations,
        invoicePrefix: settings.invoicePrefix,
      });
      await tx.paymentAllocation.deleteMany({ where: { paymentId: id } });
      if (validated.normalized.length > 0) {
        await tx.paymentAllocation.createMany({
          data: validated.normalized.map((a) => ({ paymentId: id, invoiceId: a.invoiceId, amountMinor: a.amountMinor })),
        });
      }
      newInvoiceIds = validated.invoiceIds;
    }

    await tx.payment.update({
      where: { id },
      data: {
        ...(body.method !== undefined ? { method: body.method } : {}),
        ...(body.paidAt !== undefined ? { paidAt: body.paidAt ?? now } : {}),
        ...(body.referenceNum !== undefined ? { referenceNum: body.referenceNum ?? null } : {}),
        ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
      },
    });

    // Recompute caches for every invoice touched (old + new allocations).
    const touched = new Set([...oldInvoiceIds, ...newInvoiceIds]);
    for (const invoiceId of touched) {
      await recomputeInvoicePaidCache(tx, invoiceId);
    }
  });

  await logActivity({
    action: "PAYMENT_UPDATED",
    kind: "AUDIT",
    entityType: "PAYMENT",
    entityId: id,
    entityLabel: display,
    summary: `Updated pending payment ${display}.`,
    actor: user,
    clientId: existing.clientId,
    metadata: { fields: Object.keys(body), reallocated: body.allocations !== undefined },
  });

  return jsonOk(await loadPaymentRecord(id, settings.paymentRefPrefix));
});
