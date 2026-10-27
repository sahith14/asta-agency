/**
 * AgencyOS — Billing summary API (Phase 3).
 * GET /api/billing/summary → BillingSummaryData. Every figure is a real query;
 * the `definitions` array documents each formula (see src/lib/billing/summary.ts).
 */
import { jsonOk, withAuth } from "@/lib/api";
import { requireModule } from "@/lib/rbac";
import { getBillingSummary } from "@/lib/billing/summary";

export const GET = withAuth(async (_req, user) => {
  // RBAC: financials are founder + support/finance only (managers/developers denied).
  requireModule(user, "billing");
  return jsonOk(await getBillingSummary());
});
