/**
 * AgencyOS — Monitoring config upsert API (Phase 4).
 * PUT /api/monitoring/configs/[websiteId] → MonitorConfigRecord (with website)
 * Validates the check URL through the SSRF guard and the accepted-status
 * spec through the server parser (a spec with tokens but no valid range is
 * rejected). A material config change resets the consecutive counters so the
 * website gets a fresh monitoring window.
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { requireModuleWrite } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { parseAcceptedStatuses, validateOutboundUrl, UnsafeUrlError } from "@/lib/monitoring/url-guard";
import { toMonitorConfigRecord } from "../../record";

const intInRange = (min: number, max: number) => z.number().int().min(min).max(max);

const putConfigSchema = z.object({
  enabled: z.boolean(),
  url: z.string().max(500).nullish(),
  acceptedStatuses: z.string().max(200).optional(),
  intervalMinutes: intInRange(1, 1440).optional(),
  timeoutSeconds: intInRange(1, 60).optional(),
  failureThreshold: intInRange(1, 20).optional(),
  recoveryThreshold: intInRange(1, 20).optional(),
  degradedAfterMs: intInRange(100, 60000).optional(),
});

/**
 * Canonicalises an accepted-status spec. Returns null when the spec has
 * non-empty tokens but zero valid ranges (caller rejects with 400).
 */
function canonicalAcceptedStatuses(spec: string): string | null {
  const tokens = spec.split(",").map((t) => t.trim()).filter((t) => t.length > 0);
  const ranges: { min: number; max: number }[] = [];
  for (const token of tokens) {
    const m = token.match(/^(\d{3})-(\d{3})$/);
    if (m) {
      const min = parseInt(m[1], 10);
      const max = parseInt(m[2], 10);
      if (min >= 100 && max <= 599 && min <= max) ranges.push({ min, max });
      continue;
    }
    const single = token.match(/^\d{3}$/);
    if (single) {
      const value = parseInt(token, 10);
      if (value >= 100 && value <= 599) ranges.push({ min: value, max: value });
    }
  }
  if (tokens.length > 0 && ranges.length === 0) return null;
  const canonical = parseAcceptedStatuses(spec);
  return canonical.map((r) => (r.min === r.max ? `${r.min}` : `${r.min}-${r.max}`)).join(",");
}

export const PUT = withAuth(async (req, user, { params }) => {
  // RBAC: upserting monitor configs is founder + developer.
  requireModuleWrite(user, "monitoring");
  const { websiteId } = await params;
  const body = await parseBody(req, putConfigSchema);

  const website = await db.website.findUnique({
    where: { id: websiteId },
    select: { id: true, name: true, clientId: true },
  });
  if (!website) throw new NotFoundError("Website not found.");

  // URL: validated with the SSRF guard whenever a non-empty value is supplied.
  let url: string | null = null;
  if (body.url !== undefined && body.url !== null && body.url.trim() !== "") {
    const candidate = body.url.trim();
    try {
      await validateOutboundUrl(candidate);
    } catch (err) {
      if (err instanceof UnsafeUrlError) throw new BadRequestError(err.message);
      throw err;
    }
    url = candidate;
  }

  let acceptedStatuses: string | undefined;
  if (body.acceptedStatuses !== undefined) {
    const canonical = canonicalAcceptedStatuses(body.acceptedStatuses);
    if (canonical === null) {
      throw new BadRequestError(
        `"${body.acceptedStatuses}" contains no valid status range. Use forms like 200-299 or 301, separated by commas.`
      );
    }
    acceptedStatuses = canonical;
  }

  const existing = await db.monitorConfig.findUnique({ where: { websiteId } });

  const defaults = {
    intervalMinutes: body.intervalMinutes ?? 15,
    timeoutSeconds: body.timeoutSeconds ?? 10,
    failureThreshold: body.failureThreshold ?? 3,
    recoveryThreshold: body.recoveryThreshold ?? 2,
    degradedAfterMs: body.degradedAfterMs ?? 5000,
  };

  const updateData = {
    enabled: body.enabled,
    ...(body.url !== undefined ? { url } : {}),
    ...(acceptedStatuses !== undefined ? { acceptedStatuses } : {}),
    ...(body.intervalMinutes !== undefined ? { intervalMinutes: body.intervalMinutes } : {}),
    ...(body.timeoutSeconds !== undefined ? { timeoutSeconds: body.timeoutSeconds } : {}),
    ...(body.failureThreshold !== undefined ? { failureThreshold: body.failureThreshold } : {}),
    ...(body.recoveryThreshold !== undefined ? { recoveryThreshold: body.recoveryThreshold } : {}),
    ...(body.degradedAfterMs !== undefined ? { degradedAfterMs: body.degradedAfterMs } : {}),
  };

  const createData = {
    websiteId, // required on create — the upsert key
    enabled: body.enabled,
    url,
    acceptedStatuses: acceptedStatuses ?? "200-299",
    ...defaults,
  };

  // A material change to check behaviour resets the consecutive counters —
  // the website starts a fresh monitoring window (stored health stays as-is).
  const materialChanged =
    existing &&
    ((body.url !== undefined && (existing.url ?? null) !== url) ||
      (acceptedStatuses !== undefined && existing.acceptedStatuses !== acceptedStatuses) ||
      (body.intervalMinutes !== undefined && existing.intervalMinutes !== body.intervalMinutes) ||
      (body.timeoutSeconds !== undefined && existing.timeoutSeconds !== body.timeoutSeconds) ||
      (body.failureThreshold !== undefined && existing.failureThreshold !== body.failureThreshold) ||
      (body.recoveryThreshold !== undefined && existing.recoveryThreshold !== body.recoveryThreshold) ||
      (body.degradedAfterMs !== undefined && existing.degradedAfterMs !== body.degradedAfterMs));

  const saved = await db.monitorConfig.upsert({
    where: { websiteId },
    create: createData,
    update: {
      ...updateData,
      ...(materialChanged ? { consecutiveFailures: 0, consecutiveSuccesses: 0 } : {}),
    },
  });

  const action = !existing
    ? body.enabled
      ? "MONITORING_ENABLED"
      : "MONITORING_CREATED"
    : body.enabled !== existing.enabled
      ? body.enabled
        ? "MONITORING_ENABLED"
        : "MONITORING_DISABLED"
      : "MONITORING_UPDATED";
  const verb = !existing
    ? body.enabled
      ? "enabled"
      : "created"
    : body.enabled !== existing.enabled
      ? body.enabled
        ? "enabled"
        : "disabled"
      : "updated";
  await logActivity({
    action,
    entityType: "MONITOR_CONFIG",
    entityId: saved.id,
    summary: `Monitoring ${verb} for ${website.name}.`,
    actor: user,
    clientId: website.clientId,
    websiteId: website.id,
  });

  const full = await db.monitorConfig.findUnique({
    where: { id: saved.id },
    include: { website: { select: { id: true, name: true, productionUrl: true, primaryDomain: true, client: { select: { id: true, businessName: true } } } } },
  });
  if (!full) throw new NotFoundError("Monitor config could not be loaded after save.");
  return jsonOk(toMonitorConfigRecord(full, full.website));
});
