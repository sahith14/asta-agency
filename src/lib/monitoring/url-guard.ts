/**
 * AgencyOS — URL safety guard for monitoring (Phase 4, server-only).
 *
 * Blocks SSRF: every outbound monitoring request target must be a public
 * HTTP(S) destination. This module is the ONLY gate; the HTTP checker, TLS
 * checker and RDAP client all re-validate every hop (including redirects).
 *
 * Rules:
 * - scheme: http or https only.
 * - port: 80 (http) or 443 (https) only — explicit other ports are rejected.
 * - literal IPs and ALL DNS-resolved addresses must be public:
 *   rejects loopback, private ranges, link-local (incl. cloud metadata
 *   169.254.169.254), CGNAT, ULA, multicast, reserved, and IPv4-mapped IPv6.
 * - DNS re-resolved per redirect hop so DNS rebinding cannot bypass the guard.
 *
 * Error messages are safe to store/display: they never echo credentials.
 */
import "server-only";
import dns from "node:dns/promises";
import { isIP } from "node:net";

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

/** Returns true when the address is NOT safe to contact from the server. */
export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return true; // unparseable → treat as unsafe
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 0) return true; // 192.0.0/24 + 192.0.2/24 test-net
  if (a === 192 && b === 168) return true; // private
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking 198.18/15
  if (a === 198 && b === 51) return true; // test-net-2
  if (a === 203 && b === 0) return true; // test-net-3
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  // IPv4-mapped / IPv4-compatible ::ffff:a.b.c.d (and ::a.b.c.d)
  const mapped = lower.match(/^(?:::ffff:|::)(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  if (lower === "::" || lower === "::1") return true; // unspecified + loopback
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA fc00::/7
  if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true; // link-local fe80::/10
  if (lower.startsWith("ff")) return true; // multicast ff00::/8
  if (lower.startsWith("2001:db8")) return true; // documentation
  if (lower.startsWith("64:ff9b:")) return true; // NAT64 well-known prefix
  return false;
}

export interface ValidatedTarget {
  url: URL;
  /** All resolved addresses for the host — callers may re-check after connect. */
  addresses: string[];
}

/**
 * Validates and resolves an outbound HTTP(S) target. Throws UnsafeUrlError on
 * any violation. DNS is resolved here so private-DNS rebinding is caught
 * BEFORE the request.
 */
export async function validateOutboundUrl(raw: string): Promise<ValidatedTarget> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("URL could not be parsed.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only http and https URLs can be monitored.");
  }
  const explicitPort = url.port;
  if (explicitPort && explicitPort !== "80" && explicitPort !== "443") {
    throw new UnsafeUrlError("Only ports 80 and 443 can be monitored.");
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("URLs with embedded credentials cannot be monitored.");
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!hostname) throw new UnsafeUrlError("URL has no hostname.");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new UnsafeUrlError("Local hostnames cannot be monitored.");
  }

  // Literal IP: check directly.
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new UnsafeUrlError("Private and reserved IP addresses cannot be monitored.");
    }
    return { url, addresses: [hostname] };
  }

  // Hostname: resolve ALL addresses; every one must be public.
  let resolved: { address: string }[];
  try {
    resolved = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new UnsafeUrlError(`DNS lookup failed for ${hostname}.`);
  }
  if (!resolved || resolved.length === 0) {
    throw new UnsafeUrlError(`DNS lookup returned no addresses for ${hostname}.`);
  }
  for (const entry of resolved) {
    if (isPrivateAddress(entry.address)) {
      throw new UnsafeUrlError(`${hostname} resolves to a private or reserved address and cannot be monitored.`);
    }
  }
  return { url, addresses: resolved.map((r) => r.address) };
}

/** Validates a redirect Location against the same rules (fresh DNS). */
export async function validateRedirectTarget(location: string, base: URL): Promise<ValidatedTarget> {
  let next: URL;
  try {
    next = new URL(location, base);
  } catch {
    throw new UnsafeUrlError("Redirect target could not be parsed.");
  }
  // Re-run the full guard on the absolute target (fresh DNS, scheme, port).
  return validateOutboundUrl(next.toString());
}

/**
 * Parses an accepted-status spec such as "200-299,301,302".
 * Invalid tokens are ignored; an empty result falls back to 200-299.
 */
export function parseAcceptedStatuses(spec: string | null | undefined): { min: number; max: number }[] {
  const ranges: { min: number; max: number }[] = [];
  const push = (min: number, max: number) => {
    if (min >= 100 && max <= 599 && min <= max) ranges.push({ min, max });
  };
  for (const token of (spec ?? "").split(",")) {
    const t = token.trim();
    if (!t) continue;
    const m = t.match(/^(\d{3})-(\d{3})$/);
    if (m) {
      push(parseInt(m[1], 10), parseInt(m[2], 10));
      continue;
    }
    const single = t.match(/^\d{3}$/);
    if (single) push(parseInt(t, 10), parseInt(t, 10));
  }
  if (ranges.length === 0) ranges.push({ min: 200, max: 299 });
  return ranges;
}

export function statusAccepted(status: number, ranges: { min: number; max: number }[]): boolean {
  return ranges.some((r) => status >= r.min && status <= r.max);
}

/** Caps and sanitises an error string for storage (no newlines, ≤ 500 chars). */
export function sanitiseError(input: unknown): string {
  const raw =
    input instanceof Error
      ? input.message
      : typeof input === "string"
        ? input
        : "Unknown error";
  const singleLine = raw.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  return singleLine.length > 500 ? `${singleLine.slice(0, 497)}...` : singleLine;
}
