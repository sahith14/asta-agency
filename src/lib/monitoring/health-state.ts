/**
 * AgencyOS — website health state machine (Phase 4, pure).
 *
 * Deterministic mapping from check counters to the stored health state.
 * Kept separate from website lifecycle status: a website can remain LIVE
 * while its monitoring health is DOWN.
 *
 * Rules:
 * - never checked                                  → UNKNOWN
 * - consecutiveFailures >= failureThreshold        → DOWN
 * - last check succeeded but slow                  → DEGRADED
 * - previous state DOWN and recovery not confirmed → stays DOWN until
 *   `recoveryThreshold` consecutive successful checks have been seen
 *   (a single transient success never confirms recovery)
 * - any other failure below the threshold          → DEGRADED
 *   (one transient failure never marks a website DOWN)
 */

export type HealthState = "UNKNOWN" | "HEALTHY" | "DEGRADED" | "DOWN";

export interface HealthStateInput {
  previousState: string;
  lastCheck: { success: boolean; slow: boolean } | null;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  failureThreshold: number;
  recoveryThreshold: number;
}

export function computeHealthState(input: HealthStateInput): HealthState {
  const { previousState, lastCheck, consecutiveFailures, consecutiveSuccesses, failureThreshold, recoveryThreshold } = input;

  if (!lastCheck) return "UNKNOWN";
  if (consecutiveFailures >= Math.max(1, failureThreshold)) return "DOWN";
  if (lastCheck.success) {
    if (lastCheck.slow) return "DEGRADED";
    const wasDown = previousState === "DOWN";
    if (wasDown && consecutiveSuccesses < Math.max(1, recoveryThreshold)) {
      return "DOWN"; // recovery observed but not yet confirmed
    }
    return "HEALTHY";
  }
  return "DEGRADED";
}
