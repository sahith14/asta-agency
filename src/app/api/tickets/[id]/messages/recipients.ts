/**
 * AgencyOS — Ticket message recipients (Task 2-c).
 * Colocated helper shared by the message create and draft-edit routes.
 *
 * Accepts `to` (single address or comma-separated) and/or `toEmails` (array),
 * plus the `cc` / `ccEmails` alias pair. Addresses are trimmed, lowercased,
 * format-validated and de-duplicated (order preserved).
 */
import { BadRequestError } from "@/lib/api";

// Simple pragmatic validation: one "@", non-empty local part and domain with a dot.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function splitAndValidate(rawList: (string | string[] | undefined)[], label: string): string[] {
  const result: string[] = [];
  for (const raw of rawList) {
    if (raw === undefined) continue;
    const parts = Array.isArray(raw) ? raw : raw.split(",");
    for (const part of parts) {
      const email = part.trim().toLowerCase();
      if (!email) continue;
      if (!EMAIL_RE.test(email)) {
        throw new BadRequestError(`Invalid ${label} email address: "${part.trim()}".`);
      }
      if (!result.includes(email)) result.push(email);
    }
  }
  return result;
}

export interface RecipientInput {
  to?: string;
  toEmails?: string[];
  cc?: string | string[];
  ccEmails?: string | string[];
}

/** Parses + validates recipients; throws 400 on a malformed address. */
export function parseRecipients(input: RecipientInput): { to: string[]; cc: string[] } {
  const to = splitAndValidate([input.to, input.toEmails], "recipient");
  const cc = splitAndValidate([input.cc, input.ccEmails], "CC");
  return { to, cc };
}
