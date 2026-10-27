/**
 * POST /api/websites/[id]/restore — clears archivedAt.
 */
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withAuth, jsonOk, NotFoundError } from "@/lib/api";
import { requireFounder } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import type { WebsiteRecord } from "@/lib/types";

export const POST = withAuth(async (_req: NextRequest, user, { params }) => {
  // RBAC: restoring an archived website is founder-only.
  requireFounder(user);
  const { id } = await params;
  const existing = await db.website.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Website not found");

  const website = await db.website.update({ where: { id }, data: { archivedAt: null } });

  await logActivity({
    action: "WEBSITE_RESTORED",
    entityType: "WEBSITE",
    entityId: id,
    entityLabel: website.name,
    summary: `Restored website ${website.name}`,
    actor: user,
    clientId: website.clientId,
    websiteId: id,
  });

  return jsonOk(website as unknown as WebsiteRecord);
});
