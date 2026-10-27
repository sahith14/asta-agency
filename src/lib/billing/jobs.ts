/**
 * AgencyOS — billing background jobs (Phase 3, server-only).
 *
 * runBillingTasks(trigger) executes the four maintenance tasks sequentially,
 * each guarded so one failure never blocks the others:
 *
 * 1. EXPIRE_QUOTES          — SENT quotes past expiryDate → EXPIRED
 * 2. FLAG_OVERDUE           — ISSUED invoices past due with a balance → OVERDUE
 * 3. SUBSCRIPTION_PAST_DUE  — ACTIVE subscriptions with an overdue renewal
 *                             invoice → PAST_DUE. HARD RULE: this NEVER
 *                             touches Website.lifecycleStatus — a late payer
 *                             must never have their website suspended.
 * 4. RENEWAL_INVOICES       — ACTIVE subs (autoInvoice && autoRenew) whose
 *                             nextRenewalDate has arrived get a renewal
 *                             invoice; the period advances atomically.
 *
 * All tasks are idempotent — re-running cannot double-create invoices or
 * double-transition statuses. Finally the run timestamp is persisted under
 * Setting "billing_jobs_last_run" (the scheduler's due-check source).
 */
import "server-only";
import { db } from "@/lib/db";
import type { Invoice, Subscription } from "@prisma/client";
import { addBillingPeriod } from "@/lib/money";
import { label } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { logActivity } from "@/lib/activity";
import { createWithNumber } from "@/lib/billing-num";
import { displayNumber, getBillingSettings, type BillingSettings } from "@/lib/billing/settings";
import { computeDerived, endOfToday, groupPaymentsFromAllocations, startOfToday } from "@/lib/billing/invoice-math";
import { computeLineData } from "@/lib/billing/record";
import { addDays } from "@/lib/billing/validate";
import type { BillingJobRunData, BillingJobTaskResult } from "@/lib/types";
import type { SessionUser } from "@/lib/auth";

const LAST_RUN_KEY = "billing_jobs_last_run";

// ---------------------------------------------------------------------------
// Renewal invoice creation (shared by the job + the manual renew endpoint)
// ---------------------------------------------------------------------------

export interface RenewalOutcome {
  created: boolean;
  invoice: Invoice;
  displayNumber: string;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Creates this subscription's renewal invoice for its next period — or
 * reports the existing one when a non-VOID RENEWAL invoice already covers
 * that periodStart (duplicate guard, making the operation idempotent).
 *
 * Number allocation uses the module-level db (createWithNumber retries on
 * P2002 races); the invoice + line + subscription advance + event run in one
 * transaction so a crashed run can never leave a half-renewed subscription.
 */
export async function createRenewalInvoice(
  sub: Subscription,
  settings: BillingSettings,
  actor: SessionUser | null
): Promise<RenewalOutcome> {
  if (!sub.nextRenewalDate) throw new Error("createRenewalInvoice: subscription has no nextRenewalDate.");

  const periodStart = sub.nextRenewalDate;
  const periodEnd = addBillingPeriod(periodStart, sub.billingInterval);
  const now = new Date();
  const dueDate = addDays(now, settings.defaultPaymentTermsDays);
  const planName = sub.planName ?? "Maintenance";

  // Duplicate guard: a non-VOID renewal invoice for the same period exists?
  const existing = await db.invoice.findFirst({
    where: {
      subscriptionId: sub.id,
      kind: "RENEWAL",
      periodStart,
      status: { not: "VOID" },
    },
    select: { id: true, number: true },
  });
  if (existing) {
    return {
      created: false,
      invoice: existing as Invoice,
      displayNumber: displayNumber(settings.invoicePrefix, existing.number),
      periodStart,
      periodEnd,
    };
  }

  // One renewal line: agreed price for the coming period (tax-exclusive;
  // the subscription's taxRateBps drives the tax). Totals recomputed from
  // the raw line inputs — never hand-arithmetic.
  const lineInputs = [
    {
      description: `${planName} — ${label(sub.billingInterval)} maintenance (${formatDate(periodStart.toISOString())} to ${formatDate(periodEnd.toISOString())})`,
      quantity: 1,
      unitPriceMinor: sub.agreedPriceMinor,
      discountMinor: 0,
      taxRateBps: sub.taxRateBps,
    },
  ];
  const { rows, totals } = computeLineData(lineInputs, false);
  const periodLabel = `${formatDate(periodStart.toISOString())} to ${formatDate(periodEnd.toISOString())}`;

  const invoice = await createWithNumber("invoice", (number) =>
    db.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          number,
          clientId: sub.clientId,
          websiteId: sub.websiteId,
          subscriptionId: sub.id,
          kind: "RENEWAL",
          status: "ISSUED",
          issueDate: now,
          dueDate,
          currency: sub.currency,
          taxInclusive: false,
          subtotalMinor: totals.subtotalMinor,
          taxMinor: totals.taxMinor,
          totalMinor: totals.totalMinor,
          terms: settings.defaultInvoiceTerms || null,
          issuedAt: now,
          periodStart,
          periodEnd,
          createdById: actor?.id ?? null,
        },
      });
      await tx.invoiceLineItem.createMany({
        data: rows.map((row) => ({ ...row, invoiceId: created.id })),
      });
      // Advance the subscription's period atomically with the invoice.
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          nextRenewalDate: periodEnd,
        },
      });
      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: sub.id,
          kind: "RENEWAL_INVOICED",
          summary: `Renewal invoice ${displayNumber(settings.invoicePrefix, number)} created for period ${periodLabel}.`,
          actorId: actor?.id ?? null,
          actorName: actor?.displayName ?? "System",
        },
      });
      return created;
    })
  );

  const display = displayNumber(settings.invoicePrefix, invoice.number);

  await logActivity({
    action: "INVOICE_CREATED",
    entityType: "INVOICE",
    entityId: invoice.id,
    entityLabel: display,
    summary: `Created renewal invoice ${display} for period ${periodLabel}.`,
    actor: actor ?? undefined, // undefined → System in the audit stream
    clientId: sub.clientId,
    websiteId: sub.websiteId,
    metadata: { kind: "RENEWAL", subscriptionId: sub.id, quoteId: null },
  });

  return { created: true, invoice, displayNumber: display, periodStart, periodEnd };
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

async function taskExpireQuotes(): Promise<BillingJobTaskResult> {
  const today = startOfToday();
  const settings = await getBillingSettings();

  const due = await db.quote.findMany({
    where: { status: "SENT", expiryDate: { lt: today } },
    select: { id: true, number: true, clientId: true },
  });
  if (due.length === 0) return { task: "EXPIRE_QUOTES", changed: 0, details: [] };

  const result = await db.quote.updateMany({
    where: { id: { in: due.map((q) => q.id) }, status: "SENT" }, // status re-check = idempotent
    data: { status: "EXPIRED" },
  });

  for (const quote of due) {
    await logActivity({
      action: "QUOTE_EXPIRED",
      entityType: "QUOTE",
      entityId: quote.id,
      entityLabel: displayNumber(settings.quotePrefix, quote.number),
      summary: `Quote ${displayNumber(settings.quotePrefix, quote.number)} expired (past its expiry date).`,
    });
  }

  return {
    task: "EXPIRE_QUOTES",
    changed: result.count,
    details: due.map((q) => `${displayNumber(settings.quotePrefix, q.number)} expired`),
  };
}

async function taskFlagOverdue(): Promise<BillingJobTaskResult> {
  const today = startOfToday();
  const settings = await getBillingSettings();

  const candidates = await db.invoice.findMany({
    where: { status: "ISSUED", dueDate: { lt: today } },
    select: {
      id: true,
      number: true,
      clientId: true,
      websiteId: true,
      totalMinor: true,
      status: true,
      dueDate: true,
      allocations: {
        select: { id: true, paymentId: true, amountMinor: true, payment: { select: { id: true, status: true, amountMinor: true, refundMinor: true } } },
      },
    },
  });

  const details: string[] = [];
  let changed = 0;
  for (const invoice of candidates) {
    const { outstandingMinor } = computeDerived(invoice, groupPaymentsFromAllocations(invoice.allocations), today);
    if (outstandingMinor <= 0) continue; // fully covered — nothing to flag

    await db.invoice.update({ where: { id: invoice.id }, data: { status: "OVERDUE" } });
    changed += 1;
    const display = displayNumber(settings.invoicePrefix, invoice.number);
    details.push(`${display} marked overdue`);
    await logActivity({
      action: "INVOICE_MARKED_OVERDUE",
      entityType: "INVOICE",
      entityId: invoice.id,
      entityLabel: display,
      summary: `Invoice ${display} marked overdue (payment terms passed).`,
      actor: undefined, // System
      clientId: invoice.clientId,
      websiteId: invoice.websiteId,
    });
  }
  return { task: "FLAG_OVERDUE", changed, details };
}

async function taskSubscriptionPastDue(): Promise<BillingJobTaskResult> {
  const today = startOfToday();
  const settings = await getBillingSettings();
  const unpaidStatuses = ["ISSUED", "OVERDUE", "PARTIALLY_PAID"];

  const subs = await db.subscription.findMany({
    where: { status: "ACTIVE" },
    include: {
      invoices: {
        where: { kind: "RENEWAL", status: { in: unpaidStatuses }, dueDate: { lt: today } },
        select: {
          id: true,
          number: true,
          status: true,
          totalMinor: true,
          dueDate: true,
          allocations: {
            select: { id: true, paymentId: true, amountMinor: true, payment: { select: { id: true, status: true, amountMinor: true, refundMinor: true } } },
          },
        },
      },
    },
  });

  const details: string[] = [];
  let changed = 0;
  for (const sub of subs) {
    // An already-OVERDUE renewal invoice, or an unpaid one that is computed
    // overdue (past due date with a remaining balance).
    const offending = sub.invoices.find((inv) => {
      if (inv.status === "OVERDUE") return true;
      const derived = computeDerived(inv, groupPaymentsFromAllocations(inv.allocations), today);
      return derived.isOverdue;
    });
    if (!offending) continue;

    const display = displayNumber(settings.invoicePrefix, offending.number);
    await db.subscription.update({ where: { id: sub.id }, data: { status: "PAST_DUE" } });
    await db.subscriptionEvent.create({
      data: {
        subscriptionId: sub.id,
        kind: "STATUS_CHANGED",
        summary: `Marked past due — renewal invoice ${display} is overdue.`,
        actorId: null,
        actorName: "System",
      },
    });
    changed += 1;
    details.push(`${sub.planName ?? "Subscription"} marked past due (${display})`);

    // HARD RULE: websites are NEVER suspended or altered for late payment.
    // This task intentionally only flips the subscription's own status.
  }
  return { task: "SUBSCRIPTION_PAST_DUE", changed, details };
}

async function taskRenewalInvoices(): Promise<BillingJobTaskResult> {
  const settings = await getBillingSettings();
  const now = new Date();

  const subs = await db.subscription.findMany({
    where: {
      status: "ACTIVE",
      autoInvoice: true,
      autoRenew: true,
      nextRenewalDate: { lte: endOfToday() },
    },
    include: { client: { select: { businessName: true } } },
  });

  const details: string[] = [];
  let changed = 0;
  for (const sub of subs) {
    // cancelAtPeriodEnd subscriptions never get a new invoice; once their
    // period has passed they end instead.
    if (sub.cancelAtPeriodEnd) {
      const periodEnd = sub.currentPeriodEnd ?? sub.nextRenewalDate;
      if (periodEnd && periodEnd.getTime() < now.getTime()) {
        await db.subscription.update({
          where: { id: sub.id },
          data: { status: "ENDED", endedAt: now },
        });
        await db.subscriptionEvent.create({
          data: {
            subscriptionId: sub.id,
            kind: "ENDED",
            summary: "Period ended — subscription was cancelled at period end.",
            actorId: null,
            actorName: "System",
          },
        });
        changed += 1;
        details.push(`${sub.planName ?? "Subscription"} ended (cancelled at period end)`);
      } else {
        details.push(`${sub.planName ?? "Subscription"} skipped — cancels at period end`);
      }
      continue;
    }

    try {
      const outcome = await createRenewalInvoice(sub, settings, null);
      if (outcome.created) {
        changed += 1;
        details.push(`${outcome.displayNumber} created for ${sub.client.businessName}`);
      } else {
        details.push(`${outcome.displayNumber} already exists for this renewal period — skipped`);
      }
    } catch (err) {
      // One subscription failing must not stop the rest.
      console.error(`[billing-jobs] Renewal invoice failed for subscription ${sub.id}:`, err instanceof Error ? err.message : err);
      details.push(`${sub.planName ?? "Subscription"} renewal failed — see server log`);
    }
  }
  return { task: "RENEWAL_INVOICES", changed, details };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function runTask(name: string, fn: () => Promise<BillingJobTaskResult>): Promise<BillingJobTaskResult> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[billing-jobs] Task ${name} failed:`, err instanceof Error ? err.message : err);
    return { task: name, changed: 0, details: ["Task failed — see server log."] };
  }
}

/** Runs all four billing tasks; one failure never blocks the others. */
export async function runBillingTasks(trigger: "MANUAL" | "SCHEDULED"): Promise<BillingJobRunData> {
  const ranAt = new Date();
  const results: BillingJobTaskResult[] = [];

  results.push(await runTask("EXPIRE_QUOTES", taskExpireQuotes));
  results.push(await runTask("FLAG_OVERDUE", taskFlagOverdue));
  results.push(await runTask("SUBSCRIPTION_PAST_DUE", taskSubscriptionPastDue));
  results.push(await runTask("RENEWAL_INVOICES", taskRenewalInvoices));

  // Persist the run time — the scheduler's due-check reads this Setting.
  await db.setting.upsert({
    where: { key: LAST_RUN_KEY },
    create: { key: LAST_RUN_KEY, value: ranAt.toISOString() },
    update: { value: ranAt.toISOString() },
  });

  const changedTotal = results.reduce((sum, r) => sum + r.changed, 0);
  console.log(`[billing-jobs] ${trigger} run complete: ${changedTotal} change(s) across ${results.length} tasks`);

  return { ranAt: ranAt.toISOString(), trigger, results };
}

/** Reads the persisted last-run time (null = never run). */
export async function getLastBillingJobRun(): Promise<Date | null> {
  const row = await db.setting.findUnique({ where: { key: LAST_RUN_KEY } });
  if (!row?.value) return null;
  const parsed = Date.parse(row.value);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}
