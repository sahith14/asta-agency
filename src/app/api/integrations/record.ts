/**
 * AgencyOS — Shared integration record mapping for the integrations API routes
 * (colocated helper, not a route).
 *
 * SECURITY: ProviderConnectionRecord NEVER includes `config` (the encrypted
 * secret envelope) — no code path may add it.
 */
import type { ProviderConnection, WebhookEvent } from "@prisma/client";
import type { ProviderConnectionRecord, WebhookEventRecord } from "@/lib/types";

export function toConnectionRecord(row: ProviderConnection): ProviderConnectionRecord {
  let metadata: Record<string, unknown> | null = null;
  if (row.metadata) {
    try {
      const parsed: unknown = JSON.parse(row.metadata);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) metadata = parsed as Record<string, unknown>;
    } catch {
      metadata = null;
    }
  }
  return {
    id: row.id,
    provider: row.provider,
    name: row.name,
    status: row.status,
    metadata,
    lastCheckedAt: row.lastCheckedAt ? row.lastCheckedAt.toISOString() : null,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    // NOTE: row.config is intentionally omitted — never return the secret.
  };
}

export function toWebhookEventRecord(row: WebhookEvent): WebhookEventRecord {
  return {
    id: row.id,
    provider: row.provider,
    eventId: row.eventId,
    eventType: row.eventType,
    status: row.status,
    payloadSummary: row.payloadSummary,
    error: row.error,
    receivedAt: row.receivedAt.toISOString(),
    processedAt: row.processedAt ? row.processedAt.toISOString() : null,
  };
}
