/**
 * AgencyOS — Billing service plans API (Phase 3).
 * GET  /api/billing/plans → Paginated<ServicePlanRecord> (isActive desc, name asc)
 * POST /api/billing/plans → ServicePlanRecord (catalogue create)
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonOk, parseBody, withAuth } from "@/lib/api";
import { requireModule, requireFounder } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { toServicePlanRecord, planInclude } from "@/lib/billing/record";
import { billingIntervalSchema, currencyInput, minorAmount } from "@/lib/billing/validate";
import type { Paginated, ServicePlanRecord } from "@/lib/types";

// ---------------------------------------------------------------------------
// GET /api/billing/plans
// ---------------------------------------------------------------------------

export const GET = withAuth(async (_req, user) => {
  // RBAC: plan catalogue read is founder + support/finance.
  requireModule(user, "billing");
  const plans = await db.servicePlan.findMany({
    include: planInclude,
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
  const items: ServicePlanRecord[] = plans.map(toServicePlanRecord);
  // Paginated envelope for consistency with every other list endpoint
  // (the full catalogue is always returned — no real pagination needed).
  const data: Paginated<ServicePlanRecord> = {
    items,
    total: items.length,
    page: 1,
    pageSize: Math.max(items.length, 1),
    pageCount: 1,
  };
  return jsonOk(data);
});

// ---------------------------------------------------------------------------
// POST /api/billing/plans
// ---------------------------------------------------------------------------

const includedServicesSchema = z
  .array(z.string().trim().min(1).max(120, "Each service must be at most 120 characters."))
  .max(20, "A plan can list at most 20 included services.")
  .default([]);

const createPlanSchema = z.object({
  name: z.string().trim().min(1, "Plan name is required.").max(100, "Plan name must be at most 100 characters."),
  description: z.string().max(2000).nullish(),
  billingInterval: billingIntervalSchema.default("MONTHLY"),
  priceMinor: minorAmount(),
  currency: currencyInput.default("GBP"),
  allowanceHours: z.number().int().min(0).max(10000).nullish(),
  includedServices: includedServicesSchema,
  terms: z.string().max(2000).nullish(),
  autoRenew: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

export const POST = withAuth(async (req, user) => {
  // RBAC: creating service plans is founder-only.
  requireFounder(user);
  const body = await parseBody(req, createPlanSchema);

  const created = await db.servicePlan.create({
    data: {
      name: body.name,
      description: body.description ?? null,
      billingInterval: body.billingInterval,
      priceMinor: body.priceMinor,
      currency: body.currency,
      allowanceHours: body.allowanceHours ?? null,
      includedServices: JSON.stringify(body.includedServices),
      terms: body.terms ?? null,
      autoRenew: body.autoRenew,
      isActive: body.isActive,
    },
    include: planInclude,
  });

  await logActivity({
    action: "SERVICE_PLAN_CREATED",
    entityType: "SERVICE_PLAN",
    entityId: created.id,
    entityLabel: created.name,
    summary: `Created service plan "${created.name}".`,
    actor: user,
    metadata: { billingInterval: created.billingInterval, isActive: created.isActive },
  });

  return jsonOk(toServicePlanRecord(created), { status: 201 });
});
