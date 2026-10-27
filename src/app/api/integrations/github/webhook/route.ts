/**
 * AgencyOS — GitHub webhook receiver (Phase 4).
 * POST /api/integrations/github/webhook
 *
 * NOT behind withAuth — authenticity comes from the HMAC SHA-256 signature
 * over the RAW body (timing-safe compare). Idempotent per delivery
 * (x-github-delivery, unique with provider — duplicate → 200 {duplicate:true}
 * so GitHub stops retrying). Processing is BEST-EFFORT: a processing failure
 * is recorded on the WebhookEvent row but still answered 200 (GitHub would
 * otherwise retry a permanently-failing delivery).
 *
 * Raw payloads and secrets are NEVER stored — only a short summary line.
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { isUniqueViolation } from "@/lib/billing-num";
import { sanitiseError } from "@/lib/monitoring/url-guard";
import { verifyGithubSignature, processWebhookEvent } from "@/lib/integrations/github";

export async function POST(req: NextRequest) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return jsonError("WEBHOOK_DISABLED", "GITHUB_WEBHOOK_SECRET is not configured — webhook receiving is disabled.", 503);
  }

  const delivery = req.headers.get("x-github-delivery");
  if (!delivery) {
    return jsonError("BAD_REQUEST", "Missing x-github-delivery header.", 400);
  }
  const event = req.headers.get("x-github-event") ?? "unknown";
  const signature = req.headers.get("x-hub-signature-256");

  const rawBody = await req.text();

  if (!verifyGithubSignature(rawBody, signature, secret)) {
    return jsonError("UNAUTHORIZED", "Invalid signature.", 401);
  }

  // Idempotent receipt — a repeated delivery is a no-op success.
  let webhookEvent: { id: string };
  try {
    webhookEvent = await db.webhookEvent.create({
      data: {
        provider: "GITHUB",
        eventId: delivery,
        eventType: event,
        status: "RECEIVED",
      },
      select: { id: true },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return jsonOk({ duplicate: true });
    }
    throw err;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    await db.webhookEvent
      .update({
        where: { id: webhookEvent.id },
        data: { status: "FAILED", processedAt: new Date(), error: "Delivery body was not valid JSON." },
      })
      .catch(() => undefined);
    // Still 200 — the signature was valid; retrying cannot fix malformed JSON.
    return jsonOk({ processed: false });
  }

  const result = await processWebhookEvent(event, payload);

  await db.webhookEvent
    .update({
      where: { id: webhookEvent.id },
      data: {
        status: result.processed ? "PROCESSED" : "FAILED",
        processedAt: new Date(),
        payloadSummary: result.summary,
        ...(result.error ? { error: sanitiseError(result.error).slice(0, 500) } : {}),
      },
    })
    .catch((err) => {
      console.error("[github-webhook] Could not finalise delivery record:", err instanceof Error ? err.message : err);
    });

  return jsonOk({ processed: result.processed });
}
