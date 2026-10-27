/**
 * AgencyOS — Single document API.
 * GET    /api/documents/[id]          — document metadata with refs.
 * PATCH  /api/documents/[id]          — update note / client / website / project links.
 * DELETE /api/documents/[id]          — delete DB row + best-effort disk removal (AUDIT).
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, NotFoundError, jsonOk, parseBody, withAuth, ForbiddenError } from "@/lib/api";
import { requireModule, requireFounder } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { deleteUpload } from "@/lib/storage";
import type { DocumentRecord } from "@/lib/types";

const docRefs = {
  client: { select: { id: true, businessName: true } },
  website: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
  uploadedBy: { select: { id: true, displayName: true } },
};

type DocumentWithRefs = {
  id: string;
  clientId: string | null;
  websiteId: string | null;
  projectId: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  note: string | null;
  createdAt: Date;
  client: { id: string; businessName: string } | null;
  website: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  uploadedBy: { id: string; displayName: string } | null;
};

function toDocumentRecord(doc: DocumentWithRefs): DocumentRecord {
  return {
    id: doc.id,
    clientId: doc.clientId,
    websiteId: doc.websiteId,
    projectId: doc.projectId,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    note: doc.note,
    createdAt: doc.createdAt.toISOString(),
    client: doc.client
      ? { id: doc.client.id, businessName: doc.client.businessName }
      : null,
    website: doc.website ? { id: doc.website.id, name: doc.website.name } : null,
    project: doc.project ? { id: doc.project.id, name: doc.project.name } : null,
    uploadedBy: doc.uploadedBy
      ? { id: doc.uploadedBy.id, displayName: doc.uploadedBy.displayName }
      : null,
  };
}

async function loadDocument(id: string): Promise<DocumentWithRefs> {
  const doc = await db.document.findUnique({ where: { id }, include: docRefs });
  if (!doc) throw new NotFoundError("Document not found.");
  return doc;
}

/** Developers may read a document only when it links to their assigned projects/clients/websites. */
async function assertDeveloperDocumentLinkage(doc: {
  clientId: string | null;
  websiteId: string | null;
  projectId: string | null;
}, userId: string): Promise<void> {
  const [project, client, website] = await Promise.all([
    doc.projectId
      ? db.project.findFirst({ where: { id: doc.projectId, assignedDeveloperId: userId }, select: { id: true } })
      : Promise.resolve(null),
    doc.clientId
      ? db.project.findFirst({ where: { clientId: doc.clientId, assignedDeveloperId: userId }, select: { id: true } })
      : Promise.resolve(null),
    doc.websiteId
      ? db.projectWebsite.findFirst({ where: { websiteId: doc.websiteId, project: { assignedDeveloperId: userId } }, select: { id: true } })
      : Promise.resolve(null),
  ]);
  if (!project && !client && !website) {
    throw new ForbiddenError("This document is not linked to one of your assigned projects or clients.");
  }
}

// ---------------------------------------------------------------------------
// GET /api/documents/[id]
// ---------------------------------------------------------------------------

export const GET = withAuth(async (req, user, { params }) => {
  // RBAC: documents read — founder all; developers only assigned-linked docs; support/manager denied.
  requireModule(user, "documents");
  const { id } = await params;
  const doc = await loadDocument(id);
  if (user.role === "WEB_DEVELOPER") {
    await assertDeveloperDocumentLinkage(doc, user.id);
  }
  return jsonOk(toDocumentRecord(doc));
});

// ---------------------------------------------------------------------------
// PATCH /api/documents/[id]
// ---------------------------------------------------------------------------

const patchSchema = z.object({
  note: z.string().trim().max(2000, "Note must be 2000 characters or fewer.").nullable().optional(),
  clientId: z.string().nullable().optional(),
  websiteId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
});

export const PATCH = withAuth(async (req, user, { params }) => {
  // RBAC: editing documents is founder-only.
  requireFounder(user);
  const { id } = await params;
  const body = await parseBody(req, patchSchema);

  // Validate link ids exist when a (non-null) value is provided.
  const [client, website, project] = await Promise.all([
    body.clientId
      ? db.client.findUnique({ where: { id: body.clientId }, select: { id: true } })
      : Promise.resolve(null),
    body.websiteId
      ? db.website.findUnique({ where: { id: body.websiteId }, select: { id: true } })
      : Promise.resolve(null),
    body.projectId
      ? db.project.findUnique({ where: { id: body.projectId }, select: { id: true } })
      : Promise.resolve(null),
  ]);
  if (body.clientId && !client) {
    throw new BadRequestError("clientId does not reference an existing client.");
  }
  if (body.websiteId && !website) {
    throw new BadRequestError("websiteId does not reference an existing website.");
  }
  if (body.projectId && !project) {
    throw new BadRequestError("projectId does not reference an existing project.");
  }

  const data: {
    note?: string | null;
    clientId?: string | null;
    websiteId?: string | null;
    projectId?: string | null;
  } = {};
  if (body.note !== undefined) data.note = body.note;
  if (body.clientId !== undefined) data.clientId = body.clientId;
  if (body.websiteId !== undefined) data.websiteId = body.websiteId;
  if (body.projectId !== undefined) data.projectId = body.projectId;

  await db.document.update({ where: { id }, data });

  const updated = await loadDocument(id);

  await logActivity({
    action: "DOCUMENT_UPDATED",
    entityType: "DOCUMENT",
    entityId: updated.id,
    entityLabel: updated.fileName,
    summary: `Updated document “${updated.fileName}” (${Object.keys(body).join(", ")}).`,
    actor: user,
    metadata: { updatedKeys: Object.keys(body) },
    clientId: updated.clientId,
    websiteId: updated.websiteId,
    projectId: updated.projectId,
  });

  return jsonOk(toDocumentRecord(updated));
});

// ---------------------------------------------------------------------------
// DELETE /api/documents/[id]
// ---------------------------------------------------------------------------

export const DELETE = withAuth(async (req, user, { params }) => {
  // RBAC: deleting documents is founder-only.
  requireFounder(user);
  const { id } = await params;
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) throw new NotFoundError("Document not found.");

  await db.document.delete({ where: { id } });
  // Best-effort: never fail the request because the blob is already gone.
  await deleteUpload(doc.storageKey);

  await logActivity({
    action: "DOCUMENT_DELETED",
    entityType: "DOCUMENT",
    entityId: doc.id,
    entityLabel: doc.fileName,
    summary: `Deleted document “${doc.fileName}”.`,
    kind: "AUDIT",
    actor: user,
    metadata: { fileName: doc.fileName, sizeBytes: doc.sizeBytes },
    clientId: doc.clientId,
    websiteId: doc.websiteId,
    projectId: doc.projectId,
  });

  return jsonOk({ deleted: true });
});
