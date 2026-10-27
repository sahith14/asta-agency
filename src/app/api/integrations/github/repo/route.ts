/**
 * AgencyOS — GitHub repository metadata API (Phase 4).
 * GET /api/integrations/github/repo?url=owner/name-or-full-url
 * Requires GITHUB_TOKEN (400 without it — honest "unavailable"); proxies one
 * GET /repos/{owner}/{repo} call server-side. The token is never logged and
 * never sent to the client.
 */
import type { NextRequest } from "next/server";
import { BadRequestError, jsonOk, withAuth } from "@/lib/api";
import { requireFounder } from "@/lib/rbac";
import { fetchRepoMetadata } from "@/lib/integrations/github";

export const GET = withAuth(async (req: NextRequest, user) => {
  // RBAC: only the founder manages integrations.
  requireFounder(user);
  const url = new URL(req.url).searchParams.get("url")?.trim() || "";
  if (!url) {
    throw new BadRequestError("Provide a repository as ?url=owner/name or a github.com URL.");
  }

  const repo = await fetchRepoMetadata(url);
  return jsonOk(repo);
});
