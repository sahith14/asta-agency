/**
 * AgencyOS — Billing subscription detail API (Phase 3).
 * GET   /api/billing/subscriptions/[id] → SubscriptionDetailData (subscription
 *       + event timeline + linked invoices with derived amounts + transitions)
 * PATCH /api/billing/subscriptions/[id] → safe commercial fields only:
 *       plan/price/interval/tax/auto flags/notes/dates. Plan and price changes
 *       are logged as subscription events; historical invoices are NEVER
 *       rewritten; status is changed only via the status endpoint; currency is
 *       immutable after creation.
 */
import { db } from "@/lib/db";
import { BadRequestError, NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { requireModule, requireFounder } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { getBillingSettings } from "@/lib/billing/settings";
import { formatCurrency, formatDate } from "@/lib/format";
import { label, SUBSCRIPTION_TRANSITIONS } from "@/lib/types";
import {
  dateInput,
  billingIntervalSchema,
  currencyInput,
  positiveMinorAmount,
} from "@/lib/billing/validate";
import {
  loadFullInvoiceRecord,
  subscriptionInclude,
  toSubscriptionRecord,
} from "@/lib/billing/record";
import { z } from "zod";
import type { SubscriptionDetailData, SubscriptionEventRecord } from "@/lib/types";

// ---------------------------------------------------------------------------
// GET /api/billing/subscriptions/[id]
// ---------------------------------------------------------------------------

export const GET = withAuth(async (_req, user, { params }) => {
  // RBAC: commercial records are founder + support/finance read.
  requireModule(user, "billing");
  const { id } = await params;

  const sub = await db.subscription.findUnique({ where: { id }, include: subscriptionInclude });
  if (!sub) throw new NotFoundError("Subscription not found.");

  const [events, invoiceRows] = await Promise.all([
    db.subscriptionEvent.findMany({ where: { subscriptionId: id }, orderBy: { createdAt: "asc" } }),
    db.invoice.findMany({
      where: { subscriptionId: id },
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
      select: { id: true },
    }),
  ]);

  const settings = await getBillingSettings();
  const invoices = await Promise.all(invoiceRows.map((row) => loadFullInvoiceRecord(row.id, settings.invoicePrefix)));

  const eventRecords: SubscriptionEventRecord[] = events.map((e) => ({
    id: e.id,
    subscriptionId: e.subscriptionId,
    kind: e.kind,
    summary: e.summary,
    metadata: e.metadata,
    actorId: e.actorId,
    actorName: e.actorName,
    createdAt: e.createdAt.toISOString(),
  }));

  const data: SubscriptionDetailData = {
    subscription: toSubscriptionRecord(sub),
    events: eventRecords,
    invoices,
    allowedTransitions: [...(SUBSCRIPTION_TRANSITIONS[sub.status] ?? [])],
  };
  return jsonOk(data);
});

// ---------------------------------------------------------------------------
// PATCH /api/billing/subscriptions/[id] — safe commercial fields only
// ---------------------------------------------------------------------------

const patchSubscriptionSchema = z.object({
  websiteId: z.string().min(1).nullish(),
  planId: z.string().min(1).nullish(),
  agreedPriceMinor: positiveMinorAmount().optional(),
  billingInterval: billingIntervalSchema.optional(),
  taxRateBps: z.number().int().min(0).max(10000).optional(),
  autoInvoice: z.boolean().optional(),
  autoRenew: z.boolean().optional(),
  internalNotes: z.string().max(2000).nullish(),
  trialEndDate: dateInput,
  nextRenewalDate: dateInput,
  currency: currencyInput.optional(), // immutable — rejected when different
});

export const PATCH = withAuth(async (req, user, { params }) => {
  // RBAC: subscription commercial edits are founder-only.
  requireFounder(user);
  const { id } = await params;
  const body = await parseBody(req, patchSubscriptionSchema);

  const existing = await db.subscription.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Subscription not found.");

  if (body.currency && body.currency !== existing.currency) {
    throw new BadRequestError("Currency cannot be changed after creation.");
  }

  if (body.websiteId) {
    const website = await db.website.findUnique({ where: { id: body.websiteId }, select: { id: true, clientId: true } });
    if (!website) throw new BadRequestError("Website not found.");
    if (website.clientId !== existing.clientId) {
      throw new BadRequestError("Website does not belong to the subscription's client.");
    }
  }

  // --- plan change (snapshot updates; price follows the plan unless an
  // --- explicit agreedPriceMinor was provided in the same request)
  let planEvent: string | null = null;
  let newPlanName: string | null = existing.planName;
  let effectivePrice = existing.agreedPriceMinor;
  if (body.planId !== undefined && body.planId !== existing.planId) {
    if (body.planId === null) {
      newPlanName = null;
      planEvent = "Plan reference removed (agreed price is now the commercial truth).";
    } else {
      const plan = await db.servicePlan.findUnique({ where: { id: body.planId }, select: { id: true, name: true, priceMinor: true } });
      if (!plan) throw new BadRequestError("Service plan not found.");
      newPlanName = plan.name;
      if (body.agreedPriceMinor === undefined) {
        effectivePrice = plan.priceMinor;
      }
      planEvent = `Plan changed from ${existing.planName ?? "none"} to ${plan.name}; price for future renewals now ${formatCurrency(effectivePrice, existing.currency)}.`;
    }
  }

  // --- explicit price change
  let priceEvent: string | null = null;
  if (body.agreedPriceMinor !== undefined && body.agreedPriceMinor !== existing.agreedPriceMinor) {
    priceEvent = `Price changed from ${formatCurrency(existing.agreedPriceMinor, existing.currency)} to ${formatCurrency(body.agreedPriceMinor, existing.currency)} per ${label(body.billingInterval ?? existing.billingInterval).toLowerCase()}; existing invoices are unchanged.`;
    effectivePrice = body.agreedPriceMinor;
  }

  // --- billing interval change
  let intervalEvent: string | null = null;
  if (body.billingInterval !== undefined && body.billingInterval !== existing.billingInterval) {
    intervalEvent = `Billing interval changed from ${label(existing.billingInterval)} to ${label(body.billingInterval)}; future renewal invoices will use the new interval.`;
  }

  // --- explicit next renewal date adjustment
  let renewalEvent: string | null = null;
  if (body.nextRenewalDate !== undefined && body.nextRenewalDate !== null) {
    const newDate = body.nextRenewalDate;
    if (!existing.nextRenewalDate || existing.nextRenewalDate.getTime() !== newDate.getTime()) {
      renewalEvent = `Next renewal date moved from ${formatDate(existing.nextRenewalDate?.toISOString() ?? null)} to ${formatDate(newDate.toISOString())}.`;
    }
  }

  const updated = await db.$transaction(async (tx) => {
    const sub = await tx.subscription.update({
      where: { id },
      data: {
        // Unchecked (scalar FK) style throughout — never mix FK scalars with
        // relation fields in one Prisma update.
        ...(body.websiteId !== undefined ? { websiteId: body.websiteId } : {}),
        ...(body.planId !== undefined ? { planId: body.planId, planName: newPlanName } : {}),
        ...(body.agreedPriceMinor !== undefined || planEvent ? { agreedPriceMinor: effectivePrice } : {}),
        ...(body.billingInterval !== undefined ? { billingInterval: body.billingInterval } : {}),
        ...(body.taxRateBps !== undefined ? { taxRateBps: body.taxRateBps } : {}),
        ...(body.autoInvoice !== undefined ? { autoInvoice: body.autoInvoice } : {}),
        ...(body.autoRenew !== undefined ? { autoRenew: body.autoRenew } : {}),
        ...(body.internalNotes !== undefined ? { internalNotes: body.internalNotes ?? null } : {}),
        ...(body.trialEndDate !== undefined ? { trialEndDate: body.trialEndDate } : {}),
        ...(body.nextRenewalDate !== undefined ? { nextRenewalDate: body.nextRenewalDate } : {}),
      },
    });

    const events: { kind: string; summary: string }[] = [];
    if (planEvent) events.push({ kind: "PLAN_CHANGED", summary: planEvent });
    if (priceEvent) events.push({ kind: "PRICE_CHANGED", summary: priceEvent });
    if (intervalEvent) events.push({ kind: "PLAN_CHANGED", summary: intervalEvent });
    if (renewalEvent) events.push({ kind: "NOTE", summary: renewalEvent });
    for (const event of events) {
      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: id,
          kind: event.kind,
          summary: event.summary,
          actorId: user.id,
          actorName: user.displayName,
        },
      });
    }
    return sub;
  });

  const changedSummary = [planEvent, priceEvent, intervalEvent, renewalEvent].filter(Boolean).join(" ");
  if (changedSummary || Object.keys(body).length > 0) {
    const display = newPlanName ?? "Subscription";
    await logActivity({
      action: "SUBSCRIPTION_UPDATED",
      entityType: "SUBSCRIPTION",
      entityId: id,
      entityLabel: display,
      summary: changedSummary
        ? `Updated subscription (${display}): ${changedSummary}`
        : `Updated subscription settings (${display}).`,
      actor: user,
      clientId: updated.clientId,
      websiteId: updated.websiteId,
      metadata: { fields: Object.keys(body) },
    });
  }

  const full = await db.subscription.findUnique({ where: { id }, include: subscriptionInclude });
  if (!full) throw new NotFoundError("Subscription not found.");
  return jsonOk(toSubscriptionRecord(full));
});
