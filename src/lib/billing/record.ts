/**
 * AgencyOS — billing record mappers + shared includes (Phase 3, server-only).
 *
 * One mapping layer for every billing surface: Prisma rows → the frozen API
 * records in src/lib/types.ts. Dates are serialized to ISO strings by
 * NextResponse.json (same convention as the tasks/tickets routes).
 *
 * Money totals are NEVER taken from client input — every line/totals value is
 * recomputed server-side from raw line inputs via src/lib/money.ts.
 */
import "server-only";
import type { Prisma, QuoteLineItem, InvoiceLineItem } from "@prisma/client";
import { db } from "@/lib/db";
import { computeLine, computeTotals, effectiveAllocations, monthlyEquivalentMinor } from "@/lib/money";
import { displayNumber } from "@/lib/billing/settings";
import {
  computeDerived,
  groupPaymentsFromAllocations,
  paymentDerivedSelect,
  startOfToday,
} from "@/lib/billing/invoice-math";
import type {
  ActivityRecord,
  BillingLineRecord,
  BillingRenewalItem,
  InvoiceRecord,
  PaymentRecord,
  QuoteRecord,
  ServicePlanRecord,
  SubscriptionRecord,
  LineItemInput,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Includes
// ---------------------------------------------------------------------------

export const planInclude = { _count: { select: { subscriptions: true } } } satisfies Prisma.ServicePlanInclude;

export const quoteInclude = {
  client: { select: { id: true, businessName: true } },
  project: { select: { id: true, name: true } },
  website: { select: { id: true, name: true } },
  _count: { select: { invoices: true } },
} satisfies Prisma.QuoteInclude;

export const invoiceInclude = {
  client: { select: { id: true, businessName: true } },
  quote: { select: { id: true, number: true, status: true } },
  project: { select: { id: true, name: true } },
  website: { select: { id: true, name: true } },
  subscription: { select: { id: true, planName: true, status: true } },
  _count: { select: { allocations: true } },
  allocations: {
    select: { id: true, paymentId: true, invoiceId: true, amountMinor: true, payment: { select: paymentDerivedSelect } },
  },
} satisfies Prisma.InvoiceInclude;

export const paymentInclude = {
  client: { select: { id: true, businessName: true } },
  createdBy: { select: { id: true, displayName: true } },
  verifiedBy: { select: { id: true, displayName: true } },
  allocations: { include: { invoice: { select: { id: true, number: true } } } },
} satisfies Prisma.PaymentInclude;

export const subscriptionInclude = {
  client: { select: { id: true, businessName: true } },
  website: { select: { id: true, name: true } },
  plan: { select: { id: true, name: true } },
  _count: { select: { invoices: true } },
} satisfies Prisma.SubscriptionInclude;

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

export function toBillingLineRecord(line: QuoteLineItem | InvoiceLineItem): BillingLineRecord {
  return {
    id: line.id,
    position: line.position,
    description: line.description,
    quantity: line.quantity,
    unitPriceMinor: line.unitPriceMinor,
    discountMinor: line.discountMinor,
    taxRateBps: line.taxRateBps,
    netMinor: line.netMinor,
    taxMinor: line.taxMinor,
    grossMinor: line.grossMinor,
  };
}

/** Raw line inputs as stored on a persisted line row (for snapshots/recompute). */
export function lineInputsFromRows(
  rows: Pick<QuoteLineItem | InvoiceLineItem, "description" | "quantity" | "unitPriceMinor" | "discountMinor" | "taxRateBps">[]
): LineItemInput[] {
  return rows.map((r) => ({
    description: r.description,
    quantity: r.quantity,
    unitPriceMinor: r.unitPriceMinor,
    discountMinor: r.discountMinor,
    taxRateBps: r.taxRateBps,
  }));
}

/**
 * Computes per-line net/tax/gross + document totals from RAW line inputs.
 * The server is always the authority — browser-computed totals are ignored.
 */
export function computeLineData(lines: LineItemInput[], taxInclusive: boolean): {
  rows: {
    position: number;
    description: string;
    quantity: number;
    unitPriceMinor: number;
    discountMinor: number;
    taxRateBps: number;
    netMinor: number;
    taxMinor: number;
    grossMinor: number;
  }[];
  totals: { subtotalMinor: number; taxMinor: number; totalMinor: number };
} {
  const rows = lines.map((line, index) => {
    const computed = computeLine(line, taxInclusive);
    return {
      position: index,
      description: line.description,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      discountMinor: line.discountMinor,
      taxRateBps: line.taxRateBps,
      ...computed,
    };
  });
  return { rows, totals: computeTotals(lines, taxInclusive) };
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

function parseJsonStringArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    // corrupt value — render as empty rather than failing the request
  }
  return [];
}

export function toServicePlanRecord(plan: {
  id: string;
  name: string;
  description: string | null;
  billingInterval: string;
  priceMinor: number;
  currency: string;
  allowanceHours: number | null;
  includedServices: string | null;
  terms: string | null;
  autoRenew: boolean;
  isActive: boolean;
  isSample: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count?: { subscriptions: number };
}): ServicePlanRecord {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    billingInterval: plan.billingInterval,
    priceMinor: plan.priceMinor,
    currency: plan.currency,
    allowanceHours: plan.allowanceHours,
    includedServices: parseJsonStringArray(plan.includedServices),
    terms: plan.terms,
    autoRenew: plan.autoRenew,
    isActive: plan.isActive,
    isSample: plan.isSample,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
    ...(plan._count ? { _count: plan._count } : {}),
  };
}

export function toQuoteRecord(
  quote: Prisma.QuoteGetPayload<{ include: typeof quoteInclude }>,
  quotePrefix: string
): QuoteRecord {
  return {
    id: quote.id,
    number: quote.number,
    displayNumber: displayNumber(quotePrefix, quote.number),
    clientId: quote.clientId,
    projectId: quote.projectId,
    websiteId: quote.websiteId,
    status: quote.status,
    issueDate: quote.issueDate.toISOString(),
    expiryDate: quote.expiryDate ? quote.expiryDate.toISOString() : null,
    currency: quote.currency,
    taxInclusive: quote.taxInclusive,
    subtotalMinor: quote.subtotalMinor,
    taxMinor: quote.taxMinor,
    totalMinor: quote.totalMinor,
    scope: quote.scope,
    terms: quote.terms,
    acceptedSnapshot: quote.acceptedSnapshot,
    acceptedAt: quote.acceptedAt ? quote.acceptedAt.toISOString() : null,
    acceptedByName: quote.acceptedByName,
    sentAt: quote.sentAt ? quote.sentAt.toISOString() : null,
    rejectedAt: quote.rejectedAt ? quote.rejectedAt.toISOString() : null,
    cancelledAt: quote.cancelledAt ? quote.cancelledAt.toISOString() : null,
    isSample: quote.isSample,
    createdAt: quote.createdAt.toISOString(),
    updatedAt: quote.updatedAt.toISOString(),
    client: quote.client,
    project: quote.project,
    website: quote.website,
    _count: quote._count,
  } as unknown as QuoteRecord;
}

export function toInvoiceRecord(
  invoice: Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>,
  invoicePrefix: string,
  today: Date = startOfToday()
): InvoiceRecord {
  const derived = computeDerived(
    invoice,
    groupPaymentsFromAllocations(invoice.allocations),
    today
  );
  return {
    id: invoice.id,
    number: invoice.number,
    displayNumber: displayNumber(invoicePrefix, invoice.number),
    clientId: invoice.clientId,
    quoteId: invoice.quoteId,
    projectId: invoice.projectId,
    websiteId: invoice.websiteId,
    subscriptionId: invoice.subscriptionId,
    kind: invoice.kind,
    status: invoice.status,
    issueDate: invoice.issueDate.toISOString(),
    dueDate: invoice.dueDate ? invoice.dueDate.toISOString() : null,
    currency: invoice.currency,
    taxInclusive: invoice.taxInclusive,
    subtotalMinor: invoice.subtotalMinor,
    taxMinor: invoice.taxMinor,
    totalMinor: invoice.totalMinor,
    paidMinor: derived.paidMinor,
    pendingMinor: derived.pendingMinor,
    outstandingMinor: derived.outstandingMinor,
    isOverdue: derived.isOverdue,
    notes: invoice.notes,
    terms: invoice.terms,
    issuedAt: invoice.issuedAt ? invoice.issuedAt.toISOString() : null,
    paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
    voidedAt: invoice.voidedAt ? invoice.voidedAt.toISOString() : null,
    voidReason: invoice.voidReason,
    periodStart: invoice.periodStart ? invoice.periodStart.toISOString() : null,
    periodEnd: invoice.periodEnd ? invoice.periodEnd.toISOString() : null,
    isSample: invoice.isSample,
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
    client: invoice.client,
    quote: invoice.quote
      ? {
          id: invoice.quote.id,
          displayNumber: displayNumber(invoicePrefix, invoice.quote.number),
          status: invoice.quote.status,
        }
      : null,
    project: invoice.project,
    website: invoice.website,
    subscription: invoice.subscription,
    _count: invoice._count,
  } as unknown as InvoiceRecord;
}

export function toPaymentRecord(
  payment: Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>,
  invoicePrefix: string
): PaymentRecord {
  // FIFO refund share per payment (money.ts) — Σ effective always equals
  // amountMinor − refundMinor exactly.
  const schedule = effectiveAllocations(
    payment.amountMinor,
    payment.refundMinor,
    payment.allocations.map((a) => ({ id: a.id, amountMinor: a.amountMinor }))
  );
  const effectiveById = new Map(schedule.map((s) => [s.id, s.effectiveMinor]));
  return {
    id: payment.id,
    reference: payment.reference,
    displayNumber: displayNumber(invoicePrefix, payment.reference),
    clientId: payment.clientId,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    method: payment.method,
    status: payment.status,
    paidAt: payment.paidAt.toISOString(),
    referenceNum: payment.referenceNum,
    notes: payment.notes,
    refundMinor: payment.refundMinor,
    refundReason: payment.refundReason,
    refundedAt: payment.refundedAt ? payment.refundedAt.toISOString() : null,
    gateway: payment.gateway,
    verifiedAt: payment.verifiedAt ? payment.verifiedAt.toISOString() : null,
    isSample: payment.isSample,
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
    client: payment.client,
    createdBy: payment.createdBy,
    verifiedBy: payment.verifiedBy,
    effectiveMinor: Math.max(0, payment.amountMinor - payment.refundMinor),
    allocations: payment.allocations.map((a) => ({
      id: a.id,
      paymentId: a.paymentId,
      invoiceId: a.invoiceId,
      invoiceDisplayNumber: displayNumber(invoicePrefix, a.invoice.number),
      amountMinor: a.amountMinor,
      effectiveMinor: effectiveById.get(a.id) ?? a.amountMinor,
      createdAt: a.createdAt.toISOString(),
    })),
  } as unknown as PaymentRecord;
}

export function toSubscriptionRecord(
  sub: Prisma.SubscriptionGetPayload<{ include: typeof subscriptionInclude }>
): SubscriptionRecord {
  return {
    id: sub.id,
    clientId: sub.clientId,
    websiteId: sub.websiteId,
    planId: sub.planId,
    planName: sub.planName,
    agreedPriceMinor: sub.agreedPriceMinor,
    currency: sub.currency,
    billingInterval: sub.billingInterval,
    taxRateBps: sub.taxRateBps,
    status: sub.status,
    startDate: sub.startDate.toISOString(),
    trialEndDate: sub.trialEndDate ? sub.trialEndDate.toISOString() : null,
    currentPeriodStart: sub.currentPeriodStart ? sub.currentPeriodStart.toISOString() : null,
    currentPeriodEnd: sub.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
    nextRenewalDate: sub.nextRenewalDate ? sub.nextRenewalDate.toISOString() : null,
    autoInvoice: sub.autoInvoice,
    autoRenew: sub.autoRenew,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    pausedAt: sub.pausedAt ? sub.pausedAt.toISOString() : null,
    cancelledAt: sub.cancelledAt ? sub.cancelledAt.toISOString() : null,
    endedAt: sub.endedAt ? sub.endedAt.toISOString() : null,
    internalNotes: sub.internalNotes,
    isSample: sub.isSample,
    createdAt: sub.createdAt.toISOString(),
    updatedAt: sub.updatedAt.toISOString(),
    client: sub.client,
    website: sub.website,
    plan: sub.plan,
    _count: sub._count,
    monthlyEquivalentMinor: monthlyEquivalentMinor(sub.agreedPriceMinor, sub.billingInterval),
  } as unknown as SubscriptionRecord;
}

export function toBillingRenewalItem(sub: {
  id: string;
  planName: string | null;
  agreedPriceMinor: number;
  currency: string;
  billingInterval: string;
  status: string;
  nextRenewalDate: Date | null;
  client?: { businessName: string } | null;
  website?: { name: string } | null;
}): BillingRenewalItem {
  return {
    subscriptionId: sub.id,
    clientName: sub.client?.businessName ?? "—",
    websiteName: sub.website?.name ?? null,
    planName: sub.planName,
    nextRenewalDate: (sub.nextRenewalDate ?? new Date(0)).toISOString(),
    amountMinor: sub.agreedPriceMinor,
    currency: sub.currency,
    billingInterval: sub.billingInterval,
    status: sub.status,
  };
}

export function toActivityRecord(a: {
  id: string;
  kind: string;
  action: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  summary: string;
  actorId: string | null;
  actorName: string;
  metadata: string | null;
  clientId: string | null;
  websiteId: string | null;
  projectId: string | null;
  createdAt: Date;
}): ActivityRecord {
  return {
    id: a.id,
    kind: a.kind,
    action: a.action,
    entityType: a.entityType,
    entityId: a.entityId,
    entityLabel: a.entityLabel,
    summary: a.summary,
    actorId: a.actorId,
    actorName: a.actorName,
    metadata: a.metadata,
    clientId: a.clientId,
    websiteId: a.websiteId,
    projectId: a.projectId,
    createdAt: a.createdAt.toISOString(),
  };
}

/** Activity trail for one entity (latest first). */
export async function loadEntityActivity(entityType: string, entityId: string, take = 50): Promise<ActivityRecord[]> {
  const rows = await db.activity.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: "desc" },
    take,
  });
  return rows.map(toActivityRecord);
}

/**
 * Loads a full InvoiceRecord with lines + derived fields — the canonical
 * re-read after create/update/issue/void operations.
 */
export async function loadFullInvoiceRecord(id: string, invoicePrefix: string): Promise<InvoiceRecord> {
  const full = await db.invoice.findUnique({ where: { id }, include: { ...invoiceInclude, lines: true } });
  if (!full) throw new Error(`Invoice ${id} could not be loaded after the operation.`);
  const record = toInvoiceRecord(full, invoicePrefix);
  record.lines = full.lines.sort((a, b) => a.position - b.position).map((l) => toBillingLineRecord(l));
  return record;
}
