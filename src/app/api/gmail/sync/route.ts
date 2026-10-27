/**
 * AgencyOS — manual Gmail synchronisation (Task 2-b).
 * POST /api/gmail/sync — triggers one bounded runSync and returns its summary.
 * Guards: OAuth credentials present, a CONNECTED account exists, one sync per
 * 15 s per account, plus the in-flight guard (409) before the engine's own
 * atomic claim.
 */
import { db } from "@/lib/db";
import { jsonError, jsonOk, withAuth } from "@/lib/api";
import { requireFounder } from "@/lib/rbac";
import { rateLimit } from "@/lib/rate-limit";
import { getOAuthConfig } from "@/lib/gmail/oauth";
import { runSync } from "@/lib/gmail/sync";

export const POST = withAuth(async (_req, user) => {
  // RBAC: syncing the founder's mailbox — founder-only.
  requireFounder(user);
  if (!getOAuthConfig().configured) {
    return jsonError(
      "GMAIL_NOT_CONFIGURED",
      "Gmail is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the environment first.",
      400
    );
  }

  const account = await db.emailAccount.findFirst({
    where: { status: "CONNECTED" },
    orderBy: { createdAt: "asc" },
  });
  if (!account) {
    return jsonError(
      "GMAIL_NOT_CONNECTED",
      "No connected Gmail account. Connect Gmail in Settings → Integrations first.",
      400
    );
  }

  const limit = rateLimit(`gmail-sync:${account.id}`, 1, 15_000);
  if (!limit.ok) {
    return jsonError("RATE_LIMITED", "Sync can run once every 15 seconds. Try again shortly.", 429);
  }

  // Fast pre-check for a better error than the engine's generic busy summary.
  if (account.syncInProgress) {
    return jsonError("CONFLICT", "A synchronisation is already running.", 409);
  }

  // The engine never throws; its atomic claim still protects against a race
  // between this check and the claim itself.
  const summary = await runSync(account.id, { trigger: "MANUAL" });

  return jsonOk({
    status: summary.status,
    fetched: summary.fetched,
    fresh: summary.fresh,
    skipped: summary.skipped,
    error: summary.error ?? null,
  });
});
