/**
 * AgencyOS — Staff accounts API (Phase 5, spec §1A/§2).
 * GET  /api/users — ACTIVE users for assignee pickers (unchanged behaviour,
 *                    never exposes passwordHash or session secrets).
 * POST /api/users — FOUNDER ONLY: create a staff account.
 *
 * Founder-superuser rules: only ONE OWNER account may exist (new OWNER
 * creation is rejected with a clear 400); creation is audited without ever
 * logging the password.
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, ConflictError, ForbiddenError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { requireFounder } from "@/lib/rbac";
import type { UserRecord } from "@/lib/types";

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email("Please enter a valid email address."),
  displayName: z.string().trim().min(2, "Enter the staff member's name.").max(100),
  role: z.enum(["CLIENT_MANAGER", "WEB_DEVELOPER", "SUPPORT_FINANCE", "STAFF", "OWNER"]),
  password: z.string().min(10, "Password must be at least 10 characters.").max(200),
});

export const GET = withAuth(async () => {
  const users = await db.user.findMany({
    where: { status: "ACTIVE" },
    orderBy: { displayName: "asc" },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      status: true,
      createdAt: true,
      lastLoginAt: true,
    },
  });
  return jsonOk(users as unknown as UserRecord[]);
});

export const POST = withAuth(async (req, user) => {
  requireFounder(user);
  const body = await parseBody(req, createSchema);

  if (body.role === "OWNER") {
    throw new BadRequestError("There can only be one founder account. Staff roles are: Client Manager, Web Developer, Support & Finance.");
  }

  const existing = await db.user.findUnique({ where: { email: body.email }, select: { id: true } });
  if (existing) throw new ConflictError("An account with this email already exists.");

  const created = await db.user.create({
    data: {
      email: body.email,
      displayName: body.displayName,
      role: body.role,
      passwordHash: hashPassword(body.password),
      status: "ACTIVE",
    },
    select: { id: true, email: true, displayName: true, role: true, status: true, createdAt: true, lastLoginAt: true },
  });

  await logActivity({
    action: "USER_CREATED",
    entityType: "USER",
    entityId: created.id,
    entityLabel: created.email,
    summary: `Staff account created — ${created.displayName} (${created.role})`,
    actor: user,
    kind: "AUDIT",
  });

  return jsonOk(created as unknown as UserRecord);
});

// ForbiddenError is exported for parity with the [id] route guards.
void ForbiddenError;
