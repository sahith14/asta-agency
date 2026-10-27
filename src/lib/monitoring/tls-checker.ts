/**
 * AgencyOS — TLS certificate & domain registration checkers (Phase 4).
 *
 * TLS: opens a REAL TLS connection (port 443) to a public host and reads the
 * served certificate's validity window — never simulated, never guessed.
 *
 * Registration expiry: queries the public RDAP bootstrap service
 * (rdap.org → authoritative registry RDAP) and reads the "expiration" event.
 * When the registry does not publish RDAP data, the result honestly reports
 * that registration expiry could NOT be verified (renewalDate stays a
 * manually maintained field — the UI labels it as such).
 *
 * Both checkers run the same SSRF guard as the HTTP checker.
 */
import "server-only";
import tls from "node:tls";
import { sanitiseError, validateOutboundUrl, UnsafeUrlError } from "@/lib/monitoring/url-guard";

export interface TlsCheckResult {
  ok: boolean; // connection succeeded and a certificate was read
  authorised: boolean; // certificate passed Node's trust validation
  notBefore: Date | null;
  notAfter: Date | null;
  issuer: string | null;
  subject: string | null;
  errorCategory: string | null; // DNS | CONNECTION | TIMEOUT | TLS | BLOCKED_URL
  errorSummary: string | null;
}

function categoriseTlsError(err: unknown): { category: TlsCheckResult["errorCategory"]; summary: string } {
  const anyErr = err as { code?: string; message?: string };
  const code = anyErr?.code ?? "";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return { category: "DNS", summary: sanitiseError(anyErr?.message) };
  if (code === "ETIMEDOUT" || anyErr?.message === "Timed out") return { category: "TIMEOUT", summary: "TLS connection timed out." };
  if (code === "ECONNREFUSED" || code === "ECONNRESET" || code === "EHOSTUNREACH" || code === "ENETUNREACH") {
    return { category: "CONNECTION", summary: sanitiseError(anyErr?.message) };
  }
  if (err instanceof UnsafeUrlError) return { category: "BLOCKED_URL", summary: err.message };
  return { category: "TLS", summary: sanitiseError(anyErr?.message ?? "TLS handshake failed.") };
}

function peerDate(value: unknown): Date | null {
  if (typeof value === "string" || value instanceof Date) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Inspects the TLS certificate served by `hostname:443`. Always resolves.
 * `authorised=false` with a still-readable certificate (e.g. self-signed or
 * expired) is reported honestly via authorised=false + errorSummary.
 */
export function checkTlsCertificate(hostname: string, timeoutMs = 8000): Promise<TlsCheckResult> {
  return new Promise(async (resolve) => {
    try {
      // SSRF guard first — hostname must resolve to a public address.
      await validateOutboundUrl(`https://${hostname}`);
    } catch (err) {
      resolve({
        ok: false,
        authorised: false,
        notBefore: null,
        notAfter: null,
        issuer: null,
        subject: null,
        errorCategory: "BLOCKED_URL",
        errorSummary: sanitiseError(err),
      });
      return;
    }

    let settled = false;
    const finish = (result: TlsCheckResult) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve(result);
    };

    const socket = tls.connect(
      {
        host: hostname,
        port: 443,
        servername: hostname,
        rejectUnauthorized: false, // we READ and report validity ourselves
        timeout: timeoutMs,
      },
      () => {
        try {
          const cert = socket.getPeerCertificate();
          if (!cert || Object.keys(cert).length === 0) {
            finish({
              ok: false,
              authorised: false,
              notBefore: null,
              notAfter: null,
              issuer: null,
              subject: null,
              errorCategory: "TLS",
              errorSummary: "No certificate presented.",
            });
            return;
          }
          const authorised = socket.authorized;
          const subject = typeof cert.subject?.CN === "string" ? cert.subject.CN : null;
          const issuer = typeof cert.issuer?.O === "string" ? cert.issuer.O : (typeof cert.issuer?.CN === "string" ? cert.issuer.CN : null);
          finish({
            ok: true,
            authorised,
            notBefore: peerDate(cert.valid_from),
            notAfter: peerDate(cert.valid_to),
            issuer,
            subject,
            errorCategory: authorised ? null : "TLS",
            errorSummary: authorised ? null : sanitiseError(socket.authorizationError ?? "Certificate is not trusted."),
          });
        } catch (err) {
          const { category, summary } = categoriseTlsError(err);
          finish({ ok: false, authorised: false, notBefore: null, notAfter: null, issuer: null, subject: null, errorCategory: category, errorSummary: summary });
        }
      }
    );

    socket.on("error", (err) => {
      const { category, summary } = categoriseTlsError(err);
      finish({ ok: false, authorised: false, notBefore: null, notAfter: null, issuer: null, subject: null, errorCategory: category, errorSummary: summary });
    });
    socket.on("timeout", () => {
      finish({ ok: false, authorised: false, notBefore: null, notAfter: null, issuer: null, subject: null, errorCategory: "TIMEOUT", errorSummary: "TLS connection timed out." });
    });
  });
}

export interface RdapResult {
  ok: boolean; // registry answered with parseable RDAP data
  expiryDate: Date | null; // registration expiration (authoritative when present)
  registrar: string | null;
  errorSummary: string | null; // honest reason when ok=false
}

const RDAP_TIMEOUT_MS = 8000;
const RDAP_MAX_BYTES = 256 * 1024;

interface RdapEvent {
  eventAction?: string;
  eventDate?: string;
}
interface RdapEntity {
  roles?: string[];
  vcardArray?: unknown;
}
interface RdapResponse {
  events?: RdapEvent[];
  entities?: RdapEntity[];
}

function registrarName(entity: RdapEntity): string | null {
  if (!Array.isArray(entity.vcardArray) || entity.vcardArray.length < 2) return null;
  const props = entity.vcardArray[1];
  if (!Array.isArray(props)) return null;
  for (const prop of props) {
    if (Array.isArray(prop) && prop[0] === "fn" && typeof prop[3] === "string") return prop[3];
  }
  return null;
}

/**
 * Queries RDAP for the domain's registration expiry. Uses rdap.org (which
 * redirects to the authoritative registry) with every hop SSRF-guarded.
 * ok=false means "could not verify" — never invents a date.
 */
export async function checkDomainRegistration(domain: string): Promise<RdapResult> {
  const startedAt = Date.now();
  const deadline = startedAt + RDAP_TIMEOUT_MS;
  try {
    let current = await validateOutboundUrl(`https://rdap.org/domain/${encodeURIComponent(domain)}`);
    let hops = 0;
    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        return { ok: false, expiryDate: null, registrar: null, errorSummary: "RDAP lookup timed out." };
      }
      const response = await fetch(current.url.toString(), {
        redirect: "manual",
        cache: "no-store",
        headers: { accept: "application/rdap+json, application/json" },
        signal: AbortSignal.timeout(remaining),
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        try {
          await response.body?.cancel();
        } catch {
          /* ignore */
        }
        if (!location) return { ok: false, expiryDate: null, registrar: null, errorSummary: `RDAP registry answered ${response.status} without a redirect target.` };
        hops += 1;
        if (hops > 5) return { ok: false, expiryDate: null, registrar: null, errorSummary: "Too many RDAP redirects." };
        current = await validateOutboundUrl(new URL(location, current.url).toString());
        continue;
      }
      if (response.status === 404) {
        return { ok: false, expiryDate: null, registrar: null, errorSummary: "This registry does not publish RDAP data for the domain (registration expiry could not be verified)." };
      }
      if (response.status === 429) {
        return { ok: false, expiryDate: null, registrar: null, errorSummary: "RDAP rate limited — try again later." };
      }
      if (!response.ok) {
        return { ok: false, expiryDate: null, registrar: null, errorSummary: `RDAP lookup failed (HTTP ${response.status}).` };
      }
      const text = await response.text();
      if (text.length > RDAP_MAX_BYTES) {
        return { ok: false, expiryDate: null, registrar: null, errorSummary: "RDAP response exceeded the size limit." };
      }
      let data: RdapResponse;
      try {
        data = JSON.parse(text) as RdapResponse;
      } catch {
        return { ok: false, expiryDate: null, registrar: null, errorSummary: "RDAP response was not valid JSON." };
      }
      const expiration = (data.events ?? []).find((e) => e.eventAction?.toLowerCase() === "expiration");
      if (!expiration?.eventDate) {
        return { ok: false, expiryDate: null, registrar: null, errorSummary: "RDAP data did not include a registration expiration event." };
      }
      const expiry = new Date(expiration.eventDate);
      if (Number.isNaN(expiry.getTime())) {
        return { ok: false, expiryDate: null, registrar: null, errorSummary: "RDAP expiration date could not be parsed." };
      }
      const registrarEntity = (data.entities ?? []).find((e) => (e.roles ?? []).includes("registrar"));
      return {
        ok: true,
        expiryDate: expiry,
        registrar: registrarEntity ? registrarName(registrarEntity) : null,
        errorSummary: null,
      };
    }
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (name === "TimeoutError" || name === "AbortError") {
      return { ok: false, expiryDate: null, registrar: null, errorSummary: "RDAP lookup timed out." };
    }
    if (err instanceof UnsafeUrlError) {
      return { ok: false, expiryDate: null, registrar: null, errorSummary: sanitiseError(err) };
    }
    return { ok: false, expiryDate: null, registrar: null, errorSummary: sanitiseError(err) };
  }
}
