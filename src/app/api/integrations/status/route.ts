/**
 * AgencyOS — Integrations status API (Phase 4).
 * GET /api/integrations/status → IntegrationsStatusData
 * Honest capability reporting: env presence for GitHub token/webhook secret,
 * stored provider connections (config NEVER returned), recent webhook events,
 * and the real provider support matrix (nothing is fully implemented yet).
 */
import { db } from "@/lib/db";
import { jsonOk, withAuth } from "@/lib/api";
import { requireFounder } from "@/lib/rbac";
import { getProviderSupport } from "@/lib/integrations/provider";
import type { IntegrationsStatusData } from "@/lib/types";
import { toConnectionRecord, toWebhookEventRecord } from "../record";

export const GET = withAuth(async (_req, user) => {
  // RBAC: only the founder manages integrations.
  requireFounder(user);
  const tokenConfigured = Boolean(process.env.GITHUB_TOKEN?.trim());
  const webhookSecretConfigured = Boolean(process.env.GITHUB_WEBHOOK_SECRET?.trim());

  const messages: string[] = [];
  if (!tokenConfigured) messages.push("Set GITHUB_TOKEN to read repository metadata.");
  if (!webhookSecretConfigured) messages.push("Set GITHUB_WEBHOOK_SECRET to enable signed webhook delivery.");

  const [connections, webhookEvents] = await Promise.all([
    db.providerConnection.findMany({ orderBy: { createdAt: "asc" } }),
    db.webhookEvent.findMany({ orderBy: { receivedAt: "desc" }, take: 10 }),
  ]);

  const data: IntegrationsStatusData = {
    github: {
      tokenConfigured,
      webhookSecretConfigured,
      message: messages.length > 0 ? messages.join(" ") : "GitHub token and webhook secret are configured.",
    },
    connections: connections.map(toConnectionRecord),
    recentWebhookEvents: webhookEvents.map(toWebhookEventRecord),
    providerSupport: getProviderSupport(),
  };
  return jsonOk(data);
});
