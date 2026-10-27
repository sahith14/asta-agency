/**
 * AgencyOS — Billing subscriptions API (Phase 3).
 * GET  /api/billing/subscriptions → Paginated<SubscriptionRecord>
 *      filters: status (CSV), clientId, websiteId, planId,
 *      search (client business name / plan name); sort createdAt|nextRenewalDate.
 * POST /api/billing/subscriptions → create (PENDING by default; plan snapshot
 *      + agreed price are the commercial truth, plan price changes never
 *      rewrite them).
 */
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, jsonOk, parseBody, parseQuery, withAuth } from "@/lib/api";
import { requireModule, requireFounder } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { getBillingSettings } from "@/lib/billing/settings";
import { addBillingPeriod, monthlyEquivalentMinor } from "@/lib/money";
import { subscriptionInclude, toSubscriptionRecord } from "@/lib/billing/record";
import {
  billingIntervalSchema,
  currencyInput,
  dateInput,
  parseEnumListParam,
  positiveMinorAmount,
} from "@/lib/billing/validate";
import { SUBSCRIPTION_STATUSES, label } from "@/lib/types";
import type { Paginated, SubscriptionRecord } from "@/lib/types";

// ---------------------------------------------------------------------------
// GET /api/billing/subscriptions
// ---------------------------------------------------------------------------

const SUBSCRIPTION_SORT_FIELDS = ["createdAt", "nextRenewalDate"] as const;
type SubscriptionSortField = (typeof SUBSCRIPTION_SORT_FIELDS)[number];

export const GET = withAuth(async (req, user) => {
  // RBAC: commercial records are founder + support/finance read.
  requireModule(user, "billing");
  const query = parseQuery(req);
  const sp = new URL(req.url).searchParams;

  const where: Prisma.SubscriptionWhereInput = {};

  const statuses = parseEnumListParam(sp.get("status"), SUBSCRIPTION_STATUSES, "status");
  if (statuses) where.status = { in: statuses };

  if (query.clientId) where.clientId = query.clientId;
  if (query.websiteId) where.websiteId = query.websiteId;
  const planId = sp.get("planId");
  if (planId) where.planId = planId;

  const search = query.search ?? (sp.get("q")?.trim() || undefined);
  if (search) {
    where.OR = [
      { planName: { contains: search } },
      { client: { businessName: { contains: search } } },
    ];
  }

  const sortValid = (SUBSCRIPTION_SORT_FIELDS as readonly string[]).includes(query.sort ?? "");
  const sortField = (sortValid ? query.sort : "createdAt") as SubscriptionSortField;
  const dir = sortValid ? query.dir : "desc";

  const orderBy: Prisma.SubscriptionOrderByWithRelationInput[] =
    sortField === "createdAt" ? [{ createdAt: dir }] : [{ nextRenewalDate: dir }, { createdAt: "desc" }];

  const [rows, total] = await Promise.all([
    db.subscription.findMany({
      where,
      include: subscriptionInclude,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.subscription.count({ where }),
  ]);

  const data: Paginated<SubscriptionRecord> = {
    items: rows.map(toSubscriptionRecord),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
  };
  return jsonOk(data);
});

// ---------------------------------------------------------------------------
// POST /api/billing/subscriptions
// ---------------------------------------------------------------------------

const createSubscriptionSchema = z.object({
  clientId: z.string().min(1, "Select a client."),
  websiteId: z.string().min(1).nullish(),
  planId: z.string().min(1).nullish(),
  agreedPriceMinor: positiveMinorAmount().optional(),
  billingInterval: billingIntervalSchema.optional(),
  currency: currencyInput.optional(),
  taxRateBps: z.number().int().min(0).max(10000).optional(),
  startDate: dateInput,
  trialEndDate: dateInput,
  nextRenewalDate: dateInput,
  autoInvoice: z.boolean().default(true),
  autoRenew: z.boolean().default(true),
  status: z.enum(["PENDING", "ACTIVE"]).default("PENDING"),
  internalNotes: z.string().max(2000).nullish(),
});

export const POST = withAuth(async (req, user) => {
  // RBAC: creating subscriptions is founder-only.
  requireFounder(user);
  const body = await parseBody(req, createSubscriptionSchema);
  const settings = await getBillingSettings();

  const client = await db.client.findUnique({ where: { id: body.clientId }, select: { id: true } });
  if (!client) throw new BadRequestError("Client not found.");

  if (body.websiteId) {
    const website = await db.website.findUnique({ where: { id: body.websiteId }, select: { id: true, clientId: true } });
    if (!website) throw new BadRequestError("Website not found.");
    if (website.clientId !== body.clientId) {
      throw new BadRequestError("Website does not belong to the selected client.");
    }
  }

  // Plan snapshot: when a plan is chosen without an explicit price, the plan's
  // price/interval/currency seed the subscription (snapshot — later plan price
  // changes never rewrite an existing subscription).
  let plan: { id: string; name: string; priceMinor: number; billingInterval: string; currency: string } | null = null;
  if (body.planId) {
    const found = await db.servicePlan.findUnique({
      where: { id: body.planId },
      select: { id: true, name: true, priceMinor: true, billingInterval: true, currency: true, isActive: true },
    });
    if (!found) throw new BadRequestError("Service plan not found.");
    plan = found;
  }

  if (!plan && body.agreedPriceMinor === undefined) {
    throw new BadRequestError("Provide a plan or an agreed price for the subscription.");
  }

  const agreedPriceMinor = body.agreedPriceMinor ?? plan!.priceMinor;
  const billingInterval = body.billingInterval ?? plan?.billingInterval ?? "MONTHLY";
  const currency = body.currency ?? plan?.currency ?? "GBP";
  const taxRateBps = body.taxRateBps ?? settings.defaultTaxRateBps;
  const startDate = body.startDate ?? new Date();
  const nextRenewalDate = body.nextRenewalDate ?? addBillingPeriod(startDate, billingInterval);

  const created = await db.subscription.create({
    data: {
      clientId: body.clientId,
      websiteId: body.websiteId ?? null,
      planId: plan?.id ?? null,
      planName: plan?.name ?? null,
      agreedPriceMinor,
      currency,
      billingInterval,
      taxRateBps,
      status: body.status,
      startDate,
      trialEndDate: body.trialEndDate ?? null,
      currentPeriodStart: startDate,
      currentPeriodEnd: nextRenewalDate,
      nextRenewalDate,
      autoInvoice: body.autoInvoice,
      autoRenew: body.autoRenew,
      internalNotes: body.internalNotes ?? null,
    },
    include: subscriptionInclude,
  });

  await db.subscriptionEvent.create({
    data: {
      subscriptionId: created.id,
      kind: "CREATED",
      summary: `Subscription created${plan ? ` on plan ${plan.name}` : ""} — ${label(billingInterval).toLowerCase()} billing, ${label(body.status).toLowerCase()}.`,
      metadata: JSON.stringify({ planId: plan?.id ?? null, priceMinor: agreedPriceMinor, interval: billingInterval }),
      actorId: user.id,
      actorName: user.displayName,
    },
  });

  await logActivity({
    action: "SUBSCRIPTION_CREATED",
    entityType: "SUBSCRIPTION",
    entityId: created.id,
    entityLabel: plan?.name ?? "Subscription",
    summary: `Created ${body.status === "ACTIVE" ? "active" : "pending"} subscription${plan ? ` on plan "${plan.name}"` : ""} for ${created.client.businessName}.`,
    actor: user,
    clientId: created.clientId,
    websiteId: created.websiteId,
    metadata: { planId: plan?.id ?? null, priceMinor: agreedPriceMinor, interval: billingInterval },
  });

  return jsonOk(toSubscriptionRecord(created), { status: 201 });
});
