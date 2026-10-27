/**
 * POST /api/clients/[id]/restore — clears archivedAt.
 */
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withAuth, jsonOk, NotFoundError } from "@/lib/api";
import { requireFounder } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import type { ClientRecord } from "@/lib/types";

export const POST = withAuth(async (_req: NextRequest, user, { params }) => {
  // RBAC: restoring an archived client is founder-only.
  requireFounder(user);
  const { id } = await params;
  const existing = await db.client.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Client not found");

  const client = await db.client.update({ where: { id }, data: { archivedAt: null } });

  await logActivity({
    action: "CLIENT_RESTORED",
    entityType: "CLIENT",
    entityId: id,
    entityLabel: client.businessName,
    summary: `Restored client ${client.businessName}`,
    actor: user,
    clientId: id,
  });

  return jsonOk(client as unknown as ClientRecord);
});
