/**
 * AgencyOS — Billing settings API (Phase 3).
 * GET /api/billing/settings → merged BillingSettingsRecord (defaults + stored)
 * PUT /api/billing/settings → validated partial update (audit-logged,
 *      rate-limited). Stored under Setting key "billing".
 */
import { z } from "zod";
import { BadRequestError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { requireFounder } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { rateLimit } from "@/lib/rate-limit";
import {
  getBillingSettings,
  saveBillingSettings,
} from "@/lib/billing/settings";
import type { BillingSettingsRecord } from "@/lib/types";

function toRecord(settings: Awaited<ReturnType<typeof getBillingSettings>>): BillingSettingsRecord {
  return { ...settings };
}

// ---------------------------------------------------------------------------
// GET /api/billing/settings
// ---------------------------------------------------------------------------

export const GET = withAuth(async (_req, user) => {
  // RBAC: financial settings are founder-only.
  requireFounder(user);
  return jsonOk(toRecord(await getBillingSettings()));
});

// ---------------------------------------------------------------------------
// PUT /api/billing/settings
// ---------------------------------------------------------------------------

const putSchema = z.object({
  businessName: z.string().trim().max(200).optional(),
  businessAddress: z.string().max(2000).optional(),
  businessEmail: z.string().trim().max(200).optional(),
  businessPhone: z.string().trim().max(100).optional(),
  vatNumber: z.string().trim().max(100).optional(),
  invoicePrefix: z.string().trim().max(8, "Prefix must be at most 8 characters.").optional(),
  quotePrefix: z.string().trim().max(8, "Prefix must be at most 8 characters.").optional(),
  paymentRefPrefix: z.string().trim().max(8, "Prefix must be at most 8 characters.").optional(),
  defaultTaxRateBps: z.number().int().min(0).max(10000).optional(),
  taxInclusiveDefault: z.boolean().optional(),
  defaultPaymentTermsDays: z.number().int().min(0).max(120).optional(),
  defaultQuoteExpiryDays: z.number().int().min(0).max(120).optional(),
  defaultInvoiceTerms: z.string().max(2000).optional(),
  defaultQuoteTerms: z.string().max(2000).optional(),
  defaultInvoiceNotes: z.string().max(2000).optional(),
});

export const PUT = withAuth(async (req, user) => {
  // RBAC: financial settings are founder-only.
  requireFounder(user);
  const limit = rateLimit("billing-settings", 20, 60_000);
  if (!limit.ok) {
    throw new BadRequestError(`Too many settings updates — try again in ${limit.retryAfterSeconds}s.`);
  }

  const body = await parseBody(req, putSchema);
  if (Object.keys(body).length === 0) {
    throw new BadRequestError("No settings fields provided.");
  }

  const saved = await saveBillingSettings(body);

  await logActivity({
    action: "BILLING_SETTINGS_UPDATED",
    kind: "AUDIT",
    entityType: "BILLING_SETTINGS",
    entityId: "billing",
    entityLabel: "Billing settings",
    summary: `Updated billing settings (${Object.keys(body).join(", ")}).`,
    actor: user,
    metadata: { fields: Object.keys(body) },
  });

  return jsonOk(toRecord(saved));
});
