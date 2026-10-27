/**
 * AgencyOS — Provider connections API (Phase 4).
 * GET  /api/integrations/connections → Paginated<ProviderConnectionRecord>
 *      (config NEVER included)
 * POST /api/integrations/connections { provider, name, config? }
 *      → stores config JSON AES-256-GCM encrypted (secret-box); provider is
 *      unique — a duplicate → 409. status starts NOT_CONFIGURED.
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { ConflictError, jsonOk, parseBody, parseQuery, withAuth } from "@/lib/api";
import { requireFounder } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { encryptSecret } from "@/lib/secret-box";
import type { Paginated } from "@/lib/types";
import { toConnectionRecord } from "../record";

export const GET = withAuth(async (req, user) => {
  // RBAC: only the founder manages integrations.
  requireFounder(user);
  const query = parseQuery(req);

  const [rows, total] = await Promise.all([
    db.providerConnection.findMany({
      orderBy: { createdAt: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.providerConnection.count(),
  ]);

  const data: Paginated<ReturnType<typeof toConnectionRecord>> = {
    items: rows.map(toConnectionRecord),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
  };
  return jsonOk(data);
});

const createConnectionSchema = z.object({
  provider: z.string().min(2, "Provider must be at least 2 characters.").max(40),
  name: z.string().min(1, "Give the connection a name.").max(80),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const POST = withAuth(async (req, user) => {
  // RBAC: only the founder manages integrations.
  requireFounder(user);
  const body = await parseBody(req, createConnectionSchema);
  const provider = body.provider.trim().toUpperCase();

  const existing = await db.providerConnection.findUnique({ where: { provider } });
  if (existing) {
    throw new ConflictError(
      `A connection for ${existing.provider} already exists ("${existing.name}") — edit or delete it instead.`
    );
  }

  // The secret envelope is encrypted and never echoed back or logged.
  const encryptedConfig = body.config ? await encryptSecret(JSON.stringify(body.config)) : null;

  const created = await db.providerConnection.create({
    data: {
      provider,
      name: body.name.trim(),
      status: "NOT_CONFIGURED",
      config: encryptedConfig,
      metadata: null,
    },
  });

  await logActivity({
    action: "PROVIDER_CONNECTION_CREATED",
    entityType: "PROVIDER_CONNECTION",
    entityId: created.id,
    entityLabel: `${created.provider} — ${created.name}`,
    summary: `Provider connection "${created.name}" (${created.provider}) created${body.config ? " with an encrypted credential payload" : ""}.`,
    actor: user,
    metadata: { provider: created.provider, hasConfig: Boolean(body.config) },
  });

  return jsonOk(toConnectionRecord(created), { status: 201 });
});
