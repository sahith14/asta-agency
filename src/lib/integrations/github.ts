/**
 * AgencyOS — GitHub integration helpers (Phase 4, server-only).
 *
 * Two capabilities, both real or honestly unavailable:
 * - Repository metadata: GET /repos/{owner}/{repo} with the GITHUB_TOKEN env
 *   (10 s timeout). Without a token the endpoint reports "unavailable" — it
 *   never falls back to unauthenticated guessing.
 * - Signed webhook receipt: HMAC SHA-256 over the RAW body (timing-safe
 *   compare) plus best-effort deployment_status processing that updates
 *   linked Deployment records from real provider events.
 *
 * The token and the webhook secret are NEVER logged or returned. Webhook
 * payloads are never stored — only a short non-secret summary.
 */
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { ApiHttpError, BadRequestError, NotFoundError } from "@/lib/api";
import { sanitiseError } from "@/lib/monitoring/url-guard";
import type { Prisma } from "@prisma/client";

const GITHUB_API_BASE = "https://api.github.com";
const REPO_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Repository metadata
// ---------------------------------------------------------------------------

/** Accepts "owner/name" or a full github.com URL (with optional .git). */
export function parseRepoIdentifier(raw: string): { owner: string; repo: string } | null {
  const value = raw.trim();
  if (!value) return null;

  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
    const [owner, repo] = value.split("/");
    return { owner, repo: repo.replace(/\.git$/, "") };
  }

  try {
    const url = new URL(value);
    if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return null;
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length < 2) return null;
    const [owner, repo] = segments;
    if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return null;
    return { owner, repo: repo.replace(/\.git$/, "") };
  } catch {
    return null;
  }
}

export interface RepoMetadata {
  fullName: string;
  description: string | null;
  defaultBranch: string | null;
  pushedAt: string | null;
  private: boolean;
  htmlUrl: string;
}

/**
 * Fetches public-or-authorised repository metadata. Throws:
 * - BadRequestError when GITHUB_TOKEN is not configured;
 * - NotFoundError for unknown/invisible repositories;
 * - ApiHttpError(502) for upstream/network failures.
 */
export async function fetchRepoMetadata(urlOrFullName: string): Promise<RepoMetadata> {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) {
    throw new BadRequestError("GitHub token is not configured (GITHUB_TOKEN). Repository metadata is unavailable.");
  }

  const parsed = parseRepoIdentifier(urlOrFullName);
  if (!parsed) {
    throw new BadRequestError("Provide a GitHub repository as owner/name or a github.com URL.");
  }

  let response: Response;
  try {
    response = await fetch(`${GITHUB_API_BASE}/repos/${parsed.owner}/${parsed.repo}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "AgencyOS",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(REPO_TIMEOUT_MS),
    });
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (name === "TimeoutError" || name === "AbortError") {
      throw new ApiHttpError(502, "UPSTREAM_ERROR", "GitHub API did not respond within 10 seconds — try again later.");
    }
    throw new ApiHttpError(502, "UPSTREAM_ERROR", "GitHub API could not be reached — check network connectivity and try again.");
  }

  if (response.status === 404) {
    throw new NotFoundError("Repository not found (or the token cannot see it).");
  }
  if (response.status === 401) {
    throw new ApiHttpError(502, "UPSTREAM_ERROR", "GitHub rejected the configured token (HTTP 401) — check GITHUB_TOKEN.");
  }
  if (response.status === 403 || response.status === 429) {
    throw new ApiHttpError(502, "UPSTREAM_ERROR", "GitHub API rate limit reached — try again later.");
  }
  if (!response.ok) {
    throw new ApiHttpError(502, "UPSTREAM_ERROR", `GitHub API returned HTTP ${response.status}.`);
  }

  let data: {
    full_name?: string;
    description?: string | null;
    default_branch?: string | null;
    pushed_at?: string | null;
    private?: boolean;
    html_url?: string;
  };
  try {
    data = (await response.json()) as typeof data;
  } catch {
    throw new ApiHttpError(502, "UPSTREAM_ERROR", "GitHub API returned an unreadable response.");
  }

  return {
    fullName: data.full_name ?? `${parsed.owner}/${parsed.repo}`,
    description: typeof data.description === "string" ? data.description : null,
    defaultBranch: typeof data.default_branch === "string" ? data.default_branch : null,
    pushedAt: typeof data.pushed_at === "string" ? data.pushed_at : null,
    private: data.private === true,
    htmlUrl: typeof data.html_url === "string" ? data.html_url : `https://github.com/${parsed.owner}/${parsed.repo}`,
  };
}

// ---------------------------------------------------------------------------
// Webhook signature + processing
// ---------------------------------------------------------------------------

/** Timing-safe HMAC SHA-256 verification of the RAW request body. */
export function verifyGithubSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const received = signatureHeader.slice("sha256=".length).trim();
  if (!received) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

interface DeploymentStatusPayload {
  deployment_status?: { state?: string; description?: string | null };
  deployment?: { id?: unknown; sha?: unknown };
  repository?: { full_name?: unknown };
}

/** Maps a GitHub deployment_status state to our Deployment status. */
function mapDeploymentState(state: string): string | null {
  switch (state) {
    case "pending":
      return "BUILDING";
    case "in_progress":
      return "DEPLOYING";
    case "success":
      return "SUCCESSFUL";
    case "failure":
    case "error":
      return "FAILED";
    default:
      return null; // unknown state — reported, never guessed
  }
}

/**
 * Best-effort processing of a signed deployment_status delivery: finds the
 * linked Deployment (by deploymentRef, or repositoryRef + commitSha) and
 * updates its status/completedAt/errorSummary from the REAL provider event.
 * Never creates deployments, never invents outcomes.
 */
export async function processDeploymentStatusEvent(payload: DeploymentStatusPayload): Promise<boolean> {
  const state = payload.deployment_status?.state;
  if (typeof state !== "string" || !state) return false;

  const nextStatus = mapDeploymentState(state);
  if (!nextStatus) return false; // unmapped state — nothing honest to write

  const deploymentId =
    payload.deployment?.id !== undefined && payload.deployment?.id !== null ? String(payload.deployment.id) : null;
  const sha = typeof payload.deployment?.sha === "string" ? payload.deployment.sha : null;
  const repoName = typeof payload.repository?.full_name === "string" ? payload.repository.full_name : null;

  const or: Prisma.DeploymentWhereInput[] = [];
  if (deploymentId) or.push({ deploymentRef: deploymentId });
  if (repoName && sha) or.push({ repositoryRef: repoName, commitSha: sha });
  if (or.length === 0) return false; // nothing to match against — skip honestly

  const deployment = await db.deployment.findFirst({
    where: { OR: or },
    orderBy: { startedAt: "desc" },
  });
  if (!deployment) return false;

  const isTerminalOutcome = nextStatus === "SUCCESSFUL" || nextStatus === "FAILED";
  const data: {
    status: string;
    completedAt?: Date;
    errorSummary?: string | null;
  } = { status: nextStatus };
  if (isTerminalOutcome && !deployment.completedAt) data.completedAt = new Date();
  if (nextStatus === "FAILED") {
    const description = payload.deployment_status?.description;
    data.errorSummary = typeof description === "string" && description.trim() ? description.trim().slice(0, 500) : null;
  }

  await db.deployment.update({ where: { id: deployment.id }, data });
  return true;
}

/** Builds the stored payloadSummary (non-secret, no raw payload). */
export function summariseWebhookEvent(event: string, payload: DeploymentStatusPayload & { repository?: { full_name?: unknown } }): string {
  const repoName = typeof payload.repository?.full_name === "string" ? payload.repository.full_name : null;
  if (event === "deployment_status") {
    const state = typeof payload.deployment_status?.state === "string" ? payload.deployment_status.state : "unknown";
    return `deployment_status ${state} for ${repoName ?? "unknown repository"}`;
  }
  return repoName ? `${event} for ${repoName}` : `${event}`;
}

/** Wraps best-effort processing; errors are sanitised for the WebhookEvent row. */
export async function processWebhookEvent(event: string, payload: unknown): Promise<{ processed: boolean; summary: string; error?: string }> {
  const summary = summariseWebhookEvent(event, (payload ?? {}) as DeploymentStatusPayload);
  try {
    if (event === "deployment_status") {
      await processDeploymentStatusEvent((payload ?? {}) as DeploymentStatusPayload);
      return { processed: true, summary };
    }
    // Other events are received and recorded — no handler pretends otherwise.
    return { processed: true, summary };
  } catch (err) {
    return { processed: false, summary, error: sanitiseError(err) };
  }
}
