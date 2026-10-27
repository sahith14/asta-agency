/**
 * AgencyOS — client-safe copy of the Phase 5 role→module READ matrix.
 *
 * KEEP IN SYNC with the frozen matrix in src/lib/rbac.ts (server-only, cannot
 * be imported from client components). This copy exists purely so the UI can
 * hide/gate modules the signed-in role cannot read; the SERVER remains the
 * enforcement layer (deny by default) — this file must never be treated as one.
 */

export const READ_MODULES: Record<string, readonly string[]> = {
  // Informational — OWNER bypasses every check anyway (superuser).
  OWNER: [
    "dashboard", "clients", "briefs", "meetings", "websites", "projects", "tasks",
    "support", "billing", "monitoring", "incidents", "maintenance", "deployments",
    "inbox", "documents", "users", "activity", "settings", "notifications", "search",
  ],
  CLIENT_MANAGER: ["dashboard", "clients", "briefs", "meetings", "tasks", "notifications", "search"],
  WEB_DEVELOPER: [
    "dashboard", "tasks", "projects", "websites", "support", "monitoring",
    "incidents", "maintenance", "deployments", "briefs", "notifications", "search", "documents",
  ],
  SUPPORT_FINANCE: [
    "dashboard", "support", "clients", "billing", "websites", "projects",
    "monitoring", "incidents", "tasks", "notifications", "search",
  ],
  // Legacy pre-Phase 5 role — deny-by-default (dashboard + own profile only).
  STAFF: ["dashboard", "notifications"],
};

/**
 * True when `role` may READ `module`. OWNER passes everything; unknown or
 * missing roles fall back to STAFF (deny-by-default).
 */
export function canAccessModule(role: string | null | undefined, module: string): boolean {
  if (role === "OWNER") return true;
  const list = READ_MODULES[role ?? ""] ?? READ_MODULES.STAFF;
  return list.includes(module);
}
