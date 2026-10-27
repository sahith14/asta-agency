/**
 * AgencyOS — Invoice issue action (Phase 3).
 * POST /api/billing/invoices/[id]/issue → DRAFT → ISSUED.
 * Requires a positive total; applies default payment terms when no due date
 * is set. Rate-limited (issued invoices are commercial records).
 */
import { db } from "@/lib/db";
import { BadRequestError, NotFoundError, jsonOk, withAuth } from "@/lib/api";
import { requireFounder } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { rateLimit } from "@/lib/rate-limit";
import { getBillingSettings } from "@/lib/billing/settings";
import { addDays } from "@/lib/billing/validate";
import { loadFullInvoiceRecord } from "@/lib/billing/record";

export const POST = withAuth(async (req, user, { params }) => {
  // RBAC: issuing an invoice is founder-only.
  requireFounder(user);
  const { id } = await params;
  const limit = rateLimit(`invoice-issue:${user.id}`, 30, 60_000);
  if (!limit.ok) {
    throw new BadRequestError(
      `Too many invoice issues — try again in ${limit.retryAfterSeconds}s.`
    );
  }

  const settings = await getBillingSettings();
  const invoice = await db.invoice.findUnique({ where: { id } });
  if (!invoice) throw new NotFoundError("Invoice not found.");
  if (invoice.status !== "DRAFT") {
    throw new BadRequestError(
      `Only draft invoices can be issued (this invoice is ${invoice.status}).`
    );
  }
  if (invoice.totalMinor <= 0) {
    throw new BadRequestError("Cannot issue an invoice with a zero total — add at least one paid line.");
  }

  const now = new Date();
  await db.invoice.update({
    where: { id },
    data: {
      status: "ISSUED",
      issuedAt: now,
      // Default payment terms apply when the draft never set a due date.
      dueDate: invoice.dueDate ?? addDays(now, settings.defaultPaymentTermsDays),
    },
  });

  await logActivity({
    action: "INVOICE_ISSUED",
    kind: "AUDIT",
    entityType: "INVOICE",
    entityId: invoice.id,
    entityLabel: `${settings.invoicePrefix}${String(invoice.number).padStart(4, "0")}`,
    summary: `Issued invoice ${settings.invoicePrefix}${String(invoice.number).padStart(4, "0")}.`,
    actor: user,
    clientId: invoice.clientId,
    websiteId: invoice.websiteId,
    projectId: invoice.projectId,
    metadata: { kind: invoice.kind, subscriptionId: invoice.subscriptionId },
  });

  return jsonOk(await loadFullInvoiceRecord(id, settings.invoicePrefix));
});
