/**
 * AgencyOS — Documents collection API.
 * GET  /api/documents  — paginated list with client/website/project/uploader refs.
 * POST /api/documents  — multipart upload (file + optional links + note),
 *                        validated against a MIME allowlist and a 10 MB cap.
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  BadRequestError,
  ForbiddenError,
  jsonOk,
  parseQuery,
  withAuth,
} from "@/lib/api";
import { requireModule, requireFounder } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import type { DocumentRecord, Paginated } from "@/lib/types";
import {
  ALLOWED_MIME,
  ALLOWED_MIME_LABEL,
  MAX_SIZE,
  saveUpload,
} from "@/lib/storage";

const docRefs = {
  client: { select: { id: true, businessName: true } },
  website: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
  uploadedBy: { select: { id: true, displayName: true } },
};

type DocumentWithRefs = Prisma.DocumentGetPayload<{ include: typeof docRefs }>;

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

function formString(form: FormData, key: string): string | null {
  const value = form.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

// ---------------------------------------------------------------------------
// GET /api/documents
// ---------------------------------------------------------------------------

export const GET = withAuth(async (req, user) => {
  // RBAC: documents read — founder all; developers only docs linked to their assigned projects/clients; support/manager denied.
  requireModule(user, "documents");
  const query = parseQuery(req);

  const where: Prisma.DocumentWhereInput = {};
  if (query.clientId) where.clientId = query.clientId;
  if (query.websiteId) where.websiteId = query.websiteId;
  if (query.projectId) where.projectId = query.projectId;
  if (query.search) {
    where.OR = [
      { fileName: { contains: query.search } },
      { note: { contains: query.search } },
    ];
  }
  // Record scope: developers are limited to documents linked to their assigned projects, clients or those projects' websites.
  if (user.role === "WEB_DEVELOPER") {
    const [projRows, clientRows, websiteRows] = await Promise.all([
      db.project.findMany({ where: { assignedDeveloperId: user.id }, select: { id: true } }),
      db.project.findMany({ where: { assignedDeveloperId: user.id }, select: { clientId: true }, distinct: ["clientId"] }),
      db.projectWebsite.findMany({ where: { project: { assignedDeveloperId: user.id } }, select: { websiteId: true } }),
    ]);
    where.OR = [
      { projectId: { in: projRows.map((r) => r.id) } },
      { clientId: { in: clientRows.map((r) => r.clientId) } },
      { websiteId: { in: websiteRows.map((r) => r.websiteId) } },
    ];
  }

  const skip = (query.page - 1) * query.pageSize;

  const [rows, total] = await Promise.all([
    db.document.findMany({
      where,
      include: docRefs,
      orderBy: { createdAt: "desc" },
      skip,
      take: query.pageSize,
    }),
    db.document.count({ where }),
  ]);

  const payload: Paginated<DocumentRecord> = {
    items: rows.map(toDocumentRecord),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.ceil(total / query.pageSize),
  };

  return jsonOk(payload);
});

// ---------------------------------------------------------------------------
// POST /api/documents (multipart/form-data)
// ---------------------------------------------------------------------------

export const POST = withAuth(async (req, user) => {
  // RBAC: uploading documents is founder-only.
  requireFounder(user);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new BadRequestError(
      "Expected a multipart/form-data upload with a “file” field."
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    throw new BadRequestError("No file was provided. Attach it as the “file” field.");
  }
  if (file.size > MAX_SIZE) {
    throw new BadRequestError("File exceeds the 10 MB limit.");
  }
  const mimeType = file.type || "application/octet-stream";
  if (!(ALLOWED_MIME as readonly string[]).includes(mimeType)) {
    throw new BadRequestError(
      `Unsupported file type (“${file.type || "unknown"}”). Allowed types: ${ALLOWED_MIME_LABEL}.`
    );
  }

  const clientId = formString(form, "clientId");
  const websiteId = formString(form, "websiteId");
  const projectId = formString(form, "projectId");
  const note = formString(form, "note");

  // Linked ids must exist when provided.
  const [client, website, project] = await Promise.all([
    clientId
      ? db.client.findUnique({ where: { id: clientId }, select: { id: true, businessName: true } })
      : Promise.resolve(null),
    websiteId
      ? db.website.findUnique({ where: { id: websiteId }, select: { id: true } })
      : Promise.resolve(null),
    projectId
      ? db.project.findUnique({ where: { id: projectId }, select: { id: true } })
      : Promise.resolve(null),
  ]);
  if (clientId && !client) {
    throw new BadRequestError("clientId does not reference an existing client.");
  }
  if (websiteId && !website) {
    throw new BadRequestError("websiteId does not reference an existing website.");
  }
  if (projectId && !project) {
    throw new BadRequestError("projectId does not reference an existing project.");
  }

  const { storageKey, sizeBytes, checksum } = await saveUpload(file);

  const created = await db.document.create({
    data: {
      clientId: clientId ?? null,
      websiteId: websiteId ?? null,
      projectId: projectId ?? null,
      fileName: file.name || storageKey.split("/").pop() || "upload",
      mimeType,
      sizeBytes,
      storageKey,
      checksum,
      note: note ?? null,
      uploadedById: user.id,
    },
  });

  const record = await db.document.findUniqueOrThrow({
    where: { id: created.id },
    include: docRefs,
  });

  await logActivity({
    action: "DOCUMENT_UPLOADED",
    entityType: "DOCUMENT",
    entityId: record.id,
    entityLabel: record.fileName,
    summary: `Uploaded “${record.fileName}”${client ? ` for ${client.businessName}` : ""}.`,
    actor: user,
    // Metadata only ever describes the file — never its contents.
    metadata: { fileName: record.fileName, sizeBytes },
    clientId: record.clientId,
    websiteId: record.websiteId,
    projectId: record.projectId,
  });

  return jsonOk(toDocumentRecord(record));
});
