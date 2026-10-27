/**
 * AgencyOS — Gmail message parsing (Task 2-b).
 *
 * Converts a Gmail API message resource (messages.get?format=full) into the
 * agreed ParsedGmailMessage contract consumed by Task 2-c's ingest pipeline.
 * No HTML sanitisation happens here — bodies are stored raw and sanitised at
 * render time (message content is treated as untrusted input end to end).
 */
import "server-only";
import type { ParsedGmailMessage } from "@/lib/email-ingest";

export interface GmailHeader {
  name?: string;
  value?: string;
}

export interface GmailBody {
  size?: number;
  data?: string; // base64url
  attachmentId?: string;
}

export interface GmailPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: GmailBody;
  parts?: GmailPart[];
}

export interface GmailMessageResource {
  id?: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string; // epoch milliseconds as a string
  payload?: GmailPart;
}

/** Matches an email address inside an RFC 5322 header value (display name etc. excluded). */
const EMAIL_RE = /[^\s<>,;:"']+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+/;

function decodeBase64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

function headerValue(msg: GmailMessageResource, name: string): string | null {
  const headers = msg.payload?.headers ?? [];
  const hit = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  const value = hit?.value?.trim();
  return value ? value : null;
}

/** Extracts the bare address from a "Display Name <addr>" header value. */
function parseEmailAddress(header: string | null): string {
  if (!header) return "";
  const match = header.match(EMAIL_RE);
  if (!match) return "";
  return match[0].trim().toLowerCase();
}

/** Splits a To/Cc header into normalised addresses (ignores display names). */
function parseAddressList(header: string | null): string[] {
  if (!header) return [];
  const out: string[] = [];
  for (const segment of header.split(",")) {
    const address = parseEmailAddress(segment);
    if (address && !out.includes(address)) out.push(address);
  }
  return out;
}

/** Display-name side of the From header: unquoted, or null when absent. */
function parseFromName(header: string | null): string | null {
  if (!header) return null;
  const angleStart = header.indexOf("<");
  if (angleStart <= 0) return null; // bare address — no display name present
  let name = header.slice(0, angleStart).trim();
  // Unquote a quoted display name ("Display, Name" <a@b.c>).
  const quoted = name.match(/^"([\s\S]*)"$/);
  if (quoted) name = quoted[1].trim();
  return name ? name : null;
}

interface WalkAccumulator {
  text: string[];
  html: string[];
  attachments: ParsedGmailMessage["attachments"];
}

function walkPart(part: GmailPart | undefined, acc: WalkAccumulator): void {
  if (!part) return;
  const mimeType = part.mimeType ?? "";
  const hasFilename = Boolean(part.filename && part.filename.length);
  const attachmentId = part.body?.attachmentId;

  if (hasFilename && attachmentId) {
    acc.attachments.push({
      attachmentId,
      fileName: part.filename as string,
      mimeType: mimeType || "application/octet-stream",
      // body.size is the exact decoded byte size Gmail reports.
      sizeBytes: typeof part.body?.size === "number" ? part.body.size : 0,
    });
  } else if (!hasFilename && part.body?.data) {
    const decoded = decodeBase64Url(part.body.data);
    if (mimeType === "text/plain") acc.text.push(decoded);
    else if (mimeType === "text/html") acc.html.push(decoded);
  }

  for (const child of part.parts ?? []) walkPart(child, acc);
}

/** Parses a Gmail message resource into the ingest-pipeline contract. */
export function parseGmailMessage(msg: GmailMessageResource): ParsedGmailMessage {
  const fromHeader = headerValue(msg, "From");
  const providerMessageId = msg.id ?? "";
  const attachments: ParsedGmailMessage["attachments"] = [];
  const acc: WalkAccumulator = { text: [], html: [], attachments };
  walkPart(msg.payload, acc);

  // sentAt: internalDate (epoch ms) is authoritative; Date header is the fallback.
  let sentAt: Date | null = null;
  if (msg.internalDate) {
    const ms = parseInt(msg.internalDate, 10);
    if (Number.isFinite(ms)) sentAt = new Date(ms);
  }
  if (!sentAt) {
    const dateHeader = headerValue(msg, "Date");
    if (dateHeader) {
      const parsed = new Date(dateHeader);
      if (!Number.isNaN(parsed.getTime())) sentAt = parsed;
    }
  }

  return {
    providerMessageId,
    // Gmail always returns threadId on messages.get; self-thread fallback keeps
    // the thread unique key valid instead of collapsing onto an empty string.
    providerThreadId: msg.threadId || providerMessageId,
    subject: headerValue(msg, "Subject"),
    fromEmail: parseEmailAddress(fromHeader),
    fromName: parseFromName(fromHeader),
    toEmails: parseAddressList(headerValue(msg, "To")),
    ccEmails: parseAddressList(headerValue(msg, "Cc")),
    bodyText: acc.text.length ? acc.text.join("\n\n") : null,
    bodyHtml: acc.html.length ? acc.html.join("\n") : null,
    snippet: msg.snippet ?? null,
    sentAt,
    hasAttachments: attachments.length > 0,
    attachments,
  };
}
