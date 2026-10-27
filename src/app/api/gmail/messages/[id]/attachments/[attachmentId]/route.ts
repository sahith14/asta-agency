/**
 * AgencyOS — Gmail attachment download (Task 2-b).
 * GET /api/gmail/messages/[id]/attachments/[attachmentId]
 *
 * Streams an attachment from Gmail after ownership, size (10 MB, mirroring
 * documents) and MIME allowlist checks. The response is never cached and the
 * filename is sanitised before it reaches the Content-Disposition header.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { BadRequestError, jsonError, NotFoundError, withAuth } from "@/lib/api";
import { requireFounder } from "@/lib/rbac";
import type { EmailAttachmentMeta } from "@/lib/types";
import { ALLOWED_MIME, ALLOWED_MIME_LABEL, MAX_SIZE } from "@/lib/storage";
import { GMAIL_API_BASE, gmailFetch, getAccessToken } from "@/lib/gmail/client";

/** Strips path separators, quotes and control characters; falls back safely. */
function sanitizeAttachmentName(raw: string): string {
  const name = raw
    .replace(/[\r\n]/g, " ")
    .replace(/[\\/"']/g, "")
    .trim();
  return name.length ? name : "attachment";
}

export const GET = withAuth(async (_req, user, { params }) => {
  // RBAC: the inbox is the founder's mailbox — founder-only.
  requireFounder(user);
  const { id, attachmentId } = await params;

  const message = await db.emailMessage.findUnique({ where: { id } });
  if (!message) throw new NotFoundError("Message not found.");

  // Ownership: the message must belong to the currently connected mailbox.
  const account = await db.emailAccount.findFirst({
    where: { status: "CONNECTED" },
    orderBy: { createdAt: "asc" },
  });
  if (!account || message.emailAccountId !== account.id) {
    throw new NotFoundError("Message not found.");
  }

  let attachments: EmailAttachmentMeta[] = [];
  try {
    attachments = JSON.parse(message.attachments ?? "[]") as EmailAttachmentMeta[];
  } catch {
    attachments = [];
  }
  const meta = attachments.find((a) => a.attachmentId === attachmentId);
  if (!meta) throw new NotFoundError("Attachment not found.");

  if (meta.sizeBytes > MAX_SIZE) {
    throw new BadRequestError("Attachment too large to download (limit 10 MB).");
  }
  if (!(ALLOWED_MIME as readonly string[]).includes(meta.mimeType)) {
    throw new BadRequestError(
      `Unsupported attachment type (“${meta.mimeType || "unknown"}”). Allowed types: ${ALLOWED_MIME_LABEL}.`
    );
  }

  const auth = await getAccessToken(account);
  if ("error" in auth) {
    return jsonError(
      "GMAIL_AUTH_FAILED",
      auth.error === "REAUTH_REQUIRED"
        ? "Gmail needs to be reconnected before attachments can be downloaded."
        : auth.error,
      502
    );
  }

  const res = await gmailFetch(
    `${GMAIL_API_BASE}/users/me/messages/${encodeURIComponent(message.providerMessageId)}/attachments/${encodeURIComponent(attachmentId)}`,
    auth.token
  );
  if (!res.ok) {
    return jsonError("GMAIL_FETCH_FAILED", res.error ?? `Gmail returned HTTP ${res.status}.`, 502);
  }
  const data = (res.json as { data?: string } | null)?.data;
  if (!data) {
    return jsonError("GMAIL_FETCH_FAILED", "Gmail returned an empty attachment payload.", 502);
  }

  const bytes = Uint8Array.from(Buffer.from(data, "base64url"));
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": meta.mimeType,
      "Content-Disposition": `attachment; filename="${sanitizeAttachmentName(meta.fileName)}"`,
      "Content-Length": String(bytes.byteLength),
      // Downloaded message content is user-specific and untrusted — never cache.
      "Cache-Control": "no-store",
    },
  });
});
