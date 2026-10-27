/**
 * AgencyOS — Flag refund / chargeback / dispute for founder approval
 * (Phase 5, spec §1D + §6).
 * POST /api/billing/payments/[id]/flag-refund { reason, category }
 *
 * SUPPORT_FINANCE must never issue refunds themselves — this endpoint only
 * records a flag (AUDIT activity) and notifies the founder. The actual refund
 * stays with the existing founder-only refund endpoint. The payment record is
 * NOT modified.
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { requireRoles } from "@/lib/rbac";
import { notifyFounders } from "@/lib/notify";

const flagSchema = z.object({
  reason: z.string().trim().min(10, "Explain the reason (at least 10 characters).").max(2000),
  category: z.enum(["REFUND", "CHARGEBACK", "DISPUTE"]).default("REFUND"),
});

export const POST = withAuth(async (req, user, { params }) => {
  requireRoles(user, ["SUPPORT_FINANCE"]);
  const { id } = await params;
  const body = await parseBody(req, flagSchema);

  const payment = await db.payment.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, businessName: true } },
      allocations: { include: { invoice: { select: { id: true, number: true } } } },
    },
  });
  if (!payment) throw new NotFoundError("Payment not found.");
  if (payment.status === "REFUNDED") {
    throw new BadRequestError("This payment has already been refunded.");
  }

  const amount = payment.amountMinor;
  const ref = `PAY-${String(payment.reference).padStart(4, "0")}`;
  const invoiceNumber = payment.allocations[0]?.invoice
    ? `INV-${String(payment.allocations[0].invoice.number).padStart(4, "0")}`
    : null;

  await logActivity({
    action: "REFUND_REQUESTED",
    entityType: "PAYMENT",
    entityId: payment.id,
    entityLabel: ref,
    summary: `${body.category} flagged for founder approval — ${invoiceNumber ?? "unallocated payment"} (${amount} minor units): ${body.reason}`,
    actor: user,
    clientId: payment.clientId,
    metadata: { category: body.category, invoiceId: payment.allocations[0]?.invoice?.id ?? null },
    kind: "AUDIT",
  });

  await notifyFounders({
    kind: "REFUND_REQUESTED",
    title: `${body.category} flagged for your approval`,
    body: `${payment.client?.businessName ?? "Client"} — ${invoiceNumber ?? "unallocated payment"}, ${ref}. Reason: ${body.reason.slice(0, 160)}`,
    entityType: "PAYMENT",
    entityId: payment.id,
    dedupKey: `refund-flag:${payment.id}:${body.category}`,
  });

  return jsonOk({ flagged: true, category: body.category });
});
