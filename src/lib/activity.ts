/**
 * AgencyOS — Activity timeline + audit logging.
 * One durable stream; sensitive values must never be passed in metadata.
 */
import "server-only";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";

type EntityType =
  | "CLIENT"
  | "CONTACT"
  | "WEBSITE"
  | "PROJECT"
  | "MILESTONE"
  | "TASK"
  | "DOCUMENT"
  | "SETTINGS"
  | "AUTH"
  | "SAMPLE_DATA"
  | "TICKET" // Phase 2 — support tickets
  | "EMAIL" // Phase 2 — email messages (inbox/matching)
  | "EMAIL_ACCOUNT" // Phase 2 — mailbox connection lifecycle
  | "SERVICE_PLAN" // Phase 3 — billing catalogue
  | "QUOTE" // Phase 3 — quotes
  | "INVOICE" // Phase 3 — invoices
  | "PAYMENT" // Phase 3 — payments
  | "SUBSCRIPTION" // Phase 3 — recurring subscriptions
  | "BILLING_SETTINGS" // Phase 3 — billing configuration changes
  | "INCIDENT" // Phase 4 — operational incidents
  | "MONITOR_CONFIG" // Phase 4 — website monitoring configuration
  | "MAINTENANCE_SCHEDULE" // Phase 4 — maintenance schedules
  | "MAINTENANCE_RUN" // Phase 4 — maintenance runs
  | "DEPLOYMENT" // Phase 4 — deployment records
  | "PROVIDER_CONNECTION" // Phase 4 — integration connections
  | "BRIEF" // Phase 5 — client demo briefs
  | "MEETING" // Phase 5 — meetings
  | "USER" // Phase 5 — staff accounts / role changes
  | "NOTIFICATION"; // Phase 5 — in-app notifications

export interface LogActivityInput {
  action: string;
  entityType: EntityType;
  entityId?: string | null;
  entityLabel?: string | null;
  summary: string;
  actor?: SessionUser | null;
  metadata?: Record<string, unknown> | null;
  clientId?: string | null;
  websiteId?: string | null;
  projectId?: string | null;
  kind?: "ACTIVITY" | "AUDIT";
}

export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    await db.activity.create({
      data: {
        kind: input.kind ?? "ACTIVITY",
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        entityLabel: input.entityLabel ?? null,
        summary: input.summary,
        actorId: input.actor?.id ?? null,
        actorName: input.actor?.displayName ?? "System",
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        clientId: input.clientId ?? null,
        websiteId: input.websiteId ?? null,
        projectId: input.projectId ?? null,
      },
    });
  } catch (err) {
    // Never let logging break a business operation; surface in server logs.
    console.error("[activity] Failed to record activity:", input.action, err);
  }
}
