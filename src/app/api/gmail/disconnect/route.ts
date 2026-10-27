/**
 * AgencyOS — Gmail disconnect (Task 2-b).
 * POST /api/gmail/disconnect — best-effort token revocation at Google, then
 * wipes all token material locally and marks the account DISCONNECTED.
 * A running sync is allowed to finish; its finally-block only resets the
 * claim flag, which is harmless for a disconnected account.
 */
import { db } from "@/lib/db";
import { jsonOk, NotFoundError, withAuth } from "@/lib/api";
import { requireFounder } from "@/lib/rbac";
import { logActivity, type LogActivityInput } from "@/lib/activity";
import { decryptSecret } from "@/lib/secret-box";
import { revokeToken } from "@/lib/gmail/oauth";

export const POST = withAuth(async (_req, user) => {
  // RBAC: the founder's mailbox connection — founder-only.
  requireFounder(user);
  const account = await db.emailAccount.findFirst({ orderBy: { createdAt: "asc" } });
  if (!account) throw new NotFoundError("No Gmail account has been connected.");

  // Revoke first (best-effort): if Google-side revocation fails we still
  // disconnect locally — the tokens below are wiped either way, so keeping
  // quiet about a revoke error is safe and matches "best-effort".
  if (account.refreshTokenCipher) {
    try {
      const refreshToken = await decryptSecret(account.refreshTokenCipher);
      await revokeToken(refreshToken);
    } catch (err) {
      console.error(
        "[gmail] Token revocation at Google failed (continuing with local disconnect):",
        err instanceof Error ? err.message.slice(0, 120) : err
      );
    }
  }

  await db.emailAccount.update({
    where: { id: account.id },
    data: {
      status: "DISCONNECTED",
      accessTokenCipher: null,
      refreshTokenCipher: null,
      accessTokenExpiresAt: null,
      scope: null,
      lastAuthError: null,
      syncInProgress: false,
      // lastSync* history is intentionally preserved for the operator.
    },
  });

  await logActivity({
    action: "GMAIL_DISCONNECTED",
    // See oauth/start: EntityType union is owned outside this task's files.
    entityType: "EMAIL_ACCOUNT" as unknown as LogActivityInput["entityType"],
    entityId: account.id,
    entityLabel: account.emailAddress,
    summary: `Disconnected Gmail mailbox ${account.emailAddress}.`,
    actor: user,
    kind: "AUDIT",
  });

  return jsonOk({});
});
