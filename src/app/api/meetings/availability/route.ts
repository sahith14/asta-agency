/**
 * AgencyOS — Meeting availability (Phase 5, spec §4).
 * GET /api/meetings/availability?date=YYYY-MM-DD&duration=45&timezone=Europe/London
 *
 * INTERNAL availability: computed against AgencyOS bookings only. External
 * calendar sync is NOT connected — the response carries an explicit note so
 * the UI never implies otherwise. Working hours 09:00–17:30 in the REQUESTED
 * timezone, slots every 30 minutes; slots overlapping an existing SCHEDULED
 * meeting are marked unavailable (conflictWith names the meeting).
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, jsonOk, withAuth } from "@/lib/api";
import { findConflicts } from "../route";
import { requireRoles } from "@/lib/rbac";

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the YYYY-MM-DD date format."),
  duration: z.coerce.number().int().min(15).max(480).default(45),
  timezone: z.string().default("Europe/London"),
});

const WORK_START_MINUTES = 9 * 60; // 09:00
const WORK_END_MINUTES = 17 * 60 + 30; // 17:30
const SLOT_STEP_MINUTES = 30;

/** Offset (ms) of `tz` at instant `date`: local wall clock minus UTC instant. */
function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, number> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = parseInt(p.value, 10);
  }
  const asUTC = Date.UTC(
    map.year,
    map.month - 1,
    map.day,
    map.hour === 24 ? 0 : map.hour, // midnight can render as "24" with hour12:false
    map.minute,
    map.second
  );
  return asUTC - date.getTime();
}

/** UTC instant for wall-clock Y/M/D h:m in `tz` (two passes for DST edges). */
function zonedWallTimeToUtc(y: number, m: number, d: number, minutes: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  let instant = new Date(guess);
  for (let i = 0; i < 2; i++) {
    instant = new Date(guess - tzOffsetMs(instant, tz));
  }
  return instant;
}

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const GET = withAuth(async (req, user) => {
  // Availability feeds the booking dialog — client managers and the founder.
  requireRoles(user, ["CLIENT_MANAGER"]);
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    date: url.searchParams.get("date") ?? "",
    duration: url.searchParams.get("duration") ?? "45",
    timezone: url.searchParams.get("timezone") ?? "Europe/London",
  });
  if (!parsed.success) {
    throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid availability query.");
  }
  const { date, duration, timezone } = parsed.data;
  if (!isValidTimezone(timezone)) {
    throw new BadRequestError("The timezone is not a valid IANA timezone (e.g. Europe/London).");
  }

  const [y, m, d] = date.split("-").map((p) => parseInt(p, 10));

  const dayStart = zonedWallTimeToUtc(y, m, d, WORK_START_MINUTES, timezone);
  const dayEnd = zonedWallTimeToUtc(y, m, d, WORK_END_MINUTES, timezone);

  // Every SCHEDULED meeting overlapping the working day (cheap pre-filter in
  // local UTC range widened by a day for DST safety), then precise overlap.
  const candidates = await db.meeting.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: { gte: new Date(dayStart.getTime() - 26 * 3_600_000), lte: new Date(dayEnd.getTime() + 26 * 3_600_000) },
    },
    select: { id: true, title: true, scheduledAt: true, durationMinutes: true },
  });

  const now = Date.now();
  const slots: { start: string; end: string; available: boolean; conflictWith: string | null }[] = [];
  for (let start = WORK_START_MINUTES; start + duration <= WORK_END_MINUTES; start += SLOT_STEP_MINUTES) {
    const slotStart = zonedWallTimeToUtc(y, m, d, start, timezone);
    const slotEnd = new Date(slotStart.getTime() + duration * 60_000);
    const conflict = candidates.find(
      (c) => c.scheduledAt.getTime() < slotEnd.getTime() && c.scheduledAt.getTime() + c.durationMinutes * 60_000 > slotStart.getTime()
    );
    const inPast = slotStart.getTime() <= now;
    slots.push({
      start: slotStart.toISOString(),
      end: slotEnd.toISOString(),
      available: !conflict && !inPast,
      conflictWith: conflict ? conflict.title : inPast ? "Past" : null,
    });
  }

  return jsonOk({
    date,
    timezone,
    durationMinutes: duration,
    workingHours: { start: "09:00", end: "17:30" },
    slots,
    note: "Internal availability only — external calendar sync is not connected.",
  });
});
