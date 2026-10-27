/**
 * AgencyOS — sidebar / topbar navigation definition.
 *
 * Phase 5: navigation is ROLE-AWARE. `navGroupsForRole(role)` implements the
 * frozen access matrix (see src/lib/rbac.ts + shared/role-matrix.ts); the
 * full NAV_GROUPS list is kept for compatibility (command palette defaults,
 * tests of record). PLANNED items are NOT implemented — they render disabled
 * with a "Soon" badge and a tooltip, per spec: never present inactive links
 * as working.
 */
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CreditCard,
  Files,
  FileText,
  FolderKanban,
  Globe,
  History,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  ListTodo,
  Plug,
  Radar,
  Rocket,
  Users,
  Workflow,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ViewName } from "@/components/agency/store";

export interface NavItem {
  /** Target view. For planned items this is a placeholder (never navigated). */
  view: ViewName;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  id: string;
  label: string;
  /** Planned groups render every item disabled. */
  planned?: boolean;
  items: NavItem[];
}

/** Every implemented module item, in sidebar order. */
const OPERATIONS_ITEMS: NavItem[] = [
  { view: "dashboard", label: "Overview", icon: LayoutDashboard },
  { view: "inbox", label: "Inbox", icon: Inbox },
  { view: "support", label: "Support", icon: LifeBuoy },
  { view: "clients", label: "Clients", icon: Users },
  // Phase 5 — pipeline
  { view: "briefs", label: "Briefs", icon: FileText },
  { view: "meetings", label: "Meetings", icon: CalendarDays },
  // Core operations
  { view: "websites", label: "Websites", icon: Globe },
  { view: "projects", label: "Projects", icon: FolderKanban },
  { view: "billing", label: "Billing", icon: CreditCard },
  { view: "monitoring", label: "Monitoring", icon: Radar },
  { view: "incidents", label: "Incidents", icon: AlertTriangle },
  { view: "maintenance", label: "Maintenance", icon: Wrench },
  { view: "deployments", label: "Deployments", icon: Rocket },
  { view: "tasks", label: "Tasks", icon: ListTodo },
  { view: "documents", label: "Documents", icon: Files },
  { view: "activity", label: "Activity", icon: History },
];

/** Planned group — founder-only visibility, never navigates. */
const PLANNED_GROUP: NavGroup = {
  id: "planned",
  label: "Planned",
  planned: true,
  items: [
    // `view` is unused for planned items — they never navigate.
    { view: "dashboard", label: "Reports", icon: BarChart3 },
    { view: "dashboard", label: "Integrations", icon: Plug },
    { view: "dashboard", label: "Automations", icon: Workflow },
  ],
};

/** Full static list (founder view) — kept for compatibility. */
export const NAV_GROUPS: NavGroup[] = [
  { id: "operations", label: "Operations", items: OPERATIONS_ITEMS },
  PLANNED_GROUP,
];

/**
 * Sidebar view keys per role — implements the frozen Phase 5 access matrix.
 * The founder (OWNER) gets EVERYTHING including the Planned group; STAFF
 * (legacy) gets the overview only. Settings is reached from the user menu.
 */
const ROLE_VIEW_KEYS: Record<string, readonly string[]> = {
  OWNER: OPERATIONS_ITEMS.map((item) => item.view),
  CLIENT_MANAGER: ["dashboard", "clients", "briefs", "meetings", "tasks"],
  WEB_DEVELOPER: [
    "dashboard", "tasks", "projects", "websites", "support", "monitoring",
    "incidents", "maintenance", "deployments", "documents", "briefs",
  ],
  SUPPORT_FINANCE: ["dashboard", "support", "clients", "billing", "websites", "monitoring", "incidents"],
  // Legacy role — overview only (+ Settings via the account menu).
  STAFF: ["dashboard"],
};

/** Role-aware navigation groups (Phase 5). Unknown roles → STAFF (deny). */
export function navGroupsForRole(role: string | null | undefined): NavGroup[] {
  const keys = ROLE_VIEW_KEYS[role ?? ""] ?? ROLE_VIEW_KEYS.STAFF;
  const groups: NavGroup[] = [
    {
      id: "operations",
      label: "Operations",
      items: OPERATIONS_ITEMS.filter((item) => keys.includes(item.view)),
    },
  ];
  if (role === "OWNER") groups.push(PLANNED_GROUP);
  return groups;
}

/** Topbar title per view (detail views are named by their module). */
export const VIEW_TITLES: Record<ViewName, string> = {
  dashboard: "Overview",
  inbox: "Inbox",
  support: "Support",
  "ticket-detail": "Ticket",
  billing: "Billing",
  "invoice-detail": "Invoice",
  "quote-detail": "Quote",
  "subscription-detail": "Subscription",
  clients: "Clients",
  "client-detail": "Client",
  websites: "Websites",
  "website-detail": "Website",
  projects: "Projects",
  "project-detail": "Project",
  tasks: "Tasks",
  documents: "Documents",
  settings: "Settings",
  activity: "Activity",
  monitoring: "Monitoring",
  incidents: "Incidents",
  "incident-detail": "Incident",
  maintenance: "Maintenance",
  deployments: "Deployments",
  // Phase 5 — pipeline
  briefs: "Briefs",
  "brief-detail": "Brief",
  meetings: "Meetings",
};

/** Detail views highlight their parent module in the sidebar. */
export function isNavActive(item: NavItem, view: ViewName): boolean {
  const parentOfDetail: Partial<Record<ViewName, ViewName>> = {
    "client-detail": "clients",
    "website-detail": "websites",
    "project-detail": "projects",
    "ticket-detail": "support",
    "invoice-detail": "billing",
    "quote-detail": "billing",
    "subscription-detail": "billing",
    "incident-detail": "incidents",
    "brief-detail": "briefs",
  };
  return item.view === view || item.view === parentOfDetail[view];
}
