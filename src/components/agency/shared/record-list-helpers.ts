/**
 * AgencyOS — tiny helpers shared by record list views.
 */

/**
 * Builds a query string from a params object, skipping empty values.
 * Returns "" when nothing is set, otherwise "?a=1&b=2" (urlencoded).
 */
export function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (!text) continue;
    search.set(key, text);
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

/** "Ada Lovelace" -> "AL"; "Madonna" -> "M"; "" -> "?". */
export function initials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const result = parts
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  return result || "?";
}
