/**
 * AgencyOS — hosting/provider adapter registry (Phase 4, server-only).
 *
 * Honest capability map: NO provider API is implemented yet. GitHub is the
 * furthest along (repository metadata read + signed webhook receipt); the
 * hosting providers have no adapter at all. This module exists so the UI and
 * the reconciliation job can report what is actually supported instead of
 * pretending.
 *
 * A real adapter would implement `ProviderAdapter` with verify/config/test
 * operations. None of them may fabricate deployment outcomes — until a
 * provider is implemented, deployments are reconciled manually.
 */
import "server-only";

export interface ProviderSupport {
  provider: string;
  implemented: boolean;
  capabilities: string[];
}

export interface ProviderAdapter {
  provider: string;
  /** False for every provider until real API integration ships. */
  implemented: boolean;
  /** Human-readable list of what the integration can actually do today. */
  capabilities: string[];
  /** Reads non-secret connection metadata (never returns credentials). */
  describe?(): Promise<Record<string, unknown>>;
}

/**
 * Registry of provider support. Keep honest — a capability must only be
 * listed when the code path behind it is implemented and verified.
 */
export const PROVIDER_REGISTRY: ProviderAdapter[] = [
  {
    provider: "GITHUB",
    implemented: false,
    capabilities: [
      "repository metadata (read)",
      "signed webhook receipt (deploy events update linked deployments)",
    ],
  },
  { provider: "VERCEL", implemented: false, capabilities: [] },
  { provider: "NETLIFY", implemented: false, capabilities: [] },
  { provider: "CLOUDFLARE_PAGES", implemented: false, capabilities: [] },
];

/** The provider support rows served by GET /api/integrations/status. */
export function getProviderSupport(): ProviderSupport[] {
  return PROVIDER_REGISTRY.map((adapter) => ({
    provider: adapter.provider,
    implemented: adapter.implemented,
    capabilities: [...adapter.capabilities],
  }));
}
