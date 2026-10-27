/**
 * AgencyOS — Gmail synchronisation engine (Task 2-b).
 *
 * runSync is the single entry point for manual and scheduled syncs:
 * - atomically claims the account (syncInProgress) to prevent re-entrancy,
 * - records an EmailSyncRun row (INITIAL / INCREMENTAL / RECOVERY),
 * - lists candidate messages (history.list when a cursor exists, otherwise a
 *   bounded messages.list of the INBOX),
 * - dedupes cheaply against the (emailAccountId, providerMessageId) unique
 *   BEFORE fetching the full body,
 * - hands every new message to Task 2-c's ingestInboundMessage, which owns
 *   thread upserts, matching and ticket linking,
 * - persists the Gmail history cursor, counters and run outcome.
 *
 * runSync NEVER throws — callers always receive a summary object.
 * Message content is never logged.
 */
import "server-only";
import type { EmailAccount } from "@prisma/client";
import { db } from "@/lib/db";
import { GMAIL_API_BASE, gmailFetch, getAccessToken } from "@/lib/gmail/client";
import { parseGmailMessage, type GmailMessageResource } from "@/lib/gmail/parse";
import { ingestInboundMessage } from "@/lib/email-ingest";

export interface SyncSummary {
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  fetched: number;
  fresh: number;
  skipped: number;
  error?: string;
}

const HISTORY_PAGE_SIZE = 500;
const LIST_PAGE_SIZE = 500;
const MAX_LIST_PAGES = 10; // bounds recovery/initial full-list work
const CONCURRENCY = 3;
const MAX_ERROR_SUMMARY_CHARS = 2000;

function maxMessagesPerSync(): number {
  const parsed = parseInt(process.env.GMAIL_MAX_MESSAGES_PER_SYNC ?? "50", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 50;
  return Math.min(parsed, 500);
}

function shortError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.replace(/\s+/g, " ").slice(0, 200);
}

function summariseErrors(errors: string[]): string | null {
  if (!errors.length) return null;
  const joined = errors.join("; ");
  return joined.length > MAX_ERROR_SUMMARY_CHARS
    ? `${joined.slice(0, MAX_ERROR_SUMMARY_CHARS)}… (+${errors.length} issue(s))`
    : joined;
}

/** True when a sync is currently claimed for the account. */
export async function isSyncing(accountId: string): Promise<boolean> {
  const account = await db.emailAccount.findUnique({
    where: { id: accountId },
    select: { syncInProgress: true },
  });
  return account?.syncInProgress ?? false;
}

interface HistoryListResponse {
  history?: { messagesAdded?: { message?: { id?: string } }[] }[];
  historyId?: string;
  nextPageToken?: string;
}

interface MessagesListResponse {
  messages?: { id?: string; threadId?: string }[];
  nextPageToken?: string;
}

interface ProfileResponse {
  historyId?: string;
}

/** Collects message ids added since startHistoryId. Returns null on 404-expiry. */
async function listHistoryMessageIds(
  token: string,
  startHistoryId: string,
  onCursor: (historyId: string) => void
): Promise<{ ids: string[]; expired: boolean; error?: string }> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const params = new URLSearchParams({
      startHistoryId,
      maxResults: String(HISTORY_PAGE_SIZE),
    });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await gmailFetch(`${GMAIL_API_BASE}/users/me/history?${params.toString()}`, token);
    if (!res.ok) {
      if (res.status === 404) {
        // Gmail reports an expired/invalid startHistoryId as 404.
        const apiMessage = (res.json as { error?: { message?: string } } | null)?.error?.message ?? "";
        const expired = /histor|expired/i.test(apiMessage);
        if (expired) return { ids, expired: true };
        return { ids, expired: false, error: `Gmail history lookup failed (HTTP 404).` };
      }
      return { ids, expired: false, error: res.error ?? `Gmail history lookup failed (HTTP ${res.status}).` };
    }
    const data = (res.json ?? {}) as HistoryListResponse;
    for (const entry of data.history ?? []) {
      for (const added of entry.messagesAdded ?? []) {
        const id = added.message?.id;
        if (id && !ids.includes(id)) ids.push(id);
      }
    }
    if (data.historyId) onCursor(data.historyId);
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return { ids, expired: false };
}

/** Bounded full listing of the INBOX (initial import / recovery path). */
async function listInboxMessageIds(token: string): Promise<{ ids: string[]; error?: string }> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const params = new URLSearchParams({
      labelIds: "INBOX",
      maxResults: String(LIST_PAGE_SIZE),
    });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await gmailFetch(`${GMAIL_API_BASE}/users/me/messages?${params.toString()}`, token);
    if (!res.ok) {
      return { ids, error: res.error ?? `Gmail message listing failed (HTTP ${res.status}).` };
    }
    const data = (res.json ?? {}) as MessagesListResponse;
    for (const message of data.messages ?? []) {
      if (message.id) ids.push(message.id);
    }
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return { ids };
}

async function fetchProfileHistoryId(token: string): Promise<string | null> {
  const res = await gmailFetch(`${GMAIL_API_BASE}/users/me/profile`, token);
  if (!res.ok) return null;
  const historyId = (res.json as ProfileResponse | null)?.historyId;
  return typeof historyId === "string" && historyId ? historyId : null;
}

/**
 * Runs one bounded synchronisation for an account. Safe to call concurrently —
 * the DB flag claim makes the second caller a no-op (returned as FAILED/busy).
 */
export async function runSync(accountId: string, opts: { trigger: "MANUAL" | "SCHEDULED" }): Promise<SyncSummary> {
  // Atomic claim: only one runner per account can flip the flag false → true.
  const claim = await db.emailAccount.updateMany({
    where: { id: accountId, syncInProgress: false },
    data: { syncInProgress: true, lastSyncStartedAt: new Date() },
  });
  if (claim.count === 0) {
    return { status: "FAILED", fetched: 0, fresh: 0, skipped: 0, error: "Sync already in progress" };
  }

  let account: EmailAccount | null = null;
  try {
    account = await db.emailAccount.findUnique({ where: { id: accountId } });
  } catch (err) {
    console.error("[gmail] Failed to load account for sync:", shortError(err));
  }
  if (!account) {
    await releaseClaim(accountId).catch(() => undefined);
    return { status: "FAILED", fetched: 0, fresh: 0, skipped: 0, error: "Account not found" };
  }

  // INITIAL while no cursor exists, INCREMENTAL afterwards; flips to RECOVERY
  // if the stored historyId turns out to be expired and we fall back to a
  // bounded full list.
  let runKind = account.historyId ? "INCREMENTAL" : "INITIAL";
  let run: { id: string } | null = null;
  try {
    run = await db.emailSyncRun.create({
      data: { emailAccountId: account.id, kind: runKind, trigger: opts.trigger, status: "IN_PROGRESS" },
      select: { id: true },
    });
  } catch (err) {
    console.error("[gmail] Failed to create sync run row:", shortError(err));
  }

  const errors: string[] = [];
  let fetched = 0;
  let fresh = 0;
  let skipped = 0;
  let fatal = false;
  let cursorHistoryId: string | null = null;

  try {
    // --- Auth ---------------------------------------------------------------
    const auth = await getAccessToken(account);
    if ("error" in auth) {
      fatal = true;
      errors.push(auth.error === "REAUTH_REQUIRED" ? "Reauthorisation required" : auth.error);
    } else {
      const token = auth.token;

      // --- Candidate listing ------------------------------------------------
      let candidateIds: string[] = [];
      if (runKind === "INCREMENTAL") {
        const history = await listHistoryMessageIds(token, account.historyId as string, (historyId) => {
          cursorHistoryId = historyId;
        });
        if (history.expired) {
          // Documented recovery path: cursor expired → bounded full re-list.
          runKind = "RECOVERY";
          if (run) {
            await db.emailSyncRun
              .update({ where: { id: run.id }, data: { kind: "RECOVERY" } })
              .catch(() => undefined);
          }
          console.log("[gmail] historyId expired; falling back to bounded full list");
          const listing = await listInboxMessageIds(token);
          if (listing.error) {
            fatal = true;
            errors.push(listing.error);
          }
          candidateIds = listing.ids;
        } else if (history.error) {
          fatal = true;
          errors.push(history.error);
        } else {
          candidateIds = history.ids;
        }
      } else {
        const listing = await listInboxMessageIds(token);
        if (listing.error) {
          fatal = true;
          errors.push(listing.error);
        }
        candidateIds = listing.ids;
      }

      // --- Per-message processing (bounded, pool of 3) -----------------------
      const cap = maxMessagesPerSync();
      const candidates = candidateIds.slice(0, cap);
      if (candidateIds.length > cap) {
        console.log(`[gmail] ${candidateIds.length - cap} message(s) deferred to the next run (cap ${cap})`);
      }

      const queue = [...candidates];
      const worker = async (): Promise<void> => {
        for (;;) {
          const messageId = queue.shift();
          if (!messageId) return;
          try {
            const outcome = await processMessage(account as EmailAccount, token, messageId);
            fetched += outcome.fetched;
            fresh += outcome.fresh;
            skipped += outcome.skipped;
            if (outcome.error) errors.push(outcome.error);
          } catch (err) {
            errors.push(`message ${messageId}: ${shortError(err)}`);
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(candidates.length, 1)) }, worker));

      // --- Cursor ------------------------------------------------------------
      // messages.get does not return historyId; for the full path we read the
      // profile at the end so the next run can go incremental from now.
      if (runKind !== "INCREMENTAL" && !fatal) {
        const profileHistoryId = await fetchProfileHistoryId(token);
        if (profileHistoryId) {
          cursorHistoryId = profileHistoryId;
        } else {
          errors.push("Could not read the Gmail profile history cursor; the next run will re-list.");
        }
      }
    }
  } catch (err) {
    fatal = true;
    errors.push(shortError(err));
  }

  // --- Finalise (never throws) ----------------------------------------------
  const runStatus: SyncSummary["status"] = fatal ? "FAILED" : errors.length > 0 ? "PARTIAL" : "SUCCESS";
  const errorSummary = summariseErrors(errors);

  if (run) {
    await db.emailSyncRun
      .update({
        where: { id: run.id },
        data: {
          status: runStatus,
          finishedAt: new Date(),
          messagesFetched: fetched,
          messagesNew: fresh,
          messagesSkipped: skipped,
          error: errorSummary,
        },
      })
      .catch((err) => console.error("[gmail] Failed to finalise sync run row:", shortError(err)));
  }

  await db.emailAccount
    .update({
      where: { id: accountId },
      data: {
        syncInProgress: false,
        lastSyncCompletedAt: new Date(),
        lastSyncStatus: runStatus,
        lastSyncError: errorSummary,
        ...(cursorHistoryId ? { historyId: cursorHistoryId } : {}),
        ...(fresh > 0 ? { messagesProcessed: { increment: fresh } } : {}),
      },
    })
    .catch((err) => console.error("[gmail] Failed to update account after sync:", shortError(err)));

  const summary: SyncSummary = { status: runStatus, fetched, fresh, skipped };
  if (errorSummary) summary.error = errorSummary;
  console.log(
    `[gmail] sync ${runStatus} account=${accountId} kind=${runKind} fetched=${fetched} new=${fresh} skipped=${skipped}`
  );
  return summary;
}

/** Releases the re-entrancy flag when the account vanished mid-setup. */
async function releaseClaim(accountId: string): Promise<void> {
  await db.emailAccount.updateMany({ where: { id: accountId }, data: { syncInProgress: false } });
}

interface MessageOutcome {
  fetched: number;
  fresh: number;
  skipped: number;
  error?: string;
}

/**
 * Processes one candidate message: cheap dedupe against the compound unique
 * BEFORE the full-body fetch, then parse + ingest. Per-message failures are
 * reported, never fatal for the run.
 */
async function processMessage(account: EmailAccount, token: string, providerMessageId: string): Promise<MessageOutcome> {
  const existing = await db.emailMessage.findUnique({
    where: {
      emailAccountId_providerMessageId: {
        emailAccountId: account.id,
        providerMessageId,
      },
    },
    select: { id: true },
  });
  if (existing) return { fetched: 0, fresh: 0, skipped: 1 };

  const res = await gmailFetch(
    `${GMAIL_API_BASE}/users/me/messages/${encodeURIComponent(providerMessageId)}?format=full`,
    token
  );
  if (!res.ok) {
    return { fetched: 0, fresh: 0, skipped: 0, error: `message ${providerMessageId}: ${res.error ?? `HTTP ${res.status}`}` };
  }

  let parsed: ReturnType<typeof parseGmailMessage>;
  try {
    parsed = parseGmailMessage(res.json as GmailMessageResource);
  } catch (err) {
    return { fetched: 1, fresh: 0, skipped: 0, error: `message ${providerMessageId}: parse failed (${shortError(err)})` };
  }

  // Ingest owns thread upsert + matching + ticket linking; duplicates remain
  // impossible via the compound unique even across racing runs.
  const ingest = await ingestInboundMessage(account, parsed);
  return { fetched: 1, fresh: ingest.isNew ? 1 : 0, skipped: 0 };
}
