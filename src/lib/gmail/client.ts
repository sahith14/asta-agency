/**
 * AgencyOS — Gmail API client (Task 2-b).
 *
 * Token lifecycle (getAccessToken) plus a hardened fetch wrapper (gmailFetch)
 * used by the sync engine, attachment downloads and — via the documented
 * exports below — Task 2-c's reply/send pipeline.
 *
 * CONTRACT for Task 2-c (support backend, src/lib/email-ingest.ts):
 *   import { GMAIL_API_BASE, getAccessToken, gmailFetch } from "@/lib/gmail/client";
 *   - getAccessToken(account: EmailAccount) => { token } | { error } where
 *     error === "REAUTH_REQUIRED" means the operator must reconnect.
 *   - gmailFetch(url, token, init?) => { ok, status, json, error? } with
 *     retry/backoff and 15s timeout already handled. NEVER log the token.
 */
import "server-only";
import type { EmailAccount } from "@prisma/client";
import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/secret-box";
import { GoogleOAuthError, refreshAccessToken } from "@/lib/gmail/oauth";

export const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1";

/** Refresh proactively when the cached access token has <120 s of life left. */
const ACCESS_TOKEN_MARGIN_MS = 120_000;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
const MAX_BACKOFF_MS = 5_000;

export interface GmailFetchResult {
  ok: boolean; // true when Gmail returned 2xx
  status: number; // 0 when the request never completed (network/timeout)
  json: unknown; // parsed JSON body, or null when absent/non-JSON
  error?: string; // short, credential-free classification of the failure
}

/** Marks the account REAUTH_REQUIRED with a human-readable (token-free) reason. */
async function markReauth(accountId: string, message: string): Promise<void> {
  try {
    await db.emailAccount.update({
      where: { id: accountId },
      data: { status: "REAUTH_REQUIRED", lastAuthError: message },
    });
  } catch (err) {
    console.error("[gmail] Failed to record REAUTH_REQUIRED state:", err);
  }
}

/**
 * Returns a valid Gmail access token for the account, refreshing + persisting
 * an encrypted copy when the cached one is missing, undecryptable or about to
 * expire. Never logs or returns token material.
 */
export async function getAccessToken(account: EmailAccount): Promise<{ token: string } | { error: string }> {
  // 1. Cached access token (decrypt failure falls through to refresh).
  if (account.accessTokenCipher) {
    try {
      const token = await decryptSecret(account.accessTokenCipher);
      const expiresAt = account.accessTokenExpiresAt?.getTime() ?? 0;
      if (expiresAt - Date.now() > ACCESS_TOKEN_MARGIN_MS) {
        return { token };
      }
    } catch {
      console.error("[gmail] Stored access token could not be decrypted; refreshing instead.");
    }
  }

  // 2. No refresh token (or undecryptable) → operator must reconnect.
  if (!account.refreshTokenCipher) {
    await markReauth(account.id, "No refresh token stored — reconnect the account.");
    return { error: "REAUTH_REQUIRED" };
  }
  let refreshToken: string;
  try {
    refreshToken = await decryptSecret(account.refreshTokenCipher);
  } catch {
    await markReauth(account.id, "Stored refresh token could not be decrypted — reconnect the account.");
    return { error: "REAUTH_REQUIRED" };
  }

  // 3. Refresh + persist (re-encrypted).
  try {
    const tokens = await refreshAccessToken(refreshToken);
    const accessTokenCipher = await encryptSecret(tokens.access_token);
    const accessTokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    await db.emailAccount.update({
      where: { id: account.id },
      data: {
        accessTokenCipher,
        accessTokenExpiresAt,
        tokenLastRefreshedAt: new Date(),
        lastAuthError: null,
        // A successful refresh heals a previously REAUTH_REQUIRED account.
        status: account.status === "REAUTH_REQUIRED" ? "CONNECTED" : account.status,
      },
    });
    return { token: tokens.access_token };
  } catch (err) {
    if (err instanceof GoogleOAuthError) {
      // Revoked/expired/rotated refresh tokens can only be fixed by reconnecting.
      const rejected =
        err.oauthError === "invalid_grant" ||
        err.oauthError === "invalid_client" ||
        err.oauthError === "unauthorized_client";
      if (rejected) {
        await markReauth(account.id, "Google rejected the stored refresh token — reconnect the account.");
        return { error: "REAUTH_REQUIRED" };
      }
    }
    const message = err instanceof Error ? err.message : "Token refresh failed.";
    try {
      await db.emailAccount.update({ where: { id: account.id }, data: { lastAuthError: message } });
    } catch {
      // Account may have vanished mid-flight; nothing else to do here.
    }
    return { error: message };
  }
}

function classifyFailure(status: number, json: unknown): GmailFetchResult {
  // Google's error.message is a short API description and carries no credentials.
  const apiMessage = (json as { error?: { message?: string } } | null)?.error?.message;
  const error = apiMessage
    ? `Gmail API error ${status}: ${apiMessage}`.slice(0, 300)
    : `Gmail API error ${status}.`;
  return { ok: false, status, json, error };
}

function backoffDelayMs(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const seconds = parseInt(retryAfterHeader, 10);
    if (Number.isFinite(seconds) && seconds > 0) {
      // Respect Retry-After but stay bounded so sync runs keep a time budget.
      return Math.min(seconds, 20) * 1000;
    }
  }
  return Math.min(500 * 2 ** (attempt - 1), MAX_BACKOFF_MS);
}

/**
 * Authenticated Gmail API fetch: 15 s timeout, retries on 429/5xx/network
 * errors with bounded exponential backoff (honouring Retry-After), JSON
 * parsing and response classification. Never logs the token.
 */
export async function gmailFetch(url: string, token: string, init: RequestInit = {}): Promise<GmailFetchResult> {
  const headers = new Headers(init.headers ?? undefined);
  headers.set("Authorization", `Bearer ${token}`);

  let lastResult: GmailFetchResult = { ok: false, status: 0, json: null, error: "Request failed." };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const onCallerAbort = () => controller.abort();
    if (init.signal) {
      if (init.signal.aborted) controller.abort();
      else init.signal.addEventListener("abort", onCallerAbort);
    }
    try {
      const res = await fetch(url, { ...init, headers, signal: controller.signal });
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        // Empty or non-JSON body — surfaced via status/error fields.
      }
      if (res.ok) {
        return { ok: true, status: res.status, json };
      }
      lastResult = classifyFailure(res.status, json);
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt === MAX_ATTEMPTS) return lastResult;
      await new Promise((r) => setTimeout(r, backoffDelayMs(attempt, res.headers.get("retry-after"))));
    } catch (err) {
      if (init.signal?.aborted) {
        return { ok: false, status: 0, json: null, error: "Request aborted." };
      }
      const timedOut = err instanceof Error && err.name === "AbortError";
      lastResult = {
        ok: false,
        status: 0,
        json: null,
        error: timedOut ? `Gmail request timed out after ${REQUEST_TIMEOUT_MS / 1000}s.` : "Network error contacting Gmail.",
      };
      if (attempt === MAX_ATTEMPTS) return lastResult;
      await new Promise((r) => setTimeout(r, backoffDelayMs(attempt, null)));
    } finally {
      clearTimeout(timer);
      if (init.signal) init.signal.removeEventListener("abort", onCallerAbort);
    }
  }
  return lastResult; // unreachable — loop always returns
}
