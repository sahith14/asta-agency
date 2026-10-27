/**
 * AgencyOS — Payment gateway status (Phase 3).
 * GET /api/billing/gateway/status → GatewayStatusData (honest: manual
 * recording only in this build; online collection is never simulated).
 */
import { jsonOk, withAuth } from "@/lib/api";
import { requireFounder } from "@/lib/rbac";
import { getGatewayStatus } from "@/lib/billing/gateway";

export const GET = withAuth(async (_req, user) => {
  // RBAC: gateway configuration visibility is founder-only.
  requireFounder(user);
  return jsonOk(getGatewayStatus());
});
