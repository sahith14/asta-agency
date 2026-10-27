/**
 * AgencyOS — Shared incident record mapping + numbering for the incidents API
 * routes (colocated helper, not a route).
 *
 * Incident numbers use max+1 with P2002 retry (same strategy as billing and
 * ticket numbers — SQLite has no sequences). The helper is local to Phase 4
 * routes; the monitoring incident engine has its own (frozen) copy.
 */
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/billing-num";
import type { Incident, IncidentEvent, IncidentWebsite } from "@prisma/client";
import type {
  HealthCheckRecord,
  IncidentEventRecord,
  IncidentRecord,
  IncidentWebsiteRecord,
} from "@/lib/types";

/** Allocates the next incident number (max+1) and retries on unique races. */
export async function createIncidentWithNumber<T>(
  create: (number: number) => Promise<T>
): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const agg = await db.incident.aggregate({ _max: { number: true } });
    const number = (agg._max.number ?? 0) + 1;
    try {
      return await create(number);
    } catch (err) {
      if (isUniqueViolation(err)) {
        lastError = err;
        continue; // number lost the race — recompute and try again
      }
      throw err;
    }
  }
  throw lastError ?? new Error("Could not allocate a unique incident number.");
}

/** INC-0001 style display number. */
export function incidentDisplayNumber(number: number): string {
  return `INC-${String(number).padStart(4, "0")}`;
}

/** TKT-0001 style display number. */
export function ticketDisplayNumber(number: number): string {
  return `TKT-${String(number).padStart(4, "0")}`;
}

type WebsiteRow = {
  id: string;
  name: string;
  client?: { businessName: string } | null;
};

export type IncidentWebsiteWithWebsite = IncidentWebsite & { website: WebsiteRow };

export function toIncidentWebsiteRecord(row: IncidentWebsiteWithWebsite): IncidentWebsiteRecord {
  return {
    id: row.id,
    incidentId: row.incidentId,
    websiteId: row.websiteId,
    firstObservedAt: row.firstObservedAt.toISOString(),
    lastObservedAt: row.lastObservedAt ? row.lastObservedAt.toISOString() : null,
    recoveredAt: row.recoveredAt ? row.recoveredAt.toISOString() : null,
    website: { id: row.website.id, name: row.website.name, clientName: row.website.client?.businessName ?? null },
  };
}

type IncidentRow = Incident & {
  assignedTo?: { id: string; displayName: string } | null;
  createdBy?: { id: string; displayName: string } | null;
  websites?: IncidentWebsiteWithWebsite[];
  tickets?: { id: string; number: number; subject: string; status: string }[];
  _count?: { tickets: number; events: number };
};

export function toIncidentRecord(row: IncidentRow): IncidentRecord {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    description: row.description,
    severity: row.severity,
    status: row.status,
    detectionSource: row.detectionSource,
    detectedAt: row.detectedAt.toISOString(),
    assignedToId: row.assignedToId,
    diagnosis: row.diagnosis,
    mitigation: row.mitigation,
    resolution: row.resolution,
    recoveryVerifiedAt: row.recoveryVerifiedAt ? row.recoveryVerifiedAt.toISOString() : null,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    autoCreated: row.autoCreated,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    assignedTo: row.assignedTo ? { id: row.assignedTo.id, displayName: row.assignedTo.displayName } : null,
    createdBy: row.createdBy ? { id: row.createdBy.id, displayName: row.createdBy.displayName } : null,
    websites: row.websites ? row.websites.map((w) => toIncidentWebsiteRecord(w)) : undefined,
    tickets: row.tickets ?? undefined,
    _count: row._count ?? undefined,
  };
}

export function toIncidentEventRecord(row: IncidentEvent): IncidentEventRecord {
  return {
    id: row.id,
    incidentId: row.incidentId,
    kind: row.kind,
    message: row.message,
    metadata: row.metadata,
    actorId: row.actorId,
    actorName: row.actorName,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toHealthCheckLite(row: {
  id: string;
  websiteId: string;
  checkedAt: Date;
  success: boolean;
  statusCode: number | null;
  durationMs: number | null;
  slow: boolean;
  trigger: string;
  errorCategory: string | null;
  errorSummary: string | null;
  website?: { id: string; name: string; client?: { businessName: string } | null } | null;
}): HealthCheckRecord {
  return {
    id: row.id,
    websiteId: row.websiteId,
    checkedAt: row.checkedAt.toISOString(),
    success: row.success,
    statusCode: row.statusCode,
    durationMs: row.durationMs,
    slow: row.slow,
    trigger: row.trigger,
    errorCategory: row.errorCategory,
    errorSummary: row.errorSummary,
    website: row.website
      ? { id: row.website.id, name: row.website.name, clientName: row.website.client?.businessName ?? null }
      : null,
  };
}

/** Shared include for list/detail so every route returns the same shape. */
export const incidentInclude = {
  assignedTo: { select: { id: true, displayName: true } },
  createdBy: { select: { id: true, displayName: true } },
  websites: { include: { website: { select: { id: true, name: true, client: { select: { businessName: true } } } } } },
  tickets: { select: { id: true, number: true, subject: true, status: true }, orderBy: { lastActivityAt: "desc" as const } },
  _count: { select: { tickets: true, events: true } },
} as const;
