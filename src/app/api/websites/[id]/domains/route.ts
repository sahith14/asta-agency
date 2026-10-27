/**
 * POST /api/websites/[id]/domains — add a domain to a website.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth, parseBody, jsonOk, NotFoundError } from "@/lib/api";
import { requireFounder } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import type { DomainRecord } from "@/lib/types";
import { toDateOrNull } from "@/lib/parse-date";

function trimToNull(value: string | null | undefined): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s.length > 0 ? s : null;
}

const domainCreateSchema = z.object({
  domainName: z.string().trim().min(1, "Domain name is required.").max(253),
  registrar: z.string().trim().max(160).nullish().transform(trimToNull),
  renewalDate: z.union([z.string(), z.null()]).optional().transform(toDateOrNull),
  autoRenew: z.boolean().default(true),
});

export const POST = withAuth(async (req: NextRequest, user, { params }) => {
  // RBAC: adding domains to a website is founder-only.
  requireFounder(user);
  const { id: websiteId } = await params;
  const website = await db.website.findUnique({
    where: { id: websiteId },
    select: { id: true, name: true, clientId: true },
  });
  if (!website) throw new NotFoundError("Website not found");

  const parsed = await parseBody(req, domainCreateSchema);

  const domain = await db.domain.create({
    data: {
      websiteId,
      domainName: parsed.domainName,
      registrar: parsed.registrar,
      renewalDate: parsed.renewalDate,
      autoRenew: parsed.autoRenew,
    },
  });

  await logActivity({
    action: "DOMAIN_ADDED",
    entityType: "WEBSITE",
    entityId: websiteId,
    entityLabel: website.name,
    summary: `Added domain ${domain.domainName} to ${website.name}`,
    actor: user,
    clientId: website.clientId,
    websiteId,
  });

  return jsonOk(domain as unknown as DomainRecord, { status: 201 });
});
