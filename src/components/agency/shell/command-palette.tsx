"use client";

/**
 * AgencyOS — global search / command palette (⌘K or "/").
 *
 * No query  -> module quick actions.
 * Query ≥ 2 chars (debounced 250ms) -> GET /api/search grouped results.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  FolderKanban,
  Globe,
  LifeBuoy,
  ListTodo,
  Loader2,
  SearchX,
  User,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { apiFetch, label, type SearchResults } from "@/lib/types";
import {
  openClient,
  openProject,
  openTicket,
  openWebsite,
  useAppStore,
  type ViewName,
} from "@/components/agency/store";
import { navGroupsForRole, type NavItem } from "@/components/agency/shell/nav-config";

export function CommandPalette() {
  const searchOpen = useAppStore((s) => s.searchOpen);
  const setSearchOpen = useAppStore((s) => s.setSearchOpen);
  const navigate = useAppStore((s) => s.navigate);
  const user = useAppStore((s) => s.user);

  // Phase 5 — quick actions are role-aware: employees cannot palette-jump
  // into modules their role cannot read (mirrors the sidebar matrix).
  const quickActions = useMemo<NavItem[]>(() => {
    const seen = new Set<string>();
    const items: NavItem[] = [];
    for (const group of navGroupsForRole(user?.role)) {
      if (group.planned) continue; // never offered as a navigation target
      for (const item of group.items) {
        const key = `${item.view}:${item.label}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push(item);
      }
    }
    return items;
  }, [user?.role]);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Debounce the server query.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  /** Single close path: closes the dialog and resets the query state. */
  function handleOpenChange(open: boolean) {
    setSearchOpen(open);
    if (!open) {
      setQuery("");
      setDebouncedQuery("");
    }
  }

  const shouldSearch = debouncedQuery.length >= 2;
  const { data, isFetching, error } = useQuery({
    queryKey: ["command-search", debouncedQuery],
    queryFn: () => apiFetch<SearchResults>(`/api/search?q=${encodeURIComponent(debouncedQuery)}`),
    enabled: searchOpen && shouldSearch,
  });

  const close = () => handleOpenChange(false);
  const goTo = (view: ViewName) => {
    close();
    navigate(view);
  };

  const results = shouldSearch && !error ? data : undefined;
  const hasResults =
    !!results &&
    (results.clients.length > 0 ||
      results.contacts.length > 0 ||
      results.websites.length > 0 ||
      results.projects.length > 0 ||
      results.tasks.length > 0 ||
      results.tickets.length > 0);

  return (
    <CommandDialog
      open={searchOpen}
      onOpenChange={handleOpenChange}
      title="Search AgencyOS"
      description="Search clients, contacts, websites, projects and tasks, or jump to a module."
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search or jump to…"
      />
      <CommandList>
        {shouldSearch && isFetching ? (
          <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Searching…
          </div>
        ) : null}

        {shouldSearch && error && !isFetching ? (
          <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
            <SearchX className="size-4" aria-hidden />
            Could not run the search. Try again in a moment.
          </div>
        ) : null}

        {/* Server results (rendered above quick actions while searching). */}
        {results?.clients && results.clients.length > 0 ? (
          <CommandGroup heading="Clients">
            {results.clients.map((client) => (
              <CommandItem
                key={`client-${client.id}`}
                value={`client ${client.businessName} ${label(client.status)}`}
                onSelect={() => {
                  close();
                  openClient(client.id);
                }}
              >
                <Building2 aria-hidden />
                <span className="min-w-0 flex-1 truncate">{client.businessName}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {label(client.status)}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {results?.contacts && results.contacts.length > 0 ? (
          <CommandGroup heading="Contacts">
            {results.contacts.map((contact) => (
              <CommandItem
                key={`contact-${contact.id}`}
                value={`contact ${contact.name} ${contact.clientName} ${contact.email ?? ""}`}
                onSelect={() => {
                  close();
                  openClient(contact.clientId);
                }}
              >
                <User aria-hidden />
                <span className="min-w-0 flex-1 truncate">{contact.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{contact.clientName}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {results?.websites && results.websites.length > 0 ? (
          <CommandGroup heading="Websites">
            {results.websites.map((website) => (
              <CommandItem
                key={`website-${website.id}`}
                value={`website ${website.name} ${website.clientName} ${website.primaryDomain ?? ""}`}
                onSelect={() => {
                  close();
                  openWebsite(website.id);
                }}
              >
                <Globe aria-hidden />
                <span className="min-w-0 flex-1 truncate">{website.name}</span>
                <span className="min-w-0 max-w-40 shrink-0 truncate text-xs text-muted-foreground">
                  {[website.primaryDomain, website.clientName].filter(Boolean).join(" · ")}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {results?.projects && results.projects.length > 0 ? (
          <CommandGroup heading="Projects">
            {results.projects.map((project) => (
              <CommandItem
                key={`project-${project.id}`}
                value={`project ${project.name} ${project.clientName} ${label(project.status)}`}
                onSelect={() => {
                  close();
                  openProject(project.id);
                }}
              >
                <FolderKanban aria-hidden />
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
                <span className="min-w-0 max-w-40 shrink-0 truncate text-xs text-muted-foreground">
                  {[project.clientName, label(project.status)].filter(Boolean).join(" · ")}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {results?.tasks && results.tasks.length > 0 ? (
          <CommandGroup heading="Tasks">
            {results.tasks.map((task) => (
              <CommandItem
                key={`task-${task.id}`}
                value={`task ${task.title} ${label(task.status)}`}
                onSelect={() => goTo("tasks")}
              >
                <ListTodo aria-hidden />
                <span className="min-w-0 flex-1 truncate">{task.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{label(task.status)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {results?.tickets && results.tickets.length > 0 ? (
          <CommandGroup heading="Tickets">
            {results.tickets.map((ticket) => (
              <CommandItem
                key={`ticket-${ticket.id}`}
                value={`ticket TKT-${String(ticket.number).padStart(4, "0")} ${ticket.subject} ${label(ticket.status)}`}
                onSelect={() => {
                  close();
                  openTicket(ticket.id);
                }}
              >
                <LifeBuoy aria-hidden />
                <span className="min-w-0 flex-1 truncate">{ticket.subject}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{label(ticket.status)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {shouldSearch && !isFetching && !error && !hasResults ? (
          <CommandEmpty>No results for “{debouncedQuery}”.</CommandEmpty>
        ) : null}

        {shouldSearch ? <CommandSeparator /> : null}

        <CommandGroup heading="Quick actions">
          {quickActions.map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem
                key={item.view + item.label}
                value={`go to ${item.label}`}
                onSelect={() => goTo(item.view)}
              >
                <Icon aria-hidden />
                <span>{item.label}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
