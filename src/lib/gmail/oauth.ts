/**
 * AgencyOS — Google OAuth helpers (Task 2-b).
 *
 * Thin wrappers around Google's OAuth 2.0 endpoints. Every function keeps
 * error messages short and credential-free: tokens, codes and client secrets
 * are never included in thrown errors or logs.
 */
import "server-only";
import type { NextRequest } from "next/server";

export const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
export const GOOGLE_USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";

/**
 * Requested scopes. gmail.send is required by this phase's reply workflow
 * (drafts are sent via messages.send); gmail.readonly covers sync + history.
 */
export const GMAIL_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
] as const;

/** httpOnly cookie that carries the OAuth state between start and callback. */
export const OAUTH_STATE_COOKIE = "agencyos_oauth_state";

/** Raw token-endpoint response (snake_case, mirroring Google's JSON). */
export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

/** OAuth error with the protocol-level error code kept separate for callers. */
export class GoogleOAuthError extends Error {
  constructor(
    message: string,
    public oauthError?: string
  ) {
    super(message);
  }
}

function clientCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** Whether the OAuth client credentials are present in the environment. */
export function getOAuthConfig(): { configured: boolean; clientId?: string } {
  const creds = clientCredentials();
  if (!creds) return { configured: false };
  return { configured: true, clientId: creds.clientId };
}

/** Builds the Google consent-screen URL (offline access forces a refresh token). */
export function buildAuthorizeUrl({ state, redirectUri }: { state: string; redirectUri: string }): string {
  const creds = clientCredentials();
  if (!creds) throw new GoogleOAuthError("Gmail OAuth client is not configured.");
  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.searchParams.set("client_id", creds.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_OAUTH_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "false");
  url.searchParams.set("state", state);
  return url.toString();
}

/**
 * The redirect URI that MUST be registered in Google Cloud Console:
 * GOOGLE_OAUTH_REDIRECT_URI when set, otherwise derived from the request
 * origin (x-forwarded-* first so reverse-proxied deployments resolve correctly).
 */
export function resolveRedirectUri(req: NextRequest): string {
  const explicit = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const origin = proto && host ? `${proto}://${host}` : req.nextUrl.origin;
  return `${origin}/api/gmail/oauth/callback`;
}

async function postForm(url: string, params: URLSearchParams): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: controller.signal,
    });
  } catch {
    throw new GoogleOAuthError("Could not reach the Google OAuth endpoint.");
  } finally {
    clearTimeout(timer);
  }
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    // Non-JSON body — handled by the status check below.
  }
  if (!res.ok) {
    // OAuth error/error_description are short protocol strings (no credentials).
    const oauthError = typeof json.error === "string" ? json.error : undefined;
    const description = typeof json.error_description === "string" ? json.error_description : undefined;
    throw new GoogleOAuthError(
      description ? `Google OAuth error: ${description}` : `Google OAuth endpoint returned HTTP ${res.status}.`,
      oauthError
    );
  }
  return json;
}

/** Exchanges an authorisation code for access/refresh tokens. */
export async function exchangeCodeForTokens({
  code,
  redirectUri,
}: {
  code: string;
  redirectUri: string;
}): Promise<GoogleTokenResponse> {
  const creds = clientCredentials();
  if (!creds) throw new GoogleOAuthError("Gmail OAuth client is not configured.");
  const json = await postForm(
    GOOGLE_TOKEN_ENDPOINT,
    new URLSearchParams({
      code,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    })
  );
  const accessToken = json.access_token;
  if (typeof accessToken !== "string" || !accessToken) {
    throw new GoogleOAuthError("Google token response did not include an access token.");
  }
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 3600;
  return {
    access_token: accessToken,
    expires_in: expiresIn,
    refresh_token: typeof json.refresh_token === "string" ? json.refresh_token : undefined,
    scope: typeof json.scope === "string" ? json.scope : undefined,
    token_type: typeof json.token_type === "string" ? json.token_type : undefined,
  };
}

/** Refreshes an access token using a stored refresh token. */
export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const creds = clientCredentials();
  if (!creds) throw new GoogleOAuthError("Gmail OAuth client is not configured.");
  const json = await postForm(
    GOOGLE_TOKEN_ENDPOINT,
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      grant_type: "refresh_token",
    })
  );
  const accessToken = json.access_token;
  if (typeof accessToken !== "string" || !accessToken) {
    throw new GoogleOAuthError("Google token response did not include an access token.");
  }
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 3600;
  return {
    access_token: accessToken,
    expires_in: expiresIn,
    scope: typeof json.scope === "string" ? json.scope : undefined,
    token_type: typeof json.token_type === "string" ? json.token_type : undefined,
  };
}

/** Best-effort revocation of a token at Google (logout semantics). */
export async function revokeToken(token: string): Promise<void> {
  await postForm(GOOGLE_REVOKE_ENDPOINT, new URLSearchParams({ token }));
}

/** Fetches the basic profile (email/name) for an access token. */
export async function fetchUserInfo(accessToken: string): Promise<{ email: string | null; name: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(GOOGLE_USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
  } catch {
    throw new GoogleOAuthError("Could not reach the Google account info endpoint.");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new GoogleOAuthError(`Google account info endpoint returned HTTP ${res.status}.`);
  }
  const json = (await res.json()) as { email?: string; name?: string };
  return { email: json.email ?? null, name: json.name ?? null };
}
