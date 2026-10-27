/**
 * AgencyOS — Shared meeting record mapping + scheduling helpers for the
 * meetings API routes (colocated helper, not a route).
 *
 * HONESTY NOTE: AgencyOS has NO external calendar integration. Conflicts are
 * detected against AgencyOS bookings only — every scheduling response carries
 * a `note` so the UI can display that truth.
 */
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { BadRequestError } from "@/lib/api";
import type { MeetingRecord } from "@/lib/types";

export const MEETING_SCHEDULING_NOTE =
  "Internal scheduling only — external calendar sync is not connected.";
export const AVAILABILITY_NOTE =
  "Internal availability only — external calendar sync is not connected.";
export const WORKING_HOURS = { start: "09:00", end: "17:30" } as const;

export const meetingInclude = {
  client: { select: { id: true, businessName: true } },
  createdBy: { select: { id: true, displayName: true } },
  briefs: { select: { id: true, number: true } },
} satisfies Prisma.MeetingInclude;

type MeetingWithIncludes = Prisma.MeetingGetPayload<{ include: typeof meetingInclude }>;

export function toMeetingRecord(meeting: MeetingWithIncludes): MeetingRecord {
  return {
    ...meeting,
    scheduledAt: meeting.scheduledAt.toISOString(),
    outcomeRecordedAt: meeting.outcomeRecordedAt ? meeting.outcomeRecordedAt.toISOString() : null,
    reminderSentAt: meeting.reminderSentAt ? meeting.reminderSentAt.toISOString() : null,
    createdAt: meeting.createdAt.toISOString(),
    updatedAt: meeting.updatedAt.toISOString(),
    briefs: meeting.briefs.map((b) => ({ id: b.id, displayNumber: `BRF-${String(b.number).padStart(4, "0")}` })),
  } as unknown as MeetingRecord;
}

/** Any IANA timezone accepted by Intl is valid (superset of MEETING_TIMEZONES). */
export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat(tz);
    return true;
  } catch {
    return false;
  }
}

export function requireTimezone(tz: string): string {
  if (!isValidTimezone(tz)) {
    throw new BadRequestError(`"${tz}" is not a valid IANA timezone (e.g. Europe/London).`);
  }
  return tz;
}

/** Offset (ms) that must be ADDED to a UTC instant to reach the tz wall clock. */
function tzOffsetMs(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - instant.getTime();
}

/**
 * Converts a wall-clock time in `tz` to the true UTC instant. Two-pass offset
 * correction keeps DST boundaries correct (the well-known trick: guess UTC,
 * subtract the offset at the guess, then subtract the offset at the result).
 */
export function wallClockToUtc(y: number, m: number, d: number, h: number, min: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, h, min, 0);
  let instant = new Date(guess - tzOffsetMs(new Date(guess), tz));
  instant = new Date(guess - tzOffsetMs(instant, tz));
  return instant;
}

/** Parses "HH:mm" → minutes since midnight (null when invalid). */
export function parseHm(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/**
 * Overlap detection against AgencyOS bookings ONLY (spec §4 — honest scope).
 * Overlap = existing SCHEDULED meeting where (its start < our end) AND
 * (its start + its duration > our start). `excludeId` lets reschedule ignore
 * the meeting being moved.
 */
export async function findConflicts(input: {
  start: Date;
  end: Date;
  excludeId?: string;
}): Promise<{ id: string; title: string; scheduledAt: Date; durationMinutes: number; timezone: string }[]> {
  // Candidate window is padded (durations are capped at 480 min by schema rules).
  const candidates = await db.meeting.findMany({
    where: {
      status: "SCHEDULED",
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
      scheduledAt: { lt: input.end, gte: new Date(input.start.getTime() - 24 * 60 * 60 * 1000) },
    },
    select: { id: true, title: true, scheduledAt: true, durationMinutes: true, timezone: true },
  });
  return candidates.filter(
    (m) =>
      m.scheduledAt.getTime() < input.end.getTime() &&
      m.scheduledAt.getTime() + m.durationMinutes * 60_000 > input.start.getTime()
  );
}

/** Shared attendee schema: array of strings → stored as JSON. */
export const attendeesSchema = z.array(z.string().trim().min(1).max(200)).max(50).optional();
