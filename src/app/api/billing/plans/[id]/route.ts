/**
 * AgencyOS — Billing service plan detail API (Phase 3).
 * GET    /api/billing/plans/[id] → ServicePlanRecord
 * PATCH  /api/billing/plans/[id] → editable catalogue fields (isActive=false = deactivate)
 * DELETE /api/billing/plans/[id] → hard delete ONLY when no subscription uses the plan
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { ConflictError, NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { requireModule, requireFounder } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { planInclude, toServicePlanRecord } from "@/lib/billing/record";
import { billingIntervalSchema, currencyInput, minorAmount } from "@/lib/billing/validate";

const patchPlanSchema = z.object({
  name: z.string().trim().min(1, "Plan name is required.").max(100).optional(),
  description: z.string().max(2000).nullish(),
  billingInterval: billingIntervalSchema.optional(),
  priceMinor: minorAmount().optional(),
  currency: currencyInput.optional(),
  allowanceHours: z.number().int().min(0).max(10000).nullish(),
  includedServices: z
    .array(z.string().trim().min(1).max(120))
    .max(20, "A plan can list at most 20 included services.")
    .optional(),
  terms: z.string().max(2000).nullish(),
  autoRenew: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// GET /api/billing/plans/[id]
// ---------------------------------------------------------------------------

export const GET = withAuth(async (_req, user, { params }) => {
  // RBAC: plan catalogue read is founder + support/finance.
  requireModule(user, "billing");
  const { id } = await params;
  const plan = await db.servicePlan.findUnique({ where: { id }, include: planInclude });
  if (!plan) throw new NotFoundError("Service plan not found.");
  return jsonOk(toServicePlanRecord(plan));
});

// ---------------------------------------------------------------------------
// PATCH /api/billing/plans/[id]
// ---------------------------------------------------------------------------

export const PATCH = withAuth(async (req, user, { params }) => {
  // RBAC: editing plans is founder-only.
  requireFounder(user);
  const { id } = await params;
  const body = await parseBody(req, patchPlanSchema);

  const existing = await db.servicePlan.findUnique({ where: { id }, include: planInclude });
  if (!existing) throw new NotFoundError("Service plan not found.");

  const data = {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.description !== undefined ? { description: body.description ?? null } : {}),
    ...(body.billingInterval !== undefined ? { billingInterval: body.billingInterval } : {}),
    ...(body.priceMinor !== undefined ? { priceMinor: body.priceMinor } : {}),
    ...(body.currency !== undefined ? { currency: body.currency } : {}),
    ...(body.allowanceHours !== undefined ? { allowanceHours: body.allowanceHours ?? null } : {}),
    ...(body.includedServices !== undefined ? { includedServices: JSON.stringify(body.includedServices) } : {}),
    ...(body.terms !== undefined ? { terms: body.terms ?? null } : {}),
    ...(body.autoRenew !== undefined ? { autoRenew: body.autoRenew } : {}),
    ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
  };

  const updated = await db.servicePlan.update({ where: { id }, data, include: planInclude });

  await logActivity({
    action: "SERVICE_PLAN_UPDATED",
    entityType: "SERVICE_PLAN",
    entityId: updated.id,
    entityLabel: updated.name,
    summary:
      body.isActive === false && existing.isActive
        ? `Deactivated service plan "${updated.name}" (kept for historical subscriptions).`
        : body.isActive === true && !existing.isActive
          ? `Reactivated service plan "${updated.name}".`
          : `Updated service plan "${updated.name}".`,
    actor: user,
    metadata: { fields: Object.keys(data) },
  });

  return jsonOk(toServicePlanRecord(updated));
});

// ---------------------------------------------------------------------------
// DELETE /api/billing/plans/[id] — only when unused by subscriptions
// ---------------------------------------------------------------------------

export const DELETE = withAuth(async (req, user, { params }) => {
  // RBAC: deleting plans is founder-only.
  requireFounder(user);
  const { id } = await params;
  const existing = await db.servicePlan.findUnique({
    where: { id },
    include: { ...planInclude },
  });
  if (!existing) throw new NotFoundError("Service plan not found.");

  const subscriptionCount = existing._count.subscriptions;
  if (subscriptionCount > 0) {
    throw new ConflictError(
      `Plan is used by ${subscriptionCount} subscription${subscriptionCount === 1 ? "" : "s"} — deactivate it instead.`
    );
  }

  await db.servicePlan.delete({ where: { id } });

  await logActivity({
    action: "SERVICE_PLAN_DELETED",
    entityType: "SERVICE_PLAN",
    entityId: null,
    entityLabel: existing.name,
    summary: `Deleted unused service plan "${existing.name}".`,
    actor: user,
  });

  return jsonOk({ deleted: true, id });
});
