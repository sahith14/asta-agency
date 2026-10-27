/**
 * AgencyOS — Staff account detail (Phase 5).
 * GET   /api/users/[id] — founder: any account (minus passwordHash); a user
 *                          can read their own record; others 403.
 * PATCH /api/users/[id] — FOUNDER ONLY: displayName/role/status/password.
 *
 * Escalation guards (spec §2 + founder-superuser requirements):
 *  - nobody can change their OWN role (self-demotion / self-promotion blocked)
 *  - no account can be granted OWNER (single-founder rule)
 *  - the last active founder cannot be suspended
 * Every change is AUDIT-logged; passwords are never logged. Affected users
 * receive an in-app notification on role/status changes.
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, ForbiddenError, NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { requireFounder } from "@/lib/rbac";
import { notifyUsers } from "@/lib/notify";
import { USER_ROLES, type UserRecord } from "@/lib/types";

const patchSchema = z.object({
  displayName: z.string().trim().min(2).max(100).optional(),
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  password: z.string().min(10, "Password must be at least 10 characters.").max(200).optional(),
});

export const GET = withAuth(async (_req, user, { params }) => {
  const { id } = await params;
  if (user.role !== "OWNER" && user.id !== id) {
    throw new ForbiddenError("You can only view your own account.");
  }
  const target = await db.user.findUnique({
    where: { id },
    select: { id: true, email: true, displayName: true, role: true, status: true, createdAt: true, updatedAt: true, lastLoginAt: true },
  });
  if (!target) throw new NotFoundError("User not found.");
  return jsonOk(target as unknown as UserRecord & { updatedAt: Date });
});

export const PATCH = withAuth(async (req, user, { params }) => {
  const { id } = await params;
  requireFounder(user);

  const target = await db.user.findUnique({
    where: { id },
    select: { id: true, email: true, displayName: true, role: true, status: true },
  });
  if (!target) throw new NotFoundError("User not found.");

  const body = await parseBody(req, patchSchema);

  const changes: string[] = [];

  // --- Guard: self role change (prevents demoting/de-privileging yourself) ---
  if (body.role !== undefined && body.role !== target.role) {
    if (target.id === user.id) {
      throw new BadRequestError("You cannot change your own role.");
    }
    if (body.role === "OWNER") {
      throw new BadRequestError("There can only be one founder account — the OWNER role cannot be granted to staff.");
    }
    if (target.role === "OWNER") {
      throw new BadRequestError("The founder role cannot be changed. Create staff accounts with employee roles instead.");
    }
    changes.push(`role ${target.role} → ${body.role}`);
  }

  // --- Guard: last active founder cannot be suspended ---
  if (body.status !== undefined && body.status !== target.status) {
    if (target.role === "OWNER" && body.status === "SUSPENDED") {
      const activeFounders = await db.user.count({ where: { role: "OWNER", status: "ACTIVE" } });
      if (activeFounders <= 1) {
        throw new BadRequestError("The last active founder account cannot be suspended.");
      }
    }
    changes.push(`status ${target.status} → ${body.status}`);
  }

  if (body.displayName !== undefined && body.displayName !== target.displayName) {
    changes.push("display name");
  }
  if (body.password !== undefined) {
    changes.push("password");
  }
  if (changes.length === 0) {
    throw new BadRequestError("Nothing to update.");
  }

  const data: Record<string, unknown> = {};
  if (body.displayName !== undefined) data.displayName = body.displayName;
  if (body.role !== undefined) data.role = body.role;
  if (body.status !== undefined) data.status = body.status;
  if (body.password !== undefined) data.passwordHash = hashPassword(body.password);

  const updated = await db.user.update({
    where: { id },
    data,
    select: { id: true, email: true, displayName: true, role: true, status: true, createdAt: true, lastLoginAt: true },
  });

  await logActivity({
    action: "USER_UPDATED",
    entityType: "USER",
    entityId: target.id,
    entityLabel: target.email,
    summary: `Staff account updated — ${changes.join(", ")}`,
    actor: user,
    kind: "AUDIT",
  });

  // In-app notification for the affected user (role/suspension).
  if (body.role !== undefined || body.status !== undefined) {
    await notifyUsers([target.id], {
      kind: "ACCOUNT_UPDATED",
      title: "Your AgencyOS account was updated",
      body: `An administrator updated your account: ${changes.join(", ")}.`,
      entityType: "USER",
      entityId: target.id,
    });
  }

  return jsonOk(updated as unknown as UserRecord);
});
