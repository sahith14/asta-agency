/**
 * AgencyOS — Deterministic inbound email → client matching (Task 2-c).
 *
 * Consumed by the ingest pipeline (src/lib/email-ingest.ts). Matching is a
 * pure function of stored data — display-name similarity is NEVER used, and
 * NO_MATCH is never set automatically (it is a terminal operator decision).
 *
 * Decision order:
 *  1. normalise the sender address (trim + lowercase);
 *  2. exact hit on a persisted EmailMatchRule  → CONFIRMED (with its website);
 *  3. exact hit on a Contact.email / Client.email → CONFIRMED;
 *  4. otherwise, if the sender's email domain matches contact email domains of
 *     EXACTLY ONE client → SUGGESTED (suggestedClientId);
 *  5. otherwise NEEDS_REVIEW (nothing assigned).
 *
 * Website assignment happens ONLY on evidence (never guessed):
 *  i.  the sender domain equals a non-archived website primaryDomain/Domain of
 *      the matched client, else
 *  ii. the client owns exactly ONE non-archived website.
 * Emails stored in the DB may be mixed-case, so candidates are fetched and
 * compared against normalised values in code (SQLite has no case-insensitive
 * `equals`); at agency scale the candidate sets are small.
 */
import "server-only";
import { db } from "@/lib/db";

export type EmailMatchStatus = "CONFIRMED" | "SUGGESTED" | "NEEDS_REVIEW";

export interface MatchInboundEmailInput {
  fromEmail: string;
  fromName?: string | null;
}

export interface MatchInboundEmailResult {
  matchStatus: EmailMatchStatus;
  clientId: string | null;
  websiteId: string | null;
  suggestedClientId: string | null;
  /** websiteId carried by the matching rule, when the hit came from a rule. */
  ruleWebsiteId?: string | null;
}

/** Canonical email comparison form: trim + lowercase. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Lowercased domain part of an email address; null when there is no "@". */
function emailDomain(normalised: string): string | null {
  const at = normalizedLastIndex(normalised);
  if (at === -1) return null;
  const domain = normalised.slice(at + 1).trim();
  return domain.length > 0 ? domain : null;
}

function normalizedLastIndex(normalised: string): number {
  return normalised.lastIndexOf("@");
}

/**
 * Domain comparison treats a leading "www." as insignificant on BOTH sides so
 * that "www.acme.co.uk" and "acme.co.uk" are the same evidence. Deterministic
 * and symmetric by construction.
 */
function domainsEquivalent(a: string, b: string): boolean {
  const strip = (d: string) => (d.startsWith("www.") ? d.slice(4) : d);
  return strip(a) === strip(b) && strip(a).length > 0;
}

interface WebsiteEvidence {
  websiteId: string | null;
}

/**
 * Website evidence rule for an already-matched client:
 * (i)  sender domain equals a non-archived website primaryDomain or one of its
 *      Domain rows, else (ii) the client owns exactly one non-archived website.
 */
async function resolveWebsiteEvidence(clientId: string, senderDomain: string | null): Promise<WebsiteEvidence> {
  const websites = await db.website.findMany({
    where: { clientId, archivedAt: null },
    select: { id: true, primaryDomain: true },
  });
  if (senderDomain) {
    const domainRows = await db.domain.findMany({
      where: { website: { clientId, archivedAt: null } },
      select: { websiteId: true, domainName: true },
    });
    const byPrimary = websites.find(
      (w) => !!w.primaryDomain && domainsEquivalent(senderDomain, w.primaryDomain.trim().toLowerCase())
    );
    if (byPrimary) return { websiteId: byPrimary.id };
    const byDomain = domainRows.find((d) => domainsEquivalent(senderDomain, d.domainName.trim().toLowerCase()));
    if (byDomain) return { websiteId: byDomain.websiteId };
  }
  if (websites.length === 1) return { websiteId: websites[0].id };
  return { websiteId: null };
}

/**
 * Deterministic matcher. Never throws for "no match" — it returns
 * NEEDS_REVIEW. Display-name similarity is intentionally not consulted.
 */
export async function matchInboundEmail(input: MatchInboundEmailInput): Promise<MatchInboundEmailResult> {
  const from = normalizeEmail(input.fromEmail);
  const senderDomain = emailDomain(from);

  // (b) Persisted rule from a previous operator confirmation → stable CONFIRMED.
  const rule = await db.emailMatchRule.findUnique({
    where: { emailAddress: from },
    select: { clientId: true, websiteId: true },
  });
  if (rule) {
    return {
      matchStatus: "CONFIRMED",
      clientId: rule.clientId,
      websiteId: rule.websiteId,
      suggestedClientId: null,
      ruleWebsiteId: rule.websiteId,
    };
  }

  // (c) Exact address match on contacts (and the client's own email).
  const contacts = await db.contact.findMany({
    where: { email: { not: null } },
    select: { id: true, clientId: true, email: true },
  });
  const contactHit = contacts.find((c) => normalizeEmail(c.email as string) === from);
  if (contactHit) {
    const evidence = await resolveWebsiteEvidence(contactHit.clientId, senderDomain);
    return {
      matchStatus: "CONFIRMED",
      clientId: contactHit.clientId,
      websiteId: evidence.websiteId,
      suggestedClientId: null,
    };
  }

  const clients = await db.client.findMany({
    where: { email: { not: null } },
    select: { id: true, email: true },
  });
  const clientHit = clients.find((c) => normalizeEmail(c.email as string) === from);
  if (clientHit) {
    const evidence = await resolveWebsiteEvidence(clientHit.id, senderDomain);
    return {
      matchStatus: "CONFIRMED",
      clientId: clientHit.id,
      websiteId: evidence.websiteId,
      suggestedClientId: null,
    };
  }

  // (d) Domain-level suggestion: sender domain maps to contact emails of
  // exactly ONE client. Never confirms — the operator decides.
  if (senderDomain) {
    const clientIdsByDomain = new Set<string>();
    for (const contact of contacts) {
      const domain = emailDomain(normalizeEmail(contact.email as string));
      if (domain && domainsEquivalent(senderDomain, domain)) {
        clientIdsByDomain.add(contact.clientId);
      }
    }
    if (clientIdsByDomain.size === 1) {
      const suggestedClientId = [...clientIdsByDomain][0];
      const evidence = await resolveWebsiteEvidence(suggestedClientId, senderDomain);
      return {
        matchStatus: "SUGGESTED",
        clientId: null,
        websiteId: evidence.websiteId,
        suggestedClientId,
      };
    }
  }

  // (e) Nothing deterministic — operator reviews.
  return { matchStatus: "NEEDS_REVIEW", clientId: null, websiteId: null, suggestedClientId: null };
}
