/**
 * AgencyOS — Provider connection detail API (Phase 4).
 * PATCH  /api/integrations/connections/[id] { name?, status?, metadata? }
 *        (status ∈ PROVIDER_CONNECTION_STATUSES; config is NOT editable here —
 *        replace the connection instead)
 * DELETE /api/integrations/connections/[id] → removes it (frontend confirms).
 * Responses never include the encrypted `config`; summaries never quote it.
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { requireFounder } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { PROVIDER_CONNECTION_STATUSES } from "@/lib/types";
import { toConnectionRecord } from "../../record";

const patchConnectionSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  status: z.enum(PROVIDER_CONNECTION_STATUSES).optional(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
});

export const PATCH = withAuth(async (req, user, { params }) => {
  // RBAC: only the founder manages integrations.
  requireFounder(user);
  const { id } = await params;
  const body = await parseBody(req, patchConnectionSchema);

  const existing = await db.providerConnection.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Provider connection not found.");

  const updated = await db.providerConnection.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.status !== undefined
        ? { status: body.status, ...(body.status === "CONNECTED" ? { lastCheckedAt: new Date(), lastError: null } : {}) }
        : {}),
      ...(body.metadata !== undefined
        ? { metadata: body.metadata ? JSON.stringify(body.metadata) : null }
        : {}),
    },
  });

  await logActivity({
    action: "PROVIDER_CONNECTION_UPDATED",
    entityType: "PROVIDER_CONNECTION",
    entityId: updated.id,
    entityLabel: `${updated.provider} — ${updated.name}`,
    summary: `Provider connection "${updated.name}" (${updated.provider}) updated${body.status && body.status !== existing.status ? ` — status ${existing.status} → ${body.status}` : ""}.`,
    actor: user,
    metadata: { fields: Object.keys(body) },
  });

  return jsonOk(toConnectionRecord(updated));
});

export const DELETE = withAuth(async (_req, user, { params }) => {
  // RBAC: only the founder manages integrations.
  requireFounder(user);
  const { id } = await params;

  const existing = await db.providerConnection.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Provider connection not found.");

  await db.providerConnection.delete({ where: { id } });

  await logActivity({
    action: "PROVIDER_CONNECTION_DELETED",
    entityType: "PROVIDER_CONNECTION",
    entityId: existing.id,
    entityLabel: `${existing.provider} — ${existing.name}`,
    summary: `Provider connection "${existing.name}" (${existing.provider}) deleted — the encrypted credential payload was destroyed.`,
    actor: user,
  });

  return jsonOk({ ok: true });
});
