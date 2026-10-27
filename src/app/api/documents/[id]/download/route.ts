/**
 * AgencyOS — Document download API (GET /api/documents/[id]/download).
 * Streams the stored blob as an attachment. If the file is missing on disk
 * the API says so honestly (404 "metadata only") instead of failing cryptically.
 */
import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { NotFoundError, withAuth, ForbiddenError } from "@/lib/api";
import { requireModule } from "@/lib/rbac";
import { resolveUploadPath } from "@/lib/storage";

export const GET = withAuth(async (req, user, { params }) => {
  // RBAC: documents read — founder all; developers only assigned-linked docs; support/manager denied.
  requireModule(user, "documents");
  const { id } = await params;

  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) throw new NotFoundError("Document not found.");
  // Record scope: developers download only documents linked to their assigned projects/clients/websites.
  if (user.role === "WEB_DEVELOPER") {
    const [project, client, website] = await Promise.all([
      doc.projectId
        ? db.project.findFirst({ where: { id: doc.projectId, assignedDeveloperId: user.id }, select: { id: true } })
        : Promise.resolve(null),
      doc.clientId
        ? db.project.findFirst({ where: { clientId: doc.clientId, assignedDeveloperId: user.id }, select: { id: true } })
        : Promise.resolve(null),
      doc.websiteId
        ? db.projectWebsite.findFirst({ where: { websiteId: doc.websiteId, project: { assignedDeveloperId: user.id } }, select: { id: true } })
        : Promise.resolve(null),
    ]);
    if (!project && !client && !website) {
      throw new ForbiddenError("This document is not linked to one of your assigned projects or clients.");
    }
  }

  let bytes: Buffer;
  try {
    const absolutePath = resolveUploadPath(doc.storageKey);
    bytes = await readFile(absolutePath);
  } catch {
    throw new NotFoundError("File is missing from storage (metadata only).");
  }

  // Strip characters that would break the Content-Disposition header.
  const downloadName = doc.fileName.replace(/[\r\n"\\]/g, "_");

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `attachment; filename="${downloadName}"`,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store",
    },
  });
});
