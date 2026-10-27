/**
 * AgencyOS — Maintenance checklist item API (Phase 4).
 * PUT /api/maintenance/runs/[id]/items/[itemId] { result?, notes?, evidenceDocumentId? }
 * Evidence documents must belong to the same website as the run — claims are
 * backed by real files, never cross-site attachments.
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { requireModuleWrite } from "@/lib/rbac";
import { CHECKLIST_RESULTS } from "@/lib/types";
import { toItemRecord } from "../../../../record";

const itemSchema = z.object({
  result: z.enum(CHECKLIST_RESULTS).optional(),
  notes: z.string().max(2000).nullish(),
  evidenceDocumentId: z.string().min(1).nullish(),
});

export const PUT = withAuth(async (req, user, { params }) => {
  // RBAC: recording checklist evidence is founder + developer.
  requireModuleWrite(user, "maintenance");
  const { id, itemId } = await params;
  const body = await parseBody(req, itemSchema);

  const run = await db.maintenanceRun.findUnique({ where: { id }, select: { id: true, websiteId: true } });
  if (!run) throw new NotFoundError("Maintenance run not found.");

  const item = await db.maintenanceChecklistItem.findUnique({ where: { id: itemId } });
  if (!item || item.runId !== run.id) {
    throw new NotFoundError("Checklist item not found on this run.");
  }

  if (body.evidenceDocumentId) {
    const document = await db.document.findUnique({
      where: { id: body.evidenceDocumentId },
      select: { id: true, websiteId: true },
    });
    if (!document) throw new BadRequestError("Evidence document was not found.");
    if (document.websiteId !== run.websiteId) {
      throw new BadRequestError("Evidence document must belong to the same website.");
    }
  }

  const updated = await db.maintenanceChecklistItem.update({
    where: { id: item.id },
    data: {
      ...(body.result !== undefined ? { result: body.result } : {}),
      ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
      ...(body.evidenceDocumentId !== undefined ? { evidenceDocumentId: body.evidenceDocumentId ?? null } : {}),
    },
    include: { evidence: { select: { id: true, fileName: true } } },
  });

  return jsonOk(toItemRecord(updated));
});
