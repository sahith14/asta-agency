/**
 * AgencyOS — Gmail connection status API (Task 2-b).
 * GET /api/gmail/status → EmailAccountStatusRecord (effective connection state,
 * mailbox, sync counters/errors and the redirect URI to register at Google).
 * Tokens/ciphers are NEVER included in the response.
 */
import { db } from "@/lib/db";
import { jsonOk, withAuth } from "@/lib/api";
import { requireFounder } from "@/lib/rbac";
import type { EmailAccountStatusRecord } from "@/lib/types";
import { getOAuthConfig, resolveRedirectUri } from "@/lib/gmail/oauth";

type GmailConnectionState = EmailAccountStatusRecord["state"];

/**
 * Effective state per GMAIL_CONNECTION_STATES: credentials decide
 * NOT_CONFIGURED first; then the account row drives the rest, with SYNCING
 * taking precedence over CONNECTED while a sync is in flight.
 */
function computeState(configured: boolean, account: { status: string; syncInProgress: boolean } | null): GmailConnectionState {
  if (!configured) return "NOT_CONFIGURED";
  if (!account) return "DISCONNECTED";
  if (account.syncInProgress) return "SYNCING";
  switch (account.status) {
    case "AWAITING_AUTH":
      return "AWAITING_AUTHORISATION";
    case "CONNECTED":
      return "CONNECTED";
    case "REAUTH_REQUIRED":
      return "REAUTH_REQUIRED";
    case "ERROR":
      return "ERROR";
    default:
      return "DISCONNECTED";
  }
}

export const GET = withAuth(async (req, user) => {
  // RBAC: the founder's mailbox connection — founder-only.
  requireFounder(user);
  const config = getOAuthConfig();
  // Single-mailbox model: the first created account is THE connection.
  const account = await db.emailAccount.findFirst({ orderBy: { createdAt: "asc" } });

  const record: EmailAccountStatusRecord = {
    state: computeState(config.configured, account),
    configured: config.configured,
    emailAddress: account?.emailAddress ?? null,
    scope: account?.scope ?? null,
    redirectUri: resolveRedirectUri(req),
    lastSyncStartedAt: account?.lastSyncStartedAt?.toISOString() ?? null,
    lastSyncCompletedAt: account?.lastSyncCompletedAt?.toISOString() ?? null,
    lastSyncStatus: account?.lastSyncStatus ?? null,
    lastSyncError: account?.lastSyncError ?? null,
    lastAuthError: account?.lastAuthError ?? null,
    messagesProcessed: account?.messagesProcessed ?? 0,
    historyId: account?.historyId ?? null,
    tokenLastRefreshedAt: account?.tokenLastRefreshedAt?.toISOString() ?? null,
  };

  return jsonOk(record);
});
