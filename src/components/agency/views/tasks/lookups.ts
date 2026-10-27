"use client";

/**
 * AgencyOS — lookup hooks + tiny conversion helpers shared by the Tasks,
 * Documents and Settings views (all owned by task 4-c).
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  apiFetch,
  type ClientRecord,
  type Paginated,
  type ProjectRecord,
  type UserRecord,
  type WebsiteRecord,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Debounce (used by every search input in the filter bars)
// ---------------------------------------------------------------------------

export function useDebouncedValue<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ---------------------------------------------------------------------------
// Lookups (assignee picker, client filter, link cascades)
// ---------------------------------------------------------------------------

export function useClientsLookup() {
  return useQuery({
    queryKey: ["clients", "lookup"],
    queryFn: () =>
      apiFetch<Paginated<ClientRecord>>(
        `/api/clients${buildLookupQuery({ pageSize: 100, sort: "businessName", dir: "asc" })}`,
      ),
    staleTime: 60_000,
    select: (data) => data.items,
  });
}

export function useUsersLookup() {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => apiFetch<UserRecord[]>("/api/users"),
    staleTime: 60_000,
  });
}

/** Websites for the link cascades; filtered by client when one is chosen. */
export function useWebsitesLookup(clientId: string) {
  return useQuery({
    queryKey: ["websites", "lookup", clientId || "all"],
    queryFn: () =>
      apiFetch<Paginated<WebsiteRecord>>(
        `/api/websites${buildLookupQuery({ pageSize: 100, clientId: clientId || undefined, sort: "name", dir: "asc" })}`,
      ),
    staleTime: 60_000,
    select: (data) => data.items,
  });
}

/** Projects for the link cascades; filtered by client when one is chosen. */
export function useProjectsLookup(clientId: string) {
  return useQuery({
    queryKey: ["projects", "lookup", clientId || "all"],
    queryFn: () =>
      apiFetch<Paginated<ProjectRecord>>(
        `/api/projects${buildLookupQuery({ pageSize: 100, clientId: clientId || undefined, sort: "name", dir: "asc" })}`,
      ),
    staleTime: 60_000,
    select: (data) => data.items,
  });
}

function buildLookupQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

// ---------------------------------------------------------------------------
// Lazy display names for deep-link filter chips
// ---------------------------------------------------------------------------

export type RefKind = "client" | "website" | "project";

/**
 * Resolves the display name behind a deep-linked id. Uses the name passed in
 * params when available, otherwise fetches the record once.
 */
export function useRefName(
  kind: RefKind,
  id: string | null | undefined,
  fallbackName?: string,
): string | null {
  const query = useQuery({
    queryKey: ["ref-name", kind, id],
    queryFn: async (): Promise<string> => {
      if (kind === "client") {
        const data = await apiFetch<{ client: ClientRecord }>(`/api/clients/${id}`);
        return data.client.businessName;
      }
      if (kind === "website") {
        const data = await apiFetch<{ website: WebsiteRecord }>(`/api/websites/${id}`);
        return data.website.name;
      }
      const data = await apiFetch<{ project: ProjectRecord }>(`/api/projects/${id}`);
      return data.project.name;
    },
    enabled: !!id && !fallbackName,
    staleTime: 60_000,
    retry: false,
  });
  if (!id) return null;
  if (fallbackName) return fallbackName;
  // On fetch failure, show the raw id rather than pretending it is still loading.
  return query.data ?? (query.isError ? id : null);
}

// ---------------------------------------------------------------------------
// datetime-local <-> ISO (due date inputs)
// ---------------------------------------------------------------------------

/** ISO string -> "YYYY-MM-DDTHH:mm" in the browser's local time ("" when absent). */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "YYYY-MM-DDTHH:mm" (local, no offset) -> ISO string (null when empty/invalid). */
export function localInputToIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

// ---------------------------------------------------------------------------
// Upload allowlist hint (documents view — mirrors the server allowlist)
// ---------------------------------------------------------------------------

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ALLOWED_MIME_HINT = "PDF, PNG, JPEG, WebP, GIF, TXT, CSV, JSON, ZIP, DOCX, XLSX";

const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
  zip: "application/zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/** True when the browser-reported MIME type or the file extension is allowlisted. */
export function mimeLooksAllowed(file: { name: string; type: string }): boolean {
  if (file.type && Object.values(EXT_MIME).includes(file.type)) return true;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ext in EXT_MIME;
}
