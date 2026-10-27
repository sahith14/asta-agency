/**
 * AgencyOS — Subscription status actions (Phase 3).
 * POST /api/billing/subscriptions/[id]/status
 *   { action: "activate" | "pause" | "resume" | "cancel" | "end",
 *     cancelAtPeriodEnd?: boolean }
 *
 * Server-validated against the frozen SUBSCRIPTION_TRANSITIONS map.
 * "cancel" with cancelAtPeriodEnd=true on an ACTIVE subscription only flags
 * the pending cancellation — the subscription keeps serving until the period
 * ends (the billing job ends it; no new renewal invoice will be raised).
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { requireFounder } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { addBillingPeriod } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/format";
import { label, SUBSCRIPTION_TRANSITIONS } from "@/lib/types";
import { subscriptionInclude, toSubscriptionRecord } from "@/lib/billing/record";

const statusSchema = z.object({
  action: z.enum(["activate", "pause", "resume", "cancel", "end"]),
  cancelAtPeriodEnd: z.boolean().optional(),
});

const ACTION_TARGET: Record<string, string> = {
  activate: "ACTIVE",
  pause: "PAUSED",
  resume: "ACTIVE",
  cancel: "CANCELLED",
  end: "ENDED",
};

export const POST = withAuth(async (req, user, { params }) => {
  // RBAC: subscription lifecycle actions are founder-only.
  requireFounder(user);
  const { id } = await params;
  const body = await parseBody(req, statusSchema);

  const sub = await db.subscription.findUnique({ where: { id } });
  if (!sub) throw new NotFoundError("Subscription not found.");

  const target = ACTION_TARGET[body.action];
  const allowed = SUBSCRIPTION_TRANSITIONS[sub.status] ?? [];
  if (!allowed.includes(target)) {
    throw new BadRequestError(
      `Cannot move subscription from ${label(sub.status)} to ${label(target)}. Allowed: ${allowed.map(label).join(", ") || "nothing"}.`
    );
  }

  const now = new Date();
  const display = sub.planName ?? "Subscription";
  const eventName = body.action === "activate" && sub.status === "PAUSED" ? "RESUMED" : undefined;

  if (body.action === "cancel" && body.cancelAtPeriodEnd && sub.status === "ACTIVE") {
    // Flag the pending cancellation — do NOT end the subscription now.
    const periodEnd = sub.currentPeriodEnd ?? sub.nextRenewalDate;
    await db.subscription.update({
      where: { id },
      data: { cancelAtPeriodEnd: true },
    });
    await db.subscriptionEvent.create({
      data: {
        subscriptionId: id,
        kind: "CANCELLED",
        summary: `Cancels at period end${periodEnd ? ` (${formatDate(periodEnd.toISOString())})` : ""} — service continues until then; no further renewal invoices will be raised.`,
        actorId: user.id,
        actorName: user.displayName,
      },
    });
    await logActivity({
      action: "SUBSCRIPTION_CANCEL_SCHEDULED",
      entityType: "SUBSCRIPTION",
      entityId: id,
      entityLabel: display,
      summary: `Subscription ${display} will cancel at period end.`,
      actor: user,
      clientId: sub.clientId,
      websiteId: sub.websiteId,
    });
    const full = await db.subscription.findUnique({ where: { id }, include: subscriptionInclude });
    if (!full) throw new NotFoundError("Subscription not found.");
    return jsonOk(toSubscriptionRecord(full));
  }

  const data: Record<string, unknown> = { status: target };
  const eventSummaries: { kind: string; summary: string }[] = [];

  switch (body.action) {
    case "activate":
    case "resume": {
      // A fresh nextRenewalDate when none exists (never renewed before).
      if (!sub.nextRenewalDate) {
        data.nextRenewalDate = addBillingPeriod(now, sub.billingInterval);
        data.currentPeriodStart = sub.currentPeriodStart ?? now;
        data.currentPeriodEnd = data.nextRenewalDate;
      }
      eventSummaries.push({
        kind: eventName ?? "STATUS_CHANGED",
        summary:
          body.action === "resume"
            ? `Subscription resumed from ${label(sub.status).toLowerCase()}.`
            : `Subscription activated from ${label(sub.status).toLowerCase()}.`,
      });
      break;
    }
    case "pause": {
      data.pausedAt = now;
      eventSummaries.push({ kind: "PAUSED", summary: `Subscription paused (was ${label(sub.status).toLowerCase()}).` });
      break;
    }
    case "cancel": {
      data.cancelledAt = now;
      data.cancelAtPeriodEnd = false; // cancelling now — the flag no longer applies
      eventSummaries.push({ kind: "CANCELLED", summary: `Subscription cancelled (was ${label(sub.status).toLowerCase()}).` });
      break;
    }
    case "end": {
      data.endedAt = now;
      eventSummaries.push({ kind: "ENDED", summary: `Subscription ended (was ${label(sub.status).toLowerCase()}).` });
      break;
    }
  }

  await db.subscription.update({ where: { id }, data });
  for (const event of eventSummaries) {
    await db.subscriptionEvent.create({
      data: {
        subscriptionId: id,
        kind: event.kind,
        summary: event.summary,
        actorId: user.id,
        actorName: user.displayName,
      },
    });
  }

  await logActivity({
    action: `SUBSCRIPTION_${body.action === "resume" ? "RESUMED" : body.action === "activate" ? "ACTIVATED" : body.action.toUpperCase()}`,
    entityType: "SUBSCRIPTION",
    entityId: id,
    entityLabel: display,
    summary: `Subscription ${display} → ${label(target)} at ${formatDateTime(now.toISOString())}.`,
    actor: user,
    clientId: sub.clientId,
    websiteId: sub.websiteId,
  });

  const full = await db.subscription.findUnique({ where: { id }, include: subscriptionInclude });
  if (!full) throw new NotFoundError("Subscription not found.");
  return jsonOk(toSubscriptionRecord(full));
});
