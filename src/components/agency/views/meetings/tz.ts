/**
 * AgencyOS — timezone helpers for the internal meeting scheduler.
 *
 * Meetings record an explicit timezone; `scheduledAt` is stored as a UTC
 * instant. The picked wall-clock time is interpreted in the CHOSEN timezone
 * (not the browser's), so a "14:30 Europe/Paris" meeting lands at the right
 * instant even when the booking browser is in London.
 */

/** Offset (ms) of `timeZone` at the given instant. */
function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) map[part.type] = part.value;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour) % 24,
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - date.getTime();
}

/**
 * "2025-08-12" + "14:30" + "Europe/Paris" → ISO instant.
 * Returns null for malformed input.
 */
export function zonedTimeToIso(
  dateStr: string,
  timeStr: string,
  timeZone: string,
): string | null {
  if (!dateStr || !timeStr || !timeZone) return null;
  const naive = Date.parse(`${dateStr}T${timeStr}:00Z`);
  if (Number.isNaN(naive)) return null;
  const offset = tzOffsetMs(new Date(naive), timeZone);
  return new Date(naive - offset).toISOString();
}

/** ISO instant → wall-clock "HH:mm" in the given timezone. */
export function isoToZonedTime(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hour === "24" ? "00" : hour}:${minute}`;
}

/** ISO instant → "YYYY-MM-DD" (the calendar day) in the given timezone. */
export function isoToZonedDate(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

/** ISO instant → "12 Aug 2025, 14:30" wall-clock in the given timezone. */
export function formatInTz(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Parse a comma-separated attendee list into a clean string[]. */
export function parseAttendees(raw: string): string[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
