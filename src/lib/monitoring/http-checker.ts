/**
 * AgencyOS — website availability checker (Phase 4, server-only).
 *
 * Performs a REAL HTTP(S) availability check against a public URL:
 * - redirects followed manually with EVERY hop re-validated by the SSRF guard
 *   (fresh DNS) — max 5 hops;
 * - hard timeout via AbortSignal (the whole check, all hops included);
 * - response body is drained only up to a byte cap and then cancelled — no
 *   response content is ever stored;
 * - one bounded retry for connection-level failures only (HTTP-status results
 *   are never retried — the server answered);
 * - errors are mapped to a fixed taxonomy and sanitised (≤ 500 chars, no
 *   headers/secrets/response bodies ever recorded).
 */
import "server-only";
import {
  parseAcceptedStatuses,
  sanitiseError,
  statusAccepted,
  validateOutboundUrl,
  validateRedirectTarget,
  UnsafeUrlError,
} from "@/lib/monitoring/url-guard";

const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 256 * 1024;
const USER_AGENT = "AgencyOS-Monitor/1.0 (uptime check)";

export interface HttpCheckOptions {
  url: string;
  /** e.g. "200-299,301" (parsed with parseAcceptedStatuses). */
  acceptedStatuses: string;
  timeoutSeconds: number; // 1..60 (clamped)
  degradedAfterMs: number;
}

export interface HttpCheckResult {
  ok: boolean;
  statusCode: number | null;
  durationMs: number;
  slow: boolean;
  errorCategory: string | null; // DNS | CONNECTION | TIMEOUT | TLS | HTTP_STATUS | REDIRECT | BLOCKED_URL | UNKNOWN
  errorSummary: string | null;
  finalUrl: string | null;
}

function clampTimeout(seconds: number): number {
  if (!Number.isFinite(seconds)) return 10;
  return Math.min(60, Math.max(1, Math.round(seconds)));
}

/** Maps a low-level error to the check error taxonomy. */
function categoriseError(err: unknown): { category: string; summary: string } {
  const anyErr = err as { name?: string; code?: string; message?: string; cause?: { code?: string; message?: string } };
  const code = anyErr?.code ?? anyErr?.cause?.code ?? "";
  const causeMessage = anyErr?.cause?.message ?? "";
  if (anyErr?.name === "TimeoutError" || anyErr?.name === "AbortError" || code === "ABORT_ERR") {
    return { category: "TIMEOUT", summary: "The website did not respond before the timeout." };
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "ENODATA") {
    return { category: "DNS", summary: causeMessage || "DNS lookup failed." };
  }
  if (code === "ECONNREFUSED" || code === "EHOSTUNREACH" || code === "ENETUNREACH" || code === "ECONNRESET" || code === "ECONNABORTED" || code === "EPIPE") {
    return { category: "CONNECTION", summary: causeMessage || "Connection to the website failed." };
  }
  if (
    code.startsWith("ERR_TLS") ||
    code.startsWith("ERR_SSL") ||
    /certificate|TLS|SSL|handshake/i.test(causeMessage)
  ) {
    return { category: "TLS", summary: causeMessage || "TLS handshake failed." };
  }
  if (err instanceof UnsafeUrlError) {
    return { category: "BLOCKED_URL", summary: err.message };
  }
  return { category: "UNKNOWN", summary: sanitiseError(anyErr?.message ?? "Unknown error") };
}

/** Runs a single attempt through all redirect hops. Throws on failure. */
async function attempt(
  startUrl: string,
  ranges: { min: number; max: number }[],
  timeoutMs: number,
  deadline: number
): Promise<{ statusCode: number; finalUrl: string }> {
  let current = await validateOutboundUrl(startUrl); // SSRF guard (fresh DNS)
  let hops = 0;

  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      const e = new Error("Timed out");
      e.name = "TimeoutError";
      throw e;
    }
    const response = await fetch(current.url.toString(), {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      headers: { "user-agent": USER_AGENT, accept: "*/*" },
      signal: AbortSignal.timeout(remaining),
    });

    // Redirect handling — every hop re-validated.
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      // Drain/cancel the redirect body immediately.
      try {
        await response.body?.cancel();
      } catch {
        /* ignore */
      }
      if (!location) {
        // 3xx without a Location: treat the status itself as the result.
        if (!statusAccepted(response.status, ranges)) {
          const err = new Error(`Unexpected redirect status ${response.status}`) as Error & { httpStatus?: number };
          err.httpStatus = response.status;
          throw err;
        }
        return { statusCode: response.status, finalUrl: current.url.toString() };
      }
      hops += 1;
      if (hops > MAX_REDIRECTS) {
        throw new UnsafeUrlError("Too many redirects (more than 5).");
      }
      current = await validateRedirectTarget(location, current.url);
      continue;
    }

    // Drain up to the byte cap, then cancel — content is never stored.
    try {
      const reader = response.body?.getReader();
      if (reader) {
        let total = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value?.byteLength ?? 0;
          if (total > MAX_RESPONSE_BYTES) {
            await reader.cancel();
            break;
          }
        }
      }
    } catch {
      /* body read failures do not fail the check — status is authoritative */
    }

    if (!statusAccepted(response.status, ranges)) {
      const err = new Error(`Unexpected HTTP status ${response.status}`) as Error & { httpStatus?: number };
      err.httpStatus = response.status;
      throw err;
    }
    return { statusCode: response.status, finalUrl: current.url.toString() };
  }
}

/**
 * Executes the availability check. Always resolves (never throws) — failures
 * are returned as results with errorCategory/errorSummary.
 */
export async function runHttpCheck(options: HttpCheckOptions): Promise<HttpCheckResult> {
  const startedAt = Date.now();
  const timeoutMs = clampTimeout(options.timeoutSeconds) * 1000;
  const deadline = startedAt + timeoutMs;
  const ranges = parseAcceptedStatuses(options.acceptedStatuses);

  let lastError: { category: string; summary: string; httpStatus?: number } | null = null;

  // Bounded retries: one retry for connection-level failures only.
  for (let attemptNo = 0; attemptNo < 2; attemptNo++) {
    try {
      const result = await attempt(options.url, ranges, timeoutMs, deadline);
      const durationMs = Date.now() - startedAt;
      return {
        ok: true,
        statusCode: result.statusCode,
        durationMs,
        slow: durationMs > Math.max(1, options.degradedAfterMs),
        errorCategory: null,
        errorSummary: null,
        finalUrl: result.finalUrl,
      };
    } catch (err) {
      const { category, summary } = categoriseError(err);
      const httpStatus = (err as { httpStatus?: number }).httpStatus;
      lastError = { category, summary, httpStatus };
      // Retry ONLY for transient connection-level problems, and only once.
      const retryable = category === "CONNECTION" || category === "TIMEOUT";
      if (!retryable || attemptNo === 1) break;
    }
  }

  const durationMs = Date.now() - startedAt;
  const isHttpStatus = lastError?.httpStatus != null;
  return {
    ok: false,
    statusCode: isHttpStatus ? (lastError?.httpStatus ?? null) : null,
    durationMs,
    slow: false,
    errorCategory: isHttpStatus ? "HTTP_STATUS" : (lastError?.category ?? "UNKNOWN"),
    errorSummary: isHttpStatus
      ? `HTTP ${lastError?.httpStatus} is outside the accepted statuses (${options.acceptedStatuses || "200-299"}).`
      : (lastError?.summary ?? "Unknown error"),
    finalUrl: null,
  };
}
