/**
 * AgencyOS — incident engine (Phase 4, server-only).
 *
 * Turns monitoring transitions into incident records with DEDUPLICATION:
 * - repeated failed checks for a website already covered by an open incident
 *   attach evidence to that incident (new OBSERVATION event + lastObservedAt)
 *   and NEVER create duplicates;
 * - a confirmed recovery (config.recoveryThreshold consecutive successful
 *   checks — enforced by the caller via the health state machine) marks the
 *   website recovered on every open incident covering it;
 * - when ALL websites on an incident have recovered: auto-created incidents
 *   still in early stages are auto-resolved; human-touched incidents stay
 *   open with an explicit note for the owner to resolve.
 *
 * Linked tickets are NEVER closed automatically when an incident resolves —
 * customers may still need individual communication.
 */
import "server-only";
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/billing-num";
import { OPEN_INCIDENT_STATUSES } from "@/lib/types";
import { logActivity } from "@/lib/activity";
import type { Prisma } from "@prisma/client";

export interface CheckEvidence {
  statusCode: number | null;
  durationMs: number | null;
  errorCategory: string | null;
  errorSummary: string | null;
  checkedAt: Date;
}

/** Allocates the next incident number with the same retry strategy as billing numbers. */
async function nextIncidentNumber(tx: Prisma.TransactionClient): Promise<number> {
  const agg = await tx.incident.aggregate({ _max: { number: true } });
  return (agg._max.number ?? 0) + 1;
}

async function findOpenCoverage(websiteId: string) {
  return db.incidentWebsite.findFirst({
    where: {
      websiteId,
      recoveredAt: null,
      incident: { status: { in: [...OPEN_INCIDENT_STATUSES] } },
    },
    include: { incident: { select: { id: true, number: true, title: true, status: true, autoCreated: true } } },
    orderBy: { firstObservedAt: "desc" },
  });
}

/**
 * Called after a check drove the website's health to DOWN. Attaches evidence
 * to the existing open incident covering the website, or creates ONE new
 * auto incident (dedup-safe).
 */
export async function handleOutageTransition(
  websiteId: string,
  websiteName: string,
  evidence: CheckEvidence
): Promise<{ incidentId: string; incidentNumber: number; created: boolean }> {
  const existing = await findOpenCoverage(websiteId);

  if (existing) {
    const detail = evidence.errorSummary
      ? `Latest failed check: ${evidence.errorSummary}`
      : `Latest failed check returned HTTP ${evidence.statusCode ?? "unknown"}.`;
    await db.$transaction([
      db.incidentWebsite.update({
        where: { id: existing.id },
        data: { lastObservedAt: evidence.checkedAt },
      }),
      db.incidentEvent.create({
        data: {
          incidentId: existing.incident.id,
          kind: "OBSERVATION",
          message: `${websiteName} is still down. ${detail}`,
          metadata: JSON.stringify({
            statusCode: evidence.statusCode,
            durationMs: evidence.durationMs,
            errorCategory: evidence.errorCategory,
            observedAt: evidence.checkedAt.toISOString(),
          }),
          actorName: "Monitoring",
        },
      }),
    ]);
    return { incidentId: existing.incident.id, incidentNumber: existing.incident.number, created: false };
  }

  // No open incident covers this website — create one (retry on number races).
  for (let i = 0; i < 5; i++) {
    try {
      const created = await db.$transaction(async (tx) => {
        const number = await nextIncidentNumber(tx);
        const incident = await tx.incident.create({
          data: {
            number,
            title: `Website down: ${websiteName}`,
            description: evidence.errorSummary
              ? `Monitoring detected that ${websiteName} is unreachable. ${evidence.errorSummary}`
              : `Monitoring detected that ${websiteName} is unreachable.`,
            severity: "SEV3",
            status: "DETECTED",
            detectionSource: "MONITORING",
            detectedAt: evidence.checkedAt,
            autoCreated: true,
          },
        });
        await tx.incidentWebsite.create({
          data: {
            incidentId: incident.id,
            websiteId,
            firstObservedAt: evidence.checkedAt,
            lastObservedAt: evidence.checkedAt,
          },
        });
        await tx.incidentEvent.create({
          data: {
            incidentId: incident.id,
            kind: "CREATED",
            message: `Outage detected by monitoring: ${evidence.errorSummary ?? `HTTP ${evidence.statusCode ?? "unknown"}`}.`,
            metadata: JSON.stringify({
              statusCode: evidence.statusCode,
              durationMs: evidence.durationMs,
              errorCategory: evidence.errorCategory,
            }),
            actorName: "Monitoring",
          },
        });
        return incident;
      });

      await logActivity({
        action: "INCIDENT_CREATED",
        entityType: "INCIDENT",
        entityId: created.id,
        entityLabel: `INC-${String(created.number).padStart(4, "0")}`,
        summary: `Incident INC-${String(created.number).padStart(4, "0")} auto-created — ${websiteName} is down (${evidence.errorCategory ?? "unknown"}).`,
        websiteId,
      });
      return { incidentId: created.id, incidentNumber: created.number, created: true };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Number race lost — re-check coverage and retry.
    }
  }
  throw new Error("Could not allocate a unique incident number.");
}

/**
 * Called when recovery is CONFIRMED (recoveryThreshold consecutive successful
 * checks — the health state machine already verified this). Marks the website
 * recovered on every open incident covering it; auto-resolves untouched
 * auto-created incidents when all their websites have recovered.
 */
export async function handleRecoveryConfirmed(
  websiteId: string,
  websiteName: string,
  evidence: CheckEvidence
): Promise<void> {
  const coverages = await db.incidentWebsite.findMany({
    where: {
      websiteId,
      recoveredAt: null,
      incident: { status: { in: [...OPEN_INCIDENT_STATUSES] } },
    },
    include: {
      incident: {
        select: {
          id: true,
          number: true,
          status: true,
          autoCreated: true,
          websites: { select: { id: true, recoveredAt: true } },
        },
      },
    },
  });

  for (const coverage of coverages) {
    const incident = coverage.incident;
    const now = evidence.checkedAt;

    // Does this incident still have OTHER unrecovered websites?
    const othersUnrecovered = incident.websites.some((w) => w.id !== coverage.id && !w.recoveredAt);

    await db.$transaction([
      db.incidentWebsite.update({
        where: { id: coverage.id },
        data: { recoveredAt: now },
      }),
      db.incidentEvent.create({
        data: {
          incidentId: incident.id,
          kind: "RECOVERY",
          message: othersUnrecovered
            ? `${websiteName} recovered (confirmed by monitoring). Other affected websites are still being monitored.`
            : `${websiteName} recovered (confirmed by monitoring).`,
          metadata: JSON.stringify({
            statusCode: evidence.statusCode,
            durationMs: evidence.durationMs,
            confirmedAt: now.toISOString(),
          }),
          actorName: "Monitoring",
        },
      }),
    ]);

    if (othersUnrecovered) continue;

    // All websites recovered.
    if (incident.autoCreated && (incident.status === "DETECTED" || incident.status === "INVESTIGATING")) {
      const display = `INC-${String(incident.number).padStart(4, "0")}`;
      await db.$transaction([
        db.incident.update({
          where: { id: incident.id },
          data: {
            status: "RESOLVED",
            resolvedAt: now,
            recoveryVerifiedAt: now,
            resolution: "Auto-resolved: every affected website recovered and the recovery was confirmed by monitoring.",
          },
        }),
        db.incidentEvent.create({
          data: {
            incidentId: incident.id,
            kind: "STATUS_CHANGED",
            message: "All affected websites recovered — incident auto-resolved by monitoring.",
            actorName: "Monitoring",
          },
        }),
      ]);
      await logActivity({
        action: "INCIDENT_RESOLVED",
        entityType: "INCIDENT",
        entityId: incident.id,
        entityLabel: display,
        summary: `Incident ${display} auto-resolved — ${websiteName} recovered (confirmed by monitoring).`,
        websiteId,
      });
    } else {
      await db.incidentEvent.create({
        data: {
          incidentId: incident.id,
          kind: "NOTE",
          message: "All affected websites have recovered. Review and resolve this incident when you are confident the fix is complete.",
          actorName: "Monitoring",
        },
      });
    }
  }
}
