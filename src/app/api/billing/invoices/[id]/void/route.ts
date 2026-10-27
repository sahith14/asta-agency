/**
 * AgencyOS — Invoice void action (Phase 3).
 * POST /api/billing/invoices/[id]/void  { reason (3..500) }
 *
 * Voiding is the only post-issue correction path; the invoice row is NEVER
 * deleted (audit trail). Blocked while verified payments or pending payment
 * allocations exist — refund/reallocate first.
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, ConflictError, NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { requireFounder } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { getBillingSettings } from "@/lib/billing/settings";
import { loadInvoiceDerived } from "@/lib/billing/invoice-math";
import { loadFullInvoiceRecord } from "@/lib/billing/record";

const voidSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, "Give a short reason for voiding (at least 3 characters).")
    .max(500, "Reason must be at most 500 characters."),
});

const VOIDABLE_STATUSES = ["DRAFT", "ISSUED", "OVERDUE", "PARTIALLY_PAID"];

export const POST = withAuth(async (req, user, { params }) => {
  // RBAC: voiding an invoice is founder-only (spec §1D commercial decisions).
  requireFounder(user);
  const { id } = await params;
  const body = await parseBody(req, voidSchema);
  const settings = await getBillingSettings();

  const invoice = await db.invoice.findUnique({ where: { id } });
  if (!invoice) throw new NotFoundError("Invoice not found.");

  const display = `${settings.invoicePrefix}${String(invoice.number).padStart(4, "0")}`;

  if (!VOIDABLE_STATUSES.includes(invoice.status)) {
    throw new BadRequestError(
      `Cannot void an invoice in ${invoice.status} status — only draft, issued, overdue or partially paid invoices can be voided.`
    );
  }

  // Verified money already received? Refund and reallocate before voiding.
  const derived = await loadInvoiceDerived(invoice.id);
  if (derived && derived.paidMinor > 0) {
    throw new ConflictError(
      `This invoice has verified payments (${derived.paidMinor}). Refund and reallocate them before voiding.`
    );
  }
  // Pending allocations would be orphaned by the void (their invoices could
  // no longer accept the money once verified).
  const pendingAllocations = await db.paymentAllocation.count({
    where: { invoiceId: invoice.id, payment: { status: "PENDING" } },
  });
  if (pendingAllocations > 0) {
    throw new ConflictError(
      "This invoice has pending payment allocations — mark them failed or reallocate first."
    );
  }

  await db.invoice.update({
    where: { id },
    data: { status: "VOID", voidedAt: new Date(), voidReason: body.reason },
  });

  await logActivity({
    action: "INVOICE_VOIDED",
    kind: "AUDIT",
    entityType: "INVOICE",
    entityId: invoice.id,
    entityLabel: display,
    summary: `Voided invoice ${display} — reason: ${body.reason}`,
    actor: user,
    clientId: invoice.clientId,
    websiteId: invoice.websiteId,
    projectId: invoice.projectId,
  });

  return jsonOk(await loadFullInvoiceRecord(id, settings.invoicePrefix));
});
