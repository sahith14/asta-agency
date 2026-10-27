/**
 * AgencyOS — Profile API (PATCH /api/auth/profile).
 * Updates the signed-in user's display name and/or email. Email must stay
 * unique across accounts. Returns the updated SessionUser shape.
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { ConflictError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import type { SessionUser } from "@/lib/auth";

const profileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "Display name must be 2-80 characters.")
    .max(80, "Display name must be 2-80 characters.")
    .optional(),
  email: z.email("Enter a valid email address.").optional(),
});

export const PATCH = withAuth(async (req, user) => {
  const body = await parseBody(req, profileSchema);

  if (body.email) {
    const clash = await db.user.findFirst({
      where: { email: body.email, id: { not: user.id } },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictError("That email address is already in use by another account.");
    }
  }

  const updated = await db.user.update({
    where: { id: user.id },
    data: {
      ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
      ...(body.email !== undefined ? { email: body.email } : {}),
    },
  });

  await logActivity({
    action: "PROFILE_UPDATED",
    entityType: "AUTH",
    entityId: user.id,
    entityLabel: updated.displayName,
    summary: `Updated profile (${Object.keys(body).join(", ")}).`,
    kind: "AUDIT",
    actor: {
      ...user,
      displayName: updated.displayName,
      email: updated.email,
    },
  });

  const sessionUser: SessionUser = {
    id: updated.id,
    email: updated.email,
    displayName: updated.displayName,
    role: updated.role,
    status: updated.status,
  };
  return jsonOk(sessionUser);
});
