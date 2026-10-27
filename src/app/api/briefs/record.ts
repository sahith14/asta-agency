/**
 * AgencyOS — Shared brief record mapping for the briefs API routes
 * (colocated helper, not a route — mirrors maintenance/record.ts pattern).
 */
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { BRIEF_TRANSITIONS } from "@/lib/types";
import type { BriefRecord } from "@/lib/types";

/** Human-readable brief reference: BRF-0001. */
export function briefDisplayNumber(n: number): string {
  return `BRF-${String(n).padStart(4, "0")}`;
}

export const briefInclude = {
  client: { select: { id: true, businessName: true, status: true } },
  owner: { select: { id: true, displayName: true } },
  project: { select: { id: true, name: true } },
  meeting: { select: { id: true, title: true, scheduledAt: true, status: true, timezone: true } },
} satisfies Prisma.BriefInclude;

type BriefWithIncludes = Prisma.BriefGetPayload<{ include: typeof briefInclude }>;

export function toBriefRecord(brief: BriefWithIncludes): BriefRecord {
  return {
    ...brief,
    displayNumber: briefDisplayNumber(brief.number),
    deadline: brief.deadline ? brief.deadline.toISOString() : null,
    handedOverAt: brief.handedOverAt ? brief.handedOverAt.toISOString() : null,
    createdAt: brief.createdAt.toISOString(),
    updatedAt: brief.updatedAt.toISOString(),
    meeting: brief.meeting
      ? { ...brief.meeting, scheduledAt: brief.meeting.scheduledAt.toISOString() }
      : null,
    allowedTransitions: [...(BRIEF_TRANSITIONS[brief.status] ?? [])],
  } as unknown as BriefRecord;
}

/** Optional trimmed string input (" " → null) shared by create/patch schemas. */
export const briefText = (max = 20000) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => {
      const s = typeof v === "string" ? v.trim() : "";
      return s.length > 0 ? s : null;
    });

/** Optional integer minor units (money is never a float). */
export const briefMinor = z.number().int().min(0).max(100_000_000_000).nullish();
