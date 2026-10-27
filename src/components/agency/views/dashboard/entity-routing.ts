/**
 * AgencyOS — shared entity routing + tiny presentation maps used by the
 * dashboard cards, the activity timeline and the client-detail tabs.
 *
 * Routing rule (spec): TASK rows open the tasks LIST (task detail is a drawer
 * inside TasksView); CLIENT/WEBSITE/PROJECT rows open their detail views.
 */
import { CircleCheckBig, Flag, FolderKanban, Globe, type LucideIcon } from "lucide-react";
import { openClient, openProject, openWebsite, useAppStore } from "@/components/agency/store";

export function openEntityRoute(entityType: string, entityId: string | null | undefined): void {
  if (!entityId) return;
  switch (entityType) {
    case "CLIENT":
      openClient(entityId);
      break;
    case "WEBSITE":
      openWebsite(entityId);
      break;
    case "PROJECT":
      openProject(entityId);
      break;
    case "TASK":
      useAppStore.getState().navigate("tasks");
      break;
    default:
      break;
  }
}

/** Severity dot colours for dashboard priority-queue rows. */
export const SEVERITY_DOT: Record<string, string> = {
  CRITICAL: "bg-destructive",
  HIGH: "bg-warning",
  NORMAL: "bg-muted-foreground/40",
};

/** Icons for dashboard "upcoming deadlines" entry kinds. */
export const DEADLINE_KIND_ICON: Record<string, LucideIcon> = {
  TASK: CircleCheckBig,
  PROJECT: FolderKanban,
  MILESTONE: Flag,
  DOMAIN: Globe,
};

/** Timeline dot colours per activity entityType (spec palette). */
export const ENTITY_TYPE_DOT: Record<string, string> = {
  CLIENT: "bg-primary",
  WEBSITE: "bg-success",
  PROJECT: "bg-warning",
  TASK: "bg-primary",
  DOCUMENT: "bg-muted-foreground/40",
  SETTINGS: "bg-destructive/70",
  AUTH: "bg-muted-foreground/40",
};

/** Human names for activity entity types (label() has no entries for them). */
export const ENTITY_TYPE_LABEL: Record<string, string> = {
  CLIENT: "Client",
  WEBSITE: "Website",
  PROJECT: "Project",
  TASK: "Task",
  DOCUMENT: "Document",
  CONTACT: "Contact",
  MILESTONE: "Milestone",
  DOMAIN: "Domain",
  SETTINGS: "Settings",
  AUTH: "Auth",
  AUDIT: "Audit",
};

export function prettyEntityType(value: string): string {
  return ENTITY_TYPE_LABEL[value] ?? value;
}
