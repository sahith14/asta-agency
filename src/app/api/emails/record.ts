/**
 * AgencyOS — Shared EmailMessage → EmailMessageRecord mapping for the emails
 * API routes (colocated helper, not a route).
 *
 * JSON string columns (toEmails/ccEmails/attachments) are parsed into typed
 * arrays here so every emails route returns the same shape.
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { EmailAttachmentMeta, EmailMessageRecord, EmailMessageDetailRecord } from "@/lib/types";
import { sanitiseEmailHtml, emailToPlainText } from "@/lib/email-sanitize";

export const emailInclude = {
  client: { select: { id: true, businessName: true } },
  website: { select: { id: true, name: true } },
  ticket: { select: { id: true, number: true, subject: true, status: true } },
} satisfies Prisma.EmailMessageInclude;

export type EmailMessageWithRefs = Prisma.EmailMessageGetPayload<{ include: typeof emailInclude }>;

export function parseStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

export function parseAttachments(raw: string | null | undefined): EmailAttachmentMeta[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (v): v is EmailAttachmentMeta =>
        !!v &&
        typeof v === "object" &&
        typeof (v as EmailAttachmentMeta).attachmentId === "string" &&
        typeof (v as EmailAttachmentMeta).fileName === "string" &&
        typeof (v as EmailAttachmentMeta).mimeType === "string" &&
        typeof (v as EmailAttachmentMeta).sizeBytes === "number"
    );
  } catch {
    return [];
  }
}

/** `TKT-0001` label used in activity summaries. */
export function ticketNumberLabel(number: number): string {
  return `TKT-${String(number).padStart(4, "0")}`;
}

export function toEmailMessageRecord(row: EmailMessageWithRefs): EmailMessageRecord {
  return {
    ...row,
    toEmails: parseStringArray(row.toEmails),
    ccEmails: parseStringArray(row.ccEmails),
    attachments: parseAttachments(row.attachments),
  } as unknown as EmailMessageRecord; // Dates serialize to ISO strings in JSON.
}

/** Extra ref carried alongside EmailMessageRecord (suggestedClientId is a bare column). */
export type EmailMessageRecordWithSuggestion = EmailMessageRecord & {
  suggestedClient?: { id: string; businessName: string } | null;
};

/**
 * Detail record: adds bodies, the server-sanitised HTML subset and thread
 * context. When bodyText is null but bodyHtml exists, a plain-text preview is
 * computed on the fly for the bodyText field — it is NEVER persisted (stored
 * rows keep exactly what the provider delivered).
 */
export function toEmailMessageDetailRecord(
  row: EmailMessageWithRefs,
  threadMessages: EmailMessageDetailRecord["threadMessages"]
): EmailMessageDetailRecord {
  const base = toEmailMessageRecord(row);
  const bodyText = row.bodyText ?? (row.bodyHtml ? emailToPlainText(row.bodyHtml) : null);
  return {
    ...base,
    bodyText,
    bodyHtml: row.bodyHtml,
    sanitisedHtml: sanitiseEmailHtml(row.bodyHtml),
    threadMessages,
  };
}

/**
 * suggestedClientId is a bare column (kept even if the client is archived), so
 * the suggested client ref is resolved with a separate query map instead of a
 * Prisma relation.
 */
export async function loadSuggestedClientMap(
  ids: string[]
): Promise<Map<string, { id: string; businessName: string }>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const rows = await db.client.findMany({
    where: { id: { in: unique } },
    select: { id: true, businessName: true },
  });
  return new Map(rows.map((r) => [r.id, r]));
}
