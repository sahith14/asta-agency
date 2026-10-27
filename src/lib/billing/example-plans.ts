/**
 * AgencyOS — example service plans (Phase 3, server-only).
 *
 * Seeds the three spec'd example plans (Care £29 / Business Care £49 /
 * Growth Care £79) exactly once, when the ServicePlan table is EMPTY. They
 * are real, fully editable catalogue records (isSample=false) that the owner
 * can rename, reprice or deactivate — not hardcoded rules. Runs at server
 * boot from src/lib/billing/scheduler.ts; safe to call repeatedly.
 */
import "server-only";
import { db } from "@/lib/db";

const EXAMPLE_PLANS = [
  {
    name: "Care",
    description:
      "Example plan — monthly care & maintenance (2 included hours). Edit or deactivate as needed.",
    priceMinor: 2900,
    allowanceHours: 2,
    includedServices: [
      "WordPress/core updates",
      "Plugin updates",
      "Weekly uptime checks",
      "Monthly backup",
      "Security monitoring",
    ],
  },
  {
    name: "Business Care",
    description:
      "Example plan — monthly care & maintenance for growing sites (4 included hours). Edit or deactivate as needed.",
    priceMinor: 4900,
    allowanceHours: 4,
    includedServices: [
      "Everything in Care",
      "Small content edits (4h)",
      "Performance checks",
      "Priority support",
    ],
  },
  {
    name: "Growth Care",
    description:
      "Example plan — full care & growth support (6 included hours). Edit or deactivate as needed.",
    priceMinor: 7900,
    allowanceHours: 6,
    includedServices: [
      "Everything in Business Care",
      "Feature tweaks (6h)",
      "SEO & analytics review",
      "Monthly report",
    ],
  },
] as const;

/** Idempotent seed: only acts when no plans exist. Never overwrites data. */
export async function ensureExamplePlans(): Promise<void> {
  const count = await db.servicePlan.count();
  if (count > 0) return;

  await db.$transaction(async (tx) => {
    // Re-check inside the transaction to avoid a double-seed race.
    const existing = await tx.servicePlan.count();
    if (existing > 0) return;
    for (const plan of EXAMPLE_PLANS) {
      await tx.servicePlan.create({
        data: {
          name: plan.name,
          description: plan.description,
          billingInterval: "MONTHLY",
          priceMinor: plan.priceMinor,
          currency: "GBP",
          allowanceHours: plan.allowanceHours,
          includedServices: JSON.stringify(plan.includedServices),
          autoRenew: true,
          isActive: true,
          isSample: false, // real editable catalogue records, not sample data
        },
      });
    }
  });

  console.log("[billing] Seeded 3 example service plans (catalogue was empty) — edit or deactivate as needed.");
}
