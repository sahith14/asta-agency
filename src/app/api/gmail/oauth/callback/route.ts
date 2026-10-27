/**
 * AgencyOS — Gmail OAuth callback (Task 2-b).
 *
 * Deliberately NOT wrapped in withAuth: Google redirects the browser here, so
 * an unauthenticated hit must land back on the SPA with an error reason
 * instead of a JSON 401. The session is validated manually with getSessionUser.
 *
 * Security:
 * - query `state` is compared against the httpOnly cookie with
 *   timingSafeEqual (CSRF protection for the code flow);
 * - the authorisation code is exchanged once and never logged or persisted;
 * - failures redirect to /?oauth=error&reason=<short> and log short reasons
 *   only — never codes, tokens or secrets.
 *
 * historyId is intentionally left NULL on connect: the first sync then runs
 * as an INITIAL full INBOX import instead of starting at the connect point.
 */
import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { isFounder } from "@/lib/rbac";
import { logActivity, type LogActivityInput } from "@/lib/activity";
import { encryptSecret } from "@/lib/secret-box";
import {
  exchangeCodeForTokens,
  fetchUserInfo,
  OAUTH_STATE_COOKIE,
  resolveRedirectUri,
} from "@/lib/gmail/oauth";

function redirectWith(origin: string, params: Record<string, string>): NextResponse {
  const url = new URL("/", origin);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url, 302);
}

function clearStateCookie(res: NextResponse): NextResponse {
  res.cookies.set({
    name: OAUTH_STATE_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    path: "/api/gmail",
    maxAge: 0,
  });
  return res;
}

function redirectWithError(origin: string, reason: string): NextResponse {
  return clearStateCookie(redirectWith(origin, { oauth: "error", reason }));
}

/** Constant-time state comparison (length mismatch short-circuits first). */
function statesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const origin = req.nextUrl.origin;

  const sessionUser = await getSessionUser().catch(() => null);
  if (!sessionUser) {
    return redirectWithError(origin, "auth_required");
  }
  // RBAC: the founder's mailbox connection — non-founders bounce back with the
  // "sign in as the agency owner" reason.
  if (!isFounder(sessionUser)) {
    return redirectWithError(origin, "auth_required");
  }

  const query = req.nextUrl.searchParams;

  // Google surfaced an OAuth error (access_denied etc.).
  const oauthError = query.get("error");
  if (oauthError) {
    console.log(`[gmail] OAuth callback: user denied access (${oauthError.slice(0, 40)})`);
    return redirectWithError(origin, "denied");
  }

  // State must match the cookie exactly (and exist at all).
  const queryState = query.get("state");
  const cookieState = req.cookies.get(OAUTH_STATE_COOKIE)?.value;
  if (!queryState || !cookieState || !statesMatch(queryState, cookieState)) {
    console.log("[gmail] OAuth callback: state mismatch — rejecting");
    return redirectWithError(origin, "state_mismatch");
  }

  const code = query.get("code");
  if (!code) {
    return redirectWithError(origin, "missing_code");
  }

  try {
    const tokens = await exchangeCodeForTokens({ code, redirectUri: resolveRedirectUri(req) });
    const userInfo = await fetchUserInfo(tokens.access_token);
    const emailAddress = userInfo.email?.trim().toLowerCase();
    if (!emailAddress) {
      console.log("[gmail] OAuth callback: Google profile did not expose an email address");
      return redirectWithError(origin, "profile_email_missing");
    }

    // Refresh token semantics: Google only returns refresh_token on the first
    // consent (prompt=consent makes this reliable). Reuse the stored cipher
    // when it was not rotated; without any refresh token the connection can
    // never be maintained → record the account as ERROR, honestly.
    const existing = await db.emailAccount.findUnique({
      where: { provider_emailAddress: { provider: "GMAIL", emailAddress } },
      select: { refreshTokenCipher: true },
    });
    let refreshTokenCipher: string | null = null;
    let status: string;
    let lastAuthError: string | null = null;
    if (tokens.refresh_token) {
      refreshTokenCipher = await encryptSecret(tokens.refresh_token);
      status = "CONNECTED";
    } else if (existing?.refreshTokenCipher) {
      refreshTokenCipher = existing.refreshTokenCipher; // keep un-rotated refresh token
      status = "CONNECTED";
    } else {
      status = "ERROR";
      lastAuthError = "No refresh token returned — revoke access in Google Account and reconnect.";
      console.log("[gmail] OAuth callback: no refresh token returned for a new connection");
    }

    const accessTokenCipher = await encryptSecret(tokens.access_token);
    const accessTokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await db.emailAccount.upsert({
      where: { provider_emailAddress: { provider: "GMAIL", emailAddress } },
      create: {
        provider: "GMAIL",
        emailAddress,
        status,
        accessTokenCipher,
        refreshTokenCipher,
        accessTokenExpiresAt,
        scope: tokens.scope ?? null,
        lastAuthError,
        syncInProgress: false,
        // historyId stays null → first sync is an INITIAL full INBOX import.
      },
      update: {
        status,
        accessTokenCipher,
        refreshTokenCipher,
        accessTokenExpiresAt,
        scope: tokens.scope ?? null,
        lastAuthError,
      },
    });

    await logActivity({
      action: "GMAIL_CONNECTED",
      // See note in oauth/start: EntityType union is owned outside this task.
      entityType: "EMAIL_ACCOUNT" as unknown as LogActivityInput["entityType"],
      entityId: emailAddress,
      entityLabel: emailAddress,
      summary: `Connected Gmail mailbox ${emailAddress}.`,
      actor: sessionUser,
      kind: "AUDIT",
    });

    console.log(`[gmail] OAuth callback: connected ${emailAddress}`);
    return clearStateCookie(redirectWith(origin, { oauth: "connected" }));
  } catch (err) {
    // Short reason only — the error text may reference Google's protocol
    // error string but never carries tokens or the authorisation code.
    const message = err instanceof Error ? err.message.slice(0, 120) : "unknown";
    console.log(`[gmail] OAuth callback failed: ${message}`);
    return redirectWithError(origin, "exchange_failed");
  }
}
