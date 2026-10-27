/**
 * AgencyOS — Gmail OAuth start (Task 2-b).
 * GET /api/gmail/oauth/start → 302 to Google's consent screen with a
 * cryptographically random state bound to an httpOnly cookie (10 min TTL,
 * path /api/gmail so only Gmail routes receive it).
 */
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { BadRequestError, jsonError, withAuth } from "@/lib/api";
import { requireFounder } from "@/lib/rbac";
import { logActivity, type LogActivityInput } from "@/lib/activity";
import { rateLimit } from "@/lib/rate-limit";
import {
  buildAuthorizeUrl,
  getOAuthConfig,
  OAUTH_STATE_COOKIE,
  resolveRedirectUri,
} from "@/lib/gmail/oauth";

const STATE_TTL_SECONDS = 600;

export const GET = withAuth(async (req, user) => {
  // RBAC: the founder's mailbox connection — founder-only.
  requireFounder(user);
  if (!getOAuthConfig().configured) {
    throw new BadRequestError(
      "Gmail is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the environment first."
    );
  }

  const limit = rateLimit(`gmail-oauth-start:${user.id}`, 5, 60_000);
  if (!limit.ok) {
    return jsonError("RATE_LIMITED", "Too many attempts. Try again shortly.", 429);
  }

  const state = randomBytes(32).toString("base64url");
  const authorizeUrl = buildAuthorizeUrl({ state, redirectUri: resolveRedirectUri(req) });

  await logActivity({
    action: "GMAIL_OAUTH_STARTED",
    // "EMAIL_ACCOUNT" belongs to the Phase 2 EntityType extension; the union
    // in activity.ts is owned outside this task's file list, hence the cast
    // (no runtime difference — the column is a plain string).
    entityType: "EMAIL_ACCOUNT" as unknown as LogActivityInput["entityType"],
    summary: "Started Gmail OAuth authorisation.",
    actor: user,
    kind: "AUDIT",
  });

  const res = NextResponse.redirect(authorizeUrl, 302);
  res.cookies.set({
    name: OAUTH_STATE_COOKIE,
    value: state,
    httpOnly: true, // not readable from JS — blocks state exfiltration via XSS
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: "/api/gmail", // only sent to /api/gmail/oauth/callback
    maxAge: STATE_TTL_SECONDS,
  });
  return res;
});
