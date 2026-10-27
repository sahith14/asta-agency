"use client";

/**
 * AgencyOS — dashboard quick actions.
 *
 * params.create CONVENTION (Tasks 4-a/4-b/4-c): "New X" actions navigate to
 * the matching list view with `{ create: "1" }`; that view auto-opens its
 * create dialog on mount (TasksView also accepts clientId/clientName params).
 */
import {
  Building2,
  ChevronRight,
  Database,
  FolderKanban,
  Globe,
  ListTodo,
  Plus,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAppStore } from "@/components/agency/store";

function useQuickActions() {
  const navigate = useAppStore((s) => s.navigate);
  const setSearchOpen = useAppStore((s) => s.setSearchOpen);

  return {
    newClient: () => navigate("clients", { create: "1" }),
    newWebsite: () => navigate("websites", { create: "1" }),
    newProject: () => navigate("projects", { create: "1" }),
    newTask: () => navigate("tasks", { create: "1" }),
    openSettings: () => navigate("settings"),
    openSearch: () => setSearchOpen(true),
  };
}

/** Compact "Create" dropdown used in the dashboard header. */
export function QuickActionsMenu() {
  const actions = useQuickActions();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label="Quick actions">
          <Plus aria-hidden />
          Create
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={actions.newClient}>
          <Building2 aria-hidden />
          New client
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={actions.newWebsite}>
          <Globe aria-hidden />
          New website
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={actions.newProject}>
          <FolderKanban aria-hidden />
          New project
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={actions.newTask}>
          <ListTodo aria-hidden />
          New task
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Bottom-of-dashboard card with large, honest action rows. */
export function QuickActionsCard({ isEmpty }: { isEmpty: boolean }) {
  const actions = useQuickActions();

  const rows: { label: string; description: string; icon: typeof Plus; onClick: () => void }[] = [
    {
      label: "New client",
      description: "Add a business to your workspace",
      icon: Building2,
      onClick: actions.newClient,
    },
    {
      label: "New website",
      description: "Register a site for an existing client",
      icon: Globe,
      onClick: actions.newWebsite,
    },
    {
      label: "New project",
      description: "Plan a piece of client work",
      icon: FolderKanban,
      onClick: actions.newProject,
    },
    {
      label: "New task",
      description: "Create a to-do for the team",
      icon: ListTodo,
      onClick: actions.newTask,
    },
  ];

  if (isEmpty) {
    rows.push({
      label: "Load sample data",
      description: "Clearly-labelled demo records — opens Settings",
      icon: Database,
      onClick: actions.openSettings,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Quick actions</CardTitle>
        <CardDescription>Common tasks, one click away</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row) => (
          <button
            key={row.label}
            type="button"
            onClick={row.onClick}
            className="record-row flex w-full items-center gap-3 rounded-lg border p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
              <row.icon aria-hidden className="size-4 text-primary" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{row.label}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {row.description}
              </span>
            </span>
            <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          </button>
        ))}
        <button
          type="button"
          onClick={actions.openSearch}
          className="record-row flex w-full items-center gap-3 rounded-lg border p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
            <Search aria-hidden className="size-4 text-primary" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">Open global search</span>
            <span className="block truncate text-xs text-muted-foreground">
              Find clients, websites, projects and tasks
            </span>
          </span>
          <kbd className="shrink-0 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            ⌘K
          </kbd>
        </button>
      </CardContent>
    </Card>
  );
}
