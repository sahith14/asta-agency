/**
 * DELETE /api/domains/[id] — removes a domain record.
 */
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withAuth, jsonOk, NotFoundError } from "@/lib/api";
import { requireFounder } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";

export const DELETE = withAuth(async (_req: NextRequest, user, { params }) => {
  // RBAC: removing a domain is founder-only.
  requireFounder(user);
  const { id } = await params;
  const existing = await db.domain.findUnique({
    where: { id },
    include: { website: { select: { id: true, name: true, clientId: true } } },
  });
  if (!existing) throw new NotFoundError("Domain not found");

  await db.domain.delete({ where: { id } });

  await logActivity({
    action: "DOMAIN_REMOVED",
    entityType: "WEBSITE",
    entityId: existing.website.id,
    entityLabel: existing.website.name,
    summary: `Removed domain ${existing.domainName} from ${existing.website.name}`,
    actor: user,
    clientId: existing.website.clientId,
    websiteId: existing.website.id,
  });

  return jsonOk({});
});
