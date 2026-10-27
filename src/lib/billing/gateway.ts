/**
 * AgencyOS — payment gateway status (Phase 3, server-only).
 *
 * HONEST REPORTING ONLY: this build records payments manually. No gateway is
 * implemented, so the status endpoint never claims online collection works —
 * not even when credentials happen to be present ("scaffolded, not
 * activated"). The adapter interface below leaves room for a real Stripe (or
 * other) integration later WITHOUT changing this contract.
 */
import "server-only";
import type { GatewayStatusData } from "@/lib/types";

export interface PaymentGatewayAdapter {
  id: string;
  label: string;
  /** Whether this adapter has everything it needs to operate. */
  isConfigured(): boolean;
}

/**
 * Stripe adapter scaffold. Credentials alone do NOT activate online
 * collection — no checkout/webhook implementation exists in this build.
 */
const stripeAdapter: PaymentGatewayAdapter = {
  id: "stripe",
  label: "Stripe",
  isConfigured(): boolean {
    // Reserved for a future implementation; this build never reports
    // configured=true (see getGatewayStatus).
    return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
  },
};

/** Always-unconfigured fallback (manual recording only). */
const manualAdapter: PaymentGatewayAdapter = {
  id: "manual",
  label: "Manual recording",
  isConfigured: () => false,
};

/** Adapter registry — a future build registers real adapters here first. */
const ADAPTERS: PaymentGatewayAdapter[] = [stripeAdapter, manualAdapter];

export function getGatewayStatus(): GatewayStatusData {
  const hasStripeCredentials = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);

  if (!hasStripeCredentials) {
    return {
      provider: null,
      configured: false,
      message:
        "No payment gateway is connected. Record payments manually — online collection is unavailable.",
    };
  }

  // Credentials exist but no gateway implementation ships in this build —
  // never simulate payments or pretend collection is available.
  return {
    provider: "stripe",
    configured: false,
    message: "Stripe adapter is scaffolded but not activated in this build.",
  };
}
