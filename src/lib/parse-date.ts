/**
 * AgencyOS — tolerant date parsing for API inputs.
 * Accepts: ISO strings, "YYYY-MM-DD" (date inputs), "YYYY-MM-DDTHH:mm"
 * (datetime-local inputs). Returns null for empty/invalid values.
 */
export function toDateOrNull(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}
