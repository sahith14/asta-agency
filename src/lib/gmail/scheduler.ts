/**
 * AgencyOS — server-side Gmail sync scheduler (Task 2-b).
 *
 * Started from src/instrumentation.ts (Node.js runtime only). A 60 s interval
 * tick finds CONNECTED accounts whose last sync is older than
 * GMAIL_SYNC_INTERVAL_MINUTES (default 5; 0 disables) and fires runSync
 * without blocking the timer.
 *
 * Documented limitation: the scheduler lives inside this process, which is
 * correct for the single-instance deployment; multi-instance deployments
 * should replace it with an external cron trigger of POST /api/gmail/sync.
 *
 * Logging is deliberately terse ("[gmail-scheduler]") — no tokens, no
 * message content, no email subjects.
 */
import "server-only";
import { db } from "@/lib/db";
import { runSync } from "@/lib/gmail/sync";

const TICK_INTERVAL_MS = 60_000;

const globalForScheduler = globalThis as unknown as {
  __agencyosGmailScheduler?: { startedAt: number };
};

function intervalMinutes(): number {
  const parsed = parseInt(process.env.GMAIL_SYNC_INTERVAL_MINUTES ?? "5", 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 5;
  return parsed;
}

async function tick(): Promise<void> {
  const minutes = intervalMinutes();
  const cutoff = new Date(Date.now() - minutes * 60_000);
  const due = await db.emailAccount.findMany({
    where: {
      status: "CONNECTED",
      syncInProgress: false,
      OR: [{ lastSyncCompletedAt: null }, { lastSyncCompletedAt: { lt: cutoff } }],
    },
    select: { id: true },
  });
  if (!due.length) return;

  console.log(`[gmail-scheduler] ${due.length} account(s) due for sync`);
  // Fire concurrently; failures are logged and never break the timer.
  await Promise.allSettled(
    due.map((account) =>
      runSync(account.id, { trigger: "SCHEDULED" }).catch((err) => {
        console.error("[gmail-scheduler] Scheduled sync failed:", err instanceof Error ? err.message : err);
      })
    )
  );
}

/** Starts the scheduler exactly once per process. */
function startGmailScheduler(): void {
  if (globalForScheduler.__agencyosGmailScheduler) return;
  globalForScheduler.__agencyosGmailScheduler = { startedAt: Date.now() };

  if (intervalMinutes() === 0) {
    console.log("[gmail-scheduler] Disabled (GMAIL_SYNC_INTERVAL_MINUTES=0)");
    return;
  }

  const timer = setInterval(() => {
    tick().catch((err) => {
      console.error("[gmail-scheduler] Tick failed:", err instanceof Error ? err.message : err);
    });
  }, TICK_INTERVAL_MS);
  // Never keep the process alive just for the scheduler.
  timer.unref?.();

  console.log(`[gmail-scheduler] Started (interval ${intervalMinutes()} min, tick every 60 s)`);
}

startGmailScheduler();
