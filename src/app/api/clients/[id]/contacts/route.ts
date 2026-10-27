/**
 * POST /api/clients/[id]/contacts — add a contact to a client.
 * First contact for a client is forced to primary; new primary contacts
 * unset the previous one (single transaction).
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth, parseBody, jsonOk, NotFoundError } from "@/lib/api";
import { assertClientAccess } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import type { ContactRecord } from "@/lib/types";

function normalizeEmail(value: string | null | undefined): string | null {
  const s = typeof value === "string" ? value.trim().toLowerCase() : "";
  return s.length > 0 ? s : null;
}

function trimToNull(value: string | null | undefined): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s.length > 0 ? s : null;
}

/** Trims before validating so " a@b.com " is accepted; empty → null. */
const emailInput = z.preprocess(
  (v) => (typeof v === "string" ? v.trim() : v),
  z.union([z.email("Please enter a valid email address."), z.literal(""), z.null()])
);

const contactCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(160),
  email: emailInput.nullish().transform(normalizeEmail),
  phone: z.string().trim().max(60).nullish().transform(trimToNull),
  jobTitle: z.string().trim().max(160).nullish().transform(trimToNull),
  isPrimary: z.boolean().default(false),
});

export const POST = withAuth(async (req: NextRequest, user, { params }) => {
  const { id: clientId } = await params;
  const client = await db.client.findUnique({
    where: { id: clientId },
    select: { id: true, businessName: true },
  });
  if (!client) throw new NotFoundError("Client not found");
  // RBAC: adding contacts is client write — founder + assigned manager/prospects only.
  await assertClientAccess(user, clientId, true);

  const parsed = await parseBody(req, contactCreateSchema);

  const contact = await db.$transaction(async (tx) => {
    const existingCount = await tx.contact.count({ where: { clientId } });
    const isPrimary = parsed.isPrimary || existingCount === 0;
    if (isPrimary && existingCount > 0) {
      await tx.contact.updateMany({
        where: { clientId, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    return tx.contact.create({
      data: {
        clientId,
        name: parsed.name,
        email: parsed.email,
        phone: parsed.phone,
        jobTitle: parsed.jobTitle,
        isPrimary,
      },
    });
  });

  await logActivity({
    action: "CONTACT_CREATED",
    entityType: "CONTACT",
    entityId: contact.id,
    entityLabel: contact.name,
    summary: `Added contact ${contact.name} to ${client.businessName}`,
    actor: user,
    clientId,
  });

  return jsonOk(contact as unknown as ContactRecord, { status: 201 });
});
