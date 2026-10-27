/**
 * AgencyOS — Shared deployment record mapping for the deployments API routes
 * (colocated helper, not a route).
 */
import { z } from "zod";
import type { Deployment } from "@prisma/client";
import type { DeploymentRecord } from "@/lib/types";

type WebsiteRow = { id: string; name: string; client?: { businessName: string } | null };

type DeploymentRow = Deployment & {
  website?: WebsiteRow | null;
  project?: { id: string; name: string } | null;
  initiatedBy?: { id: string; displayName: string } | null;
  rollbackOf?: { id: string } | null;
};

/** "DEP-" + short id — deployments have no human number sequence. */
function deploymentDisplayRef(id: string): string {
  return `DEP-${id.slice(0, 8)}`;
}

export function toDeploymentRecord(row: DeploymentRow): DeploymentRecord {
  return {
    id: row.id,
    websiteId: row.websiteId,
    projectId: row.projectId,
    environment: row.environment,
    provider: row.provider,
    repositoryRef: row.repositoryRef,
    commitSha: row.commitSha,
    deploymentRef: row.deploymentRef,
    initiatedById: row.initiatedById,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    status: row.status,
    buildUrl: row.buildUrl,
    errorSummary: row.errorSummary,
    postDeploymentHealth: row.postDeploymentHealth,
    postDeploymentNote: row.postDeploymentNote,
    rollbackOfId: row.rollbackOfId,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    website: row.website
      ? { id: row.website.id, name: row.website.name, clientName: row.website.client?.businessName ?? null }
      : null,
    project: row.project ? { id: row.project.id, name: row.project.name } : null,
    initiatedBy: row.initiatedBy ? { id: row.initiatedBy.id, displayName: row.initiatedBy.displayName } : null,
    rollbackOf: row.rollbackOf ? { id: row.rollbackOf.id, displayRef: deploymentDisplayRef(row.rollbackOf.id) } : null,
  };
}

export const deploymentInclude = {
  website: { select: { id: true, name: true, client: { select: { businessName: true } } } },
  project: { select: { id: true, name: true } },
  initiatedBy: { select: { id: true, displayName: true } },
  rollbackOf: { select: { id: true } },
} as const;

/** Commit SHA: 7..40 hex characters, or an empty string (→ null downstream). */
export const commitShaSchema = z
  .string()
  .max(40)
  .refine((v) => v === "" || /^[0-9a-fA-F]{7,40}$/.test(v), "Commit SHA must be 7-40 hex characters.");

/** Normalises an optional sha: undefined → undefined, ""/null → null, trimmed otherwise. */
export function normaliseCommitSha(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
