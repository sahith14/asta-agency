/**
 * AgencyOS — global navigation + auth store.
 *
 * The sandbox exposes a single route (`/`), so ALL navigation is state-driven.
 * `navigate()` pushes the current snapshot onto `history`; `back()` pops it.
 * Detail views read `params.id` from this store (e.g. client-detail).
 */
import { create } from "zustand";
import { canAccessModule } from "@/components/agency/shared/role-matrix";

export type ViewName =
  | "dashboard"
  | "clients"
  | "client-detail"
  | "websites"
  | "website-detail"
  | "projects"
  | "project-detail"
  | "inbox"
  | "support"
  | "ticket-detail"
  | "billing"
  | "invoice-detail"
  | "quote-detail"
  | "subscription-detail"
  | "tasks"
  | "documents"
  | "settings"
  | "activity"
  // Phase 4 — operations
  | "monitoring"
  | "incidents"
  | "incident-detail"
  | "maintenance"
  | "deployments"
  // Phase 5 — pipeline (Team lives in Settings; no standalone staff view)
  | "briefs"
  | "brief-detail"
  | "meetings";

/**
 * Client-safe mirror of the server `SessionUser` (src/lib/auth.ts).
 * Kept here so client components never import server-only modules.
 */
export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
}

export interface ViewSnapshot {
  view: ViewName;
  params: Record<string, string>;
}

/** Scroll the app's <main> element back to the top after a navigation. */
function scrollMainToTop(): void {
  if (typeof document === "undefined") return;
  document.querySelector("[data-app-main]")?.scrollTo({ top: 0 });
}

interface AppStore {
  view: ViewName;
  params: Record<string, string>;
  history: ViewSnapshot[];
  searchOpen: boolean;
  user: SessionUser | null;
  authChecked: boolean;
  /** Pushes the current view onto history, switches view, scrolls main to top. */
  navigate: (view: ViewName, params?: Record<string, string>) => void;
  /** Pops history; falls back to dashboard when history is empty. */
  back: () => void;
  setSearchOpen: (open: boolean) => void;
  setUser: (u: SessionUser | null) => void;
  setAuthChecked: (v: boolean) => void;
}

export const useAppStore = create<AppStore>()((set, get) => ({
  view: "dashboard",
  params: {},
  history: [],
  searchOpen: false,
  user: null,
  authChecked: false,

  navigate: (view, params = {}) => {
    const current = get();
    const sameTarget =
      current.view === view && JSON.stringify(current.params) === JSON.stringify(params);
    if (sameTarget) {
      // Re-selecting the current view: just scroll up, don't grow history.
      scrollMainToTop();
      return;
    }
    set({
      history: [...current.history, { view: current.view, params: current.params }],
      view,
      params,
    });
    scrollMainToTop();
  },

  back: () => {
    const current = get();
    if (current.history.length === 0) {
      if (current.view !== "dashboard") {
        set({ view: "dashboard", params: {} });
        scrollMainToTop();
      }
      return;
    }
    const history = [...current.history];
    const previous = history.pop();
    if (!previous) return;
    set({ history, view: previous.view, params: previous.params });
    scrollMainToTop();
  },

  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setUser: (user) => set({ user }),
  setAuthChecked: (authChecked) => set({ authChecked }),
}));

// ---------------------------------------------------------------------------
// Convenience navigation helpers (usable from any client component)
// ---------------------------------------------------------------------------

export const openClient = (id: string) => useAppStore.getState().navigate("client-detail", { id });
export const openWebsite = (id: string) => useAppStore.getState().navigate("website-detail", { id });
export const openProject = (id: string) => useAppStore.getState().navigate("project-detail", { id });
export const openTicket = (id: string) => useAppStore.getState().navigate("ticket-detail", { id });
export const openBilling = (tab: string, params?: Record<string, string>) =>
  useAppStore.getState().navigate("billing", { tab, ...params });
export const openInvoice = (id: string) =>
  useAppStore.getState().navigate("invoice-detail", { id });
export const openQuote = (id: string) => useAppStore.getState().navigate("quote-detail", { id });
export const openSubscription = (id: string) =>
  useAppStore.getState().navigate("subscription-detail", { id });
// Standalone navigate helper (store-method twin for non-hook call sites).
export const navigate = (view: ViewName, params?: Record<string, string>) =>
  useAppStore.getState().navigate(view, params);

// Phase 4 — operations helpers
export const openIncident = (id: string) =>
  useAppStore.getState().navigate("incident-detail", { id });
export const openMonitoring = (tab?: string, params?: Record<string, string>) =>
  useAppStore
    .getState()
    .navigate("monitoring", { ...(tab ? { tab } : {}), ...params });
export const openMaintenance = (tab?: string, params?: Record<string, string>) =>
  useAppStore
    .getState()
    .navigate("maintenance", { ...(tab ? { tab } : {}), ...params });
export const openDeployments = (params?: Record<string, string>) =>
  useAppStore.getState().navigate("deployments", params ?? {});

// Phase 5 — pipeline helpers
export const openBrief = (id: string) =>
  useAppStore.getState().navigate("brief-detail", { id });
export const openBriefs = (params?: Record<string, string>) =>
  useAppStore.getState().navigate("briefs", params ?? {});
export const openMeetings = (params?: Record<string, string>) =>
  useAppStore.getState().navigate("meetings", params ?? {});

/**
 * Reset navigation state after sign-out: the next sign-in (any role) must
 * land on the overview, never on the previous user's deep-linked view.
 */
export function resetNavigationAfterSignOut(): void {
  useAppStore.setState({ view: "dashboard", params: {}, history: [] });
}

// ---------------------------------------------------------------------------
// Client-side role gate (Phase 5)
// ---------------------------------------------------------------------------

/**
 * Client-safe module gate mirroring the frozen server matrix (src/lib/rbac.ts).
 * UI-only convenience — the server remains the enforcement layer. The founder
 * (OWNER) always passes; unknown/legacy roles are deny-by-default (STAFF).
 */
export function useCanAccessModule(module: string): boolean {
  const role = useAppStore((s) => s.user?.role ?? null);
  return canAccessModule(role, module);
}
