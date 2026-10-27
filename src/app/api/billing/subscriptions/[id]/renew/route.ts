/**
 * AgencyOS — Manual subscription renewal (Phase 3).
 * POST /api/billing/subscriptions/[id]/renew → generate the renewal invoice
 * for the subscription's current due period NOW (same shared logic + duplicate
 * guard as the scheduled job). 409 when an invoice for this period exists.
 */
import { db } from "@/lib/db";
import { BadRequestError, ConflictError, NotFoundError, jsonOk, withAuth } from "@/lib/api";
import { requireFounder } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { getBillingSettings } from "@/lib/billing/settings";
import { createRenewalInvoice } from "@/lib/billing/jobs";
import { loadFullInvoiceRecord } from "@/lib/billing/record";

export const POST = withAuth(async (req, user, { params }) => {
  // RBAC: manual renewals raise commercial invoices — founder-only.
  requireFounder(user);
  const { id } = await params;
  const settings = await getBillingSettings();

  const sub = await db.subscription.findUnique({ where: { id }, include: { client: { select: { businessName: true } } } });
  if (!sub) throw new NotFoundError("Subscription not found.");

  if (sub.status !== "ACTIVE" && sub.status !== "PAST_DUE") {
    throw new BadRequestError(
      `Renewal invoices can only be generated for active or past-due subscriptions (this one is ${sub.status}).`
    );
  }
  if (!sub.nextRenewalDate) {
    throw new BadRequestError("This subscription has no next renewal date.");
  }

  const outcome = await createRenewalInvoice(sub, settings, user);
  if (!outcome.created) {
    throw new ConflictError(`A renewal invoice for this period already exists (${outcome.displayNumber}).`);
  }

  // createRenewalInvoice already wrote the RENEWAL_INVOICED event (actor =
  // the calling user) and the INVOICE audit entry; here we add the
  // operator-attributed subscription activity line.
  await logActivity({
    action: "RENEWAL_INVOICED",
    entityType: "SUBSCRIPTION",
    entityId: sub.id,
    entityLabel: sub.planName ?? "Subscription",
    summary: `Generated renewal invoice ${outcome.displayNumber} for ${sub.client.businessName} (period ${outcome.periodStart.toISOString().slice(0, 10)} → ${outcome.periodEnd.toISOString().slice(0, 10)}).`,
    actor: user,
    clientId: sub.clientId,
    websiteId: sub.websiteId,
    metadata: { invoiceId: outcome.invoice.id, subscriptionId: sub.id },
  });

  return jsonOk(await loadFullInvoiceRecord(outcome.invoice.id, settings.invoicePrefix), { status: 201 });
});
