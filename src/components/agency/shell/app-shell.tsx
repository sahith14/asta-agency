"use client";

/**
 * AgencyOS — application chrome: fixed sidebar (desktop), Sheet drawer
 * (mobile), topbar with back/search/notifications/account, footer and the
 * state-driven content switch (no URLs — the whole app is one route).
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, LogOut, Menu, Search, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { label } from "@/lib/types";
import { initials } from "@/components/agency/shared/record-list-helpers";
import { resetNavigationAfterSignOut, useAppStore } from "@/components/agency/store";
import {
  VIEW_TITLES,
  isNavActive,
  navGroupsForRole,
  type NavGroup,
  type NavItem,
} from "@/components/agency/shell/nav-config";
import { CommandPalette } from "@/components/agency/shell/command-palette";
import { NotificationsPopover } from "@/components/agency/shell/notifications-popover";
import { VIEW_COMPONENTS } from "@/components/agency/views/registry";

// ---------------------------------------------------------------------------
// Sidebar pieces (shared by desktop aside and mobile Sheet)
// ---------------------------------------------------------------------------

function BrandBlock() {
  return (
    <div className="flex min-w-0 items-center gap-2.5 px-1">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary">
        { }
        <img src="/logo.svg" alt="" className="size-5" />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm font-semibold tracking-tight">AgencyOS</span>
        <span className="block text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
          Operations
        </span>
      </span>
    </div>
  );
}

function NavButton({
  item,
  planned,
  onNavigate,
}: {
  item: NavItem;
  planned?: boolean;
  onNavigate: () => void;
}) {
  const view = useAppStore((s) => s.view);
  const active = !planned && isNavActive(item, view);
  const Icon = item.icon;

  const button = (
    <button
      type="button"
      // Not the HTML disabled attribute: disabled buttons don't fire pointer
      // events, so the "planned" tooltip would never appear.
      aria-disabled={planned || undefined}
      aria-current={active ? "page" : undefined}
      onClick={planned ? undefined : onNavigate}
      className={cn(
        "relative flex min-h-9 w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium outline-none transition-colors",
        planned && "cursor-not-allowed opacity-60",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )}
    >
      {active ? (
        <span
          aria-hidden
          className="absolute top-1/2 left-0 h-4.5 w-0.5 -translate-y-1/2 rounded-full bg-primary"
        />
      ) : null}
      <Icon aria-hidden className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
      {planned ? (
        <span className="shrink-0 rounded-full border border-border px-1.5 py-px text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          Soon
        </span>
      ) : null}
    </button>
  );

  if (!planned) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" className="max-w-56">
        Planned for a later phase — not yet implemented
      </TooltipContent>
    </Tooltip>
  );
}

function SidebarNav({
  groups,
  onNavigate,
}: {
  groups: NavGroup[];
  onNavigate?: () => void;
}) {
  const navigate = useAppStore((s) => s.navigate);
  return (
    <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 py-4">
      {groups.map((group) => (
        <div key={group.id} className="mb-5 last:mb-0">
          <p className="mb-1.5 px-3 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.items.map((item) => (
              <NavButton
                key={group.id + item.label}
                item={item}
                planned={group.planned}
                onNavigate={() => {
                  navigate(item.view);
                  onNavigate?.();
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Account menu (sidebar bottom block + topbar avatar)
// ---------------------------------------------------------------------------

function UserMenu({
  trigger,
  align = "end",
  side,
}: {
  trigger: ReactNode;
  align?: "start" | "end";
  side?: "top" | "bottom";
}) {
  const user = useAppStore((s) => s.user);
  const navigate = useAppStore((s) => s.navigate);
  const setUser = useAppStore((s) => s.setUser);
  const [signingOut, setSigningOut] = useState(false);

  if (!user) return null;

  async function signOut() {
    setSigningOut(true);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) throw new Error("Sign out failed");
      resetNavigationAfterSignOut(); // never land the next user in a stale view
      setUser(null); // returns to the login gate
    } catch {
      toast.error("Could not sign out", { description: "Please try again." });
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side} className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-medium">{user.displayName}</span>
          <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate("settings")}>
          <Settings2 aria-hidden />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          disabled={signingOut}
          onSelect={(event) => {
            event.preventDefault();
            void signOut();
          }}
        >
          <LogOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AccountAvatar({ className }: { className?: string }) {
  const user = useAppStore((s) => s.user);
  return (
    <Avatar className={cn("size-8", className)}>
      <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
        {initials(user?.displayName ?? "?")}
      </AvatarFallback>
    </Avatar>
  );
}

function SidebarUserBlock() {
  const user = useAppStore((s) => s.user);
  if (!user) return null;
  return (
    <div className="border-t border-sidebar-border p-3">
      <UserMenu
        align="start"
        side="top"
        trigger={
          <button
            type="button"
            className="flex min-h-11 w-full items-center gap-3 rounded-md p-2 text-left outline-none transition-colors hover:bg-sidebar-accent/60 focus-visible:ring-2 focus-visible:ring-ring lg:min-h-9"
          >
            <AccountAvatar />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-medium">{user.displayName}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {label(user.role)}
              </span>
            </span>
          </button>
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// App shell
// ---------------------------------------------------------------------------

export function AppShell() {
  const view = useAppStore((s) => s.view);
  const params = useAppStore((s) => s.params);
  const history = useAppStore((s) => s.history);
  const back = useAppStore((s) => s.back);
  const setSearchOpen = useAppStore((s) => s.setSearchOpen);
  const user = useAppStore((s) => s.user);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Phase 5 — role-aware navigation (unknown/legacy roles → overview only).
  const navGroups = useMemo(
    () => navGroupsForRole(user?.role),
    [user?.role],
  );

  // Global shortcuts: ⌘K / Ctrl+K anywhere, "/" when not typing in a field.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const target = event.target as HTMLElement | null;
        const typing =
          !!target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.tagName === "SELECT" ||
            target.isContentEditable);
        if (!typing) {
          event.preventDefault();
          setSearchOpen(true);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setSearchOpen]);

  const View = VIEW_COMPONENTS[view];
  const viewKey = `${view}:${JSON.stringify(params)}`;

  return (
    <div className="flex h-svh bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border px-4">
          <BrandBlock />
        </div>
        <SidebarNav groups={navGroups} />
        <SidebarUserBlock />
      </aside>

      {/* Mobile navigation drawer */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-72 gap-0 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border px-4">
            <BrandBlock />
          </div>
          <SidebarNav groups={navGroups} onNavigate={() => setMobileNavOpen(false)} />
          <SidebarUserBlock />
        </SheetContent>
      </Sheet>

      {/* Content column */}
      <div className="flex h-full min-w-0 flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-1.5 border-b bg-background/90 px-4 backdrop-blur lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="size-11 lg:hidden lg:size-9"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </Button>
          {history.length > 0 ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-11 lg:size-9"
              onClick={back}
              aria-label="Go back"
            >
              <ArrowLeft className="size-4" />
            </Button>
          ) : null}
          <h1 className="min-w-0 truncate text-sm font-semibold tracking-tight">
            {VIEW_TITLES[view]}
          </h1>

          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="outline"
              onClick={() => setSearchOpen(true)}
              className="hidden h-9 gap-2 pr-2.5 font-normal text-muted-foreground lg:inline-flex"
            >
              <Search className="size-4" />
              Search
              <kbd className="pointer-events-none rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                ⌘K
              </kbd>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSearchOpen(true)}
              aria-label="Search"
              className="size-11 lg:hidden"
            >
              <Search className="size-5" />
            </Button>
            <NotificationsPopover />
            <UserMenu
              trigger={
                <button
                  type="button"
                  aria-label="Account menu"
                  className="flex size-11 items-center justify-center rounded-full outline-none transition-colors hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring lg:size-9"
                >
                  <AccountAvatar />
                </button>
              }
            />
          </div>
        </header>

        <main
          data-app-main
          className="scrollbar-thin flex-1 overflow-y-auto"
        >
          {/* key resets view state + scroll position per navigation */}
          <div key={viewKey} className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <View />
          </div>
        </main>

        <footer className="shrink-0 border-t px-4 py-2.5 lg:px-6">
          <div className="flex flex-col gap-0.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>AgencyOS — Core Operations (Phase 1)</span>
            {user ? <span className="truncate">Signed in as {user.email}</span> : null}
          </div>
        </footer>
      </div>

      <CommandPalette />
    </div>
  );
}
