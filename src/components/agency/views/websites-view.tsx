"use client";

/**
 * AgencyOS — Websites view: the "websites" list AND the "website-detail"
 * detail page (dispatched off the navigation store, per the view registry).
 */
import { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ExternalLink,
  FolderKanban,
  Globe,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/agency/shared/confirm-dialog";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { PageHeader } from "@/components/agency/shared/page-header";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { buildQuery } from "@/components/agency/shared/record-list-helpers";
import {
  openClient,
  openProject,
  openWebsite,
  useAppStore,
} from "@/components/agency/store";
import {
  ActivityTimeline,
} from "@/components/agency/views/websites/activity-timeline";
import { DomainsTab } from "@/components/agency/views/websites/domains-tab";
import { EntityBillingTab } from "@/components/agency/views/billing/entity-billing-tab";
import { WebsiteOperationsTab } from "@/components/agency/views/websites/operations-tab";
import {
  ListSkeleton,
  LoadErrorState,
  MetaSep,
  PaginationFooter,
  SampleBadge,
  daysUntil,
  renewalClasses,
  useDebouncedState,
} from "@/components/agency/views/websites/list-bits";
import { DetailTaskList } from "@/components/agency/views/websites/task-rows";
import {
  WebsiteFormDialog,
  type WebsiteFormValues,
} from "@/components/agency/views/websites/website-form-dialog";
import { apiFetch, label, MAINTENANCE_COVERAGES, WEBSITE_LIFECYCLE } from "@/lib/types";
import type {
  ClientRecord,
  DocumentRecord,
  Paginated,
  ProjectRecord,
  TaskRecord,
  WebsiteRecord,
} from "@/lib/types";
import { fileSize, formatDate, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

export default function WebsitesView() {
  const view = useAppStore((s) => s.view);
  const id = useAppStore((s) => s.params.id);
  if (view === "website-detail") {
    return <WebsiteDetail id={id} />;
  }
  return <WebsitesList />;
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

function WebsitesList() {
  const params = useAppStore((s) => s.params);
  const navigate = useAppStore((s) => s.navigate);

  // Local filter state, seeded once from params (dashboard/nav deep links):
  // params.status → lifecycle (single valid enum only), params.clientId →
  // client, params.create="1" → auto-open create dialog.
  const [searchInput, setSearchInput, search] = useDebouncedState("");
  const [lifecycle, setLifecycle] = useState(() =>
    (WEBSITE_LIFECYCLE as readonly string[]).includes(params.status ?? "") ? params.status : ""
  );
  const [clientFilter, setClientFilter] = useState(() => params.clientId ?? "");
  const [maintenance, setMaintenance] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [sortKey, setSortKey] = useState<"newest" | "name">("newest");
  const [page, setPage] = useState(1);

  const [dialogOpen, setDialogOpen] = useState(params.create === "1");
  const [editTarget, setEditTarget] = useState<WebsiteRecord | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<WebsiteRecord | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<WebsiteRecord | null>(null);

  const queryClient = useQueryClient();

  const clientsQuery = useQuery({
    queryKey: ["clients", { picker: true }],
    queryFn: () => apiFetch<Paginated<ClientRecord>>("/api/clients?pageSize=100"),
  });
  const clients = useMemo(() => clientsQuery.data?.items ?? [], [clientsQuery.data]);

  const sort = sortKey === "name" ? "name" : "createdAt";
  const dir = sortKey === "name" ? "asc" : "desc";

  const query = useQuery({
    queryKey: [
      "websites",
      { page, pageSize: PAGE_SIZE, search, status: lifecycle, clientId: clientFilter, archived: showArchived, sort, dir },
    ],
    queryFn: () =>
      apiFetch<Paginated<WebsiteRecord>>(
        `/api/websites${buildQuery({
          page,
          pageSize: PAGE_SIZE,
          search,
          status: lifecycle,
          clientId: clientFilter,
          archived: showArchived ? "1" : undefined,
          sort,
          dir,
        })}`
      ),
    placeholderData: keepPreviousData,
  });

  // The API has no maintenanceCoverage filter — applied to the current page.
  const items = useMemo(
    () =>
      (query.data?.items ?? []).filter(
        (w) => !maintenance || w.maintenanceCoverage === maintenance
      ),
    [query.data, maintenance]
  );
  const total = query.data?.total ?? 0;
  const hasFilters = Boolean(search || lifecycle || clientFilter || maintenance || showArchived);

  function refreshAfterMutation(website: WebsiteRecord) {
    queryClient.invalidateQueries({ queryKey: ["websites"] });
    queryClient.invalidateQueries({ queryKey: ["website", website.id] });
    queryClient.invalidateQueries({ queryKey: ["client", website.clientId] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  const archiveMutation = useMutation({
    mutationFn: (website: WebsiteRecord) =>
      apiFetch(`/api/websites/${website.id}`, { method: "DELETE" }),
    onSuccess: (_data, website) => {
      toast.success(`Website "${website.name}" archived.`);
      setArchiveTarget(null);
      refreshAfterMutation(website);
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const restoreMutation = useMutation({
    mutationFn: (website: WebsiteRecord) =>
      apiFetch<WebsiteRecord>(`/api/websites/${website.id}/restore`, { method: "POST" }),
    onSuccess: (_data, website) => {
      toast.success(`Website "${website.name}" restored.`);
      setRestoreTarget(null);
      refreshAfterMutation(website);
    },
    onError: (error) => toast.error((error as Error).message),
  });

  /** Close create/edit dialog; strip a params.create intent from the store. */
  function closeDialog() {
    const wasCreateIntent = params.create === "1";
    setDialogOpen(false);
    setEditTarget(null);
    if (wasCreateIntent) {
      // "replace-ish": leave a cleaned websites entry (filters forwarded) so a
      // later back() doesn't re-trigger the create dialog.
      const cleaned: Record<string, string> = {};
      if (lifecycle) cleaned.status = lifecycle;
      if (clientFilter) cleaned.clientId = clientFilter;
      navigate("websites", cleaned);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Websites"
        description={query.data ? `${total} website${total === 1 ? "" : "s"}` : "Loading websites…"}
        actions={
          <>
            <Button
              variant="outline"
              aria-pressed={showArchived}
              className={cn(showArchived && "border-primary/40 bg-primary/10 text-primary")}
              onClick={() => {
                setShowArchived((v) => !v);
                setPage(1);
              }}
            >
              <Archive className="size-4" />
              Archived
            </Button>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="size-4" />
              New website
            </Button>
          </>
        }
      />

      {/* Filters */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
              setPage(1);
            }}
            placeholder="Search name or domain…"
            className="pl-8"
            aria-label="Search websites"
          />
        </div>
        <Select
          value={lifecycle || "ALL"}
          onValueChange={(v) => {
            setLifecycle(v === "ALL" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger aria-label="Filter by lifecycle">
            <SelectValue placeholder="All lifecycles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All lifecycles</SelectItem>
            {WEBSITE_LIFECYCLE.map((value) => (
              <SelectItem key={value} value={value}>
                {label(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={clientFilter || "ALL"}
          onValueChange={(v) => {
            setClientFilter(v === "ALL" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger aria-label="Filter by client">
            <SelectValue placeholder="All clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All clients</SelectItem>
            {clients.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.businessName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={maintenance || "ALL"}
          onValueChange={(v) => {
            setMaintenance(v === "ALL" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger aria-label="Filter by maintenance coverage">
            <SelectValue placeholder="All maintenance" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All maintenance</SelectItem>
            {MAINTENANCE_COVERAGES.map((value) => (
              <SelectItem key={value} value={value}>
                {label(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={sortKey}
          onValueChange={(v) => setSortKey(v === "name" ? "name" : "newest")}
        >
          <SelectTrigger aria-label="Sort websites">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Sort: Newest</SelectItem>
            <SelectItem value="name">Sort: Name</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <LoadErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
      ) : items.length === 0 && total === 0 && !hasFilters ? (
        <EmptyState
          icon={Globe}
          title="No websites yet"
          description="Add your first website to start tracking domains, hosting and renewals."
          action={
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="size-4" />
              New website
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No websites match your filters"
          description="Try a different search term, lifecycle or client."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setSearchInput("");
                setLifecycle("");
                setClientFilter("");
                setMaintenance("");
                setShowArchived(false);
                setPage(1);
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead>Name</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Lifecycle</TableHead>
                  <TableHead>Environment</TableHead>
                  <TableHead>Maintenance</TableHead>
                  <TableHead>Domain renewal</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((website) => (
                  <TableRow
                    key={website.id}
                    className="cursor-pointer"
                    onClick={() => openWebsite(website.id)}
                  >
                    <TableCell>
                      <div className="flex max-w-[220px] min-w-0 items-center gap-2 sm:max-w-[280px]">
                        <span className="truncate text-sm font-medium">{website.name}</span>
                        {website.isSample ? <SampleBadge /> : null}
                      </div>
                      {website.primaryDomain ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {website.primaryDomain}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        className="text-sm text-foreground/80 underline-offset-4 hover:text-foreground hover:underline"
                        onClick={(event) => {
                          event.stopPropagation();
                          openClient(website.clientId);
                        }}
                      >
                        {website.client?.businessName ?? "—"}
                      </button>
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={website.lifecycleStatus} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {label(website.environment)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {label(website.maintenanceCoverage)}
                    </TableCell>
                    <TableCell>
                      <span className={cn("text-sm", renewalClasses(website.domainRenewalDate))}>
                        {formatDate(website.domainRenewalDate)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {timeAgo(website.updatedAt)}
                    </TableCell>
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <RowActions
                        website={website}
                        onEdit={() => setEditTarget(website)}
                        onArchive={() => setArchiveTarget(website)}
                        onRestore={() => setRestoreTarget(website)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {items.map((website) => (
              <div
                key={website.id}
                role="button"
                tabIndex={0}
                className="cursor-pointer rounded-xl border bg-card p-4 space-y-2"
                onClick={() => openWebsite(website.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") openWebsite(website.id);
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{website.name}</p>
                      {website.isSample ? <SampleBadge /> : null}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {website.primaryDomain ?? "No domain set"}
                    </p>
                  </div>
                  <RowActions
                    website={website}
                    onEdit={() => setEditTarget(website)}
                    onArchive={() => setArchiveTarget(website)}
                    onRestore={() => setRestoreTarget(website)}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <button
                    type="button"
                    className="rounded-md bg-muted px-1.5 py-0.5 hover:text-foreground"
                    onClick={(event) => {
                      event.stopPropagation();
                      openClient(website.clientId);
                    }}
                  >
                    {website.client?.businessName ?? "—"}
                  </button>
                  <StatusBadge value={website.lifecycleStatus} />
                  <span>{label(website.maintenanceCoverage)} maintenance</span>
                </div>
                <p className={cn("text-xs", renewalClasses(website.domainRenewalDate))}>
                  Domain renewal: {formatDate(website.domainRenewalDate)}
                </p>
              </div>
            ))}
          </div>

          <PaginationFooter
            page={page}
            pageCount={query.data?.pageCount ?? 1}
            total={total}
            pageSize={PAGE_SIZE}
            onPage={setPage}
          />
        </>
      )}

      <WebsiteFormDialog
        open={dialogOpen || editTarget !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog();
          else setDialogOpen(true);
        }}
        website={editTarget}
        clients={clients}
        clientsLoading={clientsQuery.isPending}
        seedClientId={params.clientId}
      />

      <ConfirmDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
        title={`Archive "${archiveTarget?.name ?? ""}"?`}
        description="Archived websites are hidden from the list but their history is kept. You can restore them via the Archived toggle."
        confirmLabel="Archive website"
        destructive
        loading={archiveMutation.isPending}
        onConfirm={() => {
          if (archiveTarget) archiveMutation.mutate(archiveTarget);
        }}
      />

      <ConfirmDialog
        open={restoreTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRestoreTarget(null);
        }}
        title={`Restore "${restoreTarget?.name ?? ""}"?`}
        description="The website will reappear in the active list."
        confirmLabel="Restore website"
        loading={restoreMutation.isPending}
        onConfirm={() => {
          if (restoreTarget) restoreMutation.mutate(restoreTarget);
        }}
      />
    </div>
  );
}

function RowActions({
  website,
  onEdit,
  onArchive,
  onRestore,
}: {
  website: WebsiteRecord;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const archived = Boolean(website.archivedAt);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Actions for ${website.name}`}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onSelect={() => openWebsite(website.id)}>
          <Globe className="size-4" />
          View
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil className="size-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {archived ? (
          <DropdownMenuItem onSelect={onRestore}>
            <ArchiveRestore className="size-4" />
            Restore
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem variant="destructive" onSelect={onArchive}>
            <Archive className="size-4" />
            Archive
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

function DefinitionRow({ label: text, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b py-2 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between">
      <dt className="text-xs text-muted-foreground">{text}</dt>
      <dd className="text-sm sm:text-right">{children}</dd>
    </div>
  );
}

function LinkChip({ url }: { url: string }) {
  const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 py-1.5 text-sm hover:bg-muted"
    >
      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{url}</span>
    </a>
  );
}

function DateWithTone({ date }: { date: string | null | undefined }) {
  const days = daysUntil(date);
  return (
    <span className="inline-flex items-baseline gap-2">
      <span>{formatDate(date)}</span>
      {days !== null ? (
        <span
          className={cn(
            "text-xs",
            days < 30 ? "font-medium text-destructive" : "text-muted-foreground"
          )}
        >
          {days < 0
            ? `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`
            : days === 0
              ? "Due today"
              : `Due in ${days} days`}
        </span>
      ) : null}
    </span>
  );
}

function WebsiteDetail({ id }: { id: string }) {
  const back = useAppStore((s) => s.back);
  const navigate = useAppStore((s) => s.navigate);
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [techFocus, setTechFocus] = useState<keyof WebsiteFormValues | undefined>(undefined);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);

  const query = useQuery({
    queryKey: ["website", id],
    queryFn: () =>
      apiFetch<{ website: WebsiteRecord; tasks: TaskRecord[] }>(`/api/websites/${id}`),
    enabled: Boolean(id),
  });

  const clientsQuery = useQuery({
    queryKey: ["clients", { picker: true }],
    queryFn: () => apiFetch<Paginated<ClientRecord>>("/api/clients?pageSize=100"),
  });

  const website = query.data?.website;
  const tasks = query.data?.tasks ?? [];

  // Projects linked via this website. /api/projects has no websiteId filter,
  // so fetch a page of 100 and filter client-side (fine at agency scale —
  // documented in worklog.md).
  const projectsQuery = useQuery({
    queryKey: ["projects", { forWebsite: id }],
    queryFn: () => apiFetch<Paginated<ProjectRecord>>("/api/projects?pageSize=100"),
    enabled: Boolean(website),
  });
  const linkedProjects = useMemo(
    () =>
      (projectsQuery.data?.items ?? []).filter((project) =>
        (project.websites ?? []).some((link) => link.id === id)
      ),
    [projectsQuery.data, id]
  );

  const documentsQuery = useQuery({
    queryKey: ["documents", { websiteId: id }],
    queryFn: () =>
      apiFetch<Paginated<DocumentRecord>>(
        `/api/documents${buildQuery({ websiteId: id, pageSize: 20 })}`
      ),
    enabled: Boolean(website),
  });

  const archiveMutation = useMutation({
    mutationFn: () => apiFetch(`/api/websites/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(`Website "${website?.name ?? ""}" archived.`);
      setArchiveOpen(false);
      queryClient.invalidateQueries({ queryKey: ["website", id] });
      queryClient.invalidateQueries({ queryKey: ["websites"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const restoreMutation = useMutation({
    mutationFn: () => apiFetch<WebsiteRecord>(`/api/websites/${id}/restore`, { method: "POST" }),
    onSuccess: () => {
      toast.success(`Website "${website?.name ?? ""}" restored.`);
      setRestoreOpen(false);
      queryClient.invalidateQueries({ queryKey: ["website", id] });
      queryClient.invalidateQueries({ queryKey: ["websites"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => toast.error((error as Error).message),
  });

  if (!id) {
    return (
      <EmptyState
        icon={Globe}
        title="No website selected"
        description="Pick a website from the list."
        action={
          <Button variant="outline" onClick={() => navigate("websites")}>
            Go to websites
          </Button>
        }
      />
    );
  }

  if (query.isPending) {
    return (
      <div className="space-y-6">
        <div className="flex items-start gap-3">
          <Skeleton className="mt-0.5 size-8 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>
        </div>
        <Skeleton className="h-9 w-full max-w-xl" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      </div>
    );
  }

  if (query.isError) {
    const notFound = (query.error as Error & { code?: string }).code === "NOT_FOUND";
    if (notFound) {
      return (
        <EmptyState
          icon={Globe}
          title="Website not found"
          description="It may have been removed. Check the websites list for the record you need."
          action={
            <Button variant="outline" onClick={back}>
              Go back
            </Button>
          }
        />
      );
    }
    return (
      <LoadErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
    );
  }

  if (!website) return null;

  const archived = Boolean(website.archivedAt);

  return (
    <div className="space-y-6">
      {/* Header (PageHeader-shaped; description needs rich content) */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={back}
            aria-label="Go back"
            className="mt-0.5 size-8 shrink-0"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{website.name}</h2>
              <StatusBadge value={website.lifecycleStatus} />
              {website.isSample ? <SampleBadge /> : null}
            </div>
            <div className="flex max-w-2xl flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <button
                type="button"
                className="font-medium text-foreground underline-offset-4 hover:underline"
                onClick={() => openClient(website.clientId)}
              >
                {website.client?.businessName ?? "Unknown client"}
              </button>
              <MetaSep />
              <span>{website.primaryDomain ?? "No domain set"}</span>
              {website.launchDate ? (
                <>
                  <MetaSep />
                  <span>Launched {formatDate(website.launchDate)}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setTechFocus(undefined);
              setEditOpen(true);
            }}
          >
            <Pencil className="size-4" />
            Edit
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More actions">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {archived ? (
                <DropdownMenuItem onSelect={() => setRestoreOpen(true)}>
                  <ArchiveRestore className="size-4" />
                  Restore website
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem variant="destructive" onSelect={() => setArchiveOpen(true)}>
                  <Archive className="size-4" />
                  Archive website
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {archived ? (
        <Alert className="bg-muted/60">
          <AlertDescription>
            This website is archived. Restore it to bring it back into the active list.
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs defaultValue="overview">
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="technical">Technical</TabsTrigger>
          <TabsTrigger value="domains">Domains</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <dl>
                  <DefinitionRow label="Type">{label(website.websiteType) !== "—" ? label(website.websiteType) : "Not set"}</DefinitionRow>
                  <DefinitionRow label="Environment">{label(website.environment)}</DefinitionRow>
                  <DefinitionRow label="Framework">{website.framework ?? "Not set"}</DefinitionRow>
                  <DefinitionRow label="Maintenance coverage">{label(website.maintenanceCoverage)}</DefinitionRow>
                  <DefinitionRow label="Launch date">{formatDate(website.launchDate)}</DefinitionRow>
                  <DefinitionRow label="Created">{formatDate(website.createdAt)}</DefinitionRow>
                  <DefinitionRow label="Updated">{formatDate(website.updatedAt)}</DefinitionRow>
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Links</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {website.productionUrl ? (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Production</p>
                    <LinkChip url={website.productionUrl} />
                  </div>
                ) : null}
                {website.stagingUrl ? (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Staging</p>
                    <LinkChip url={website.stagingUrl} />
                  </div>
                ) : null}
                {website.repositoryUrl ? (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Repository</p>
                    <LinkChip url={website.repositoryUrl} />
                  </div>
                ) : null}
                {!website.productionUrl && !website.stagingUrl && !website.repositoryUrl ? (
                  <p className="text-sm text-muted-foreground">
                    Not set — add production, staging or repository URLs when they exist.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Technical notes</CardTitle>
            </CardHeader>
            <CardContent>
              {website.technicalNotes ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {website.technicalNotes}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No technical notes yet — use Edit to record DNS, deployment or renewal details.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Technical */}
        <TabsContent value="technical" className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Technical details</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setTechFocus("hostingProvider");
                  setEditOpen(true);
                }}
              >
                <Pencil className="size-4" />
                Edit technical details
              </Button>
            </CardHeader>
            <CardContent>
              <dl>
                <DefinitionRow label="Hosting provider">{website.hostingProvider ?? "Not set"}</DefinitionRow>
                <DefinitionRow label="Deployment project ref">{website.deploymentProjectRef ?? "Not set"}</DefinitionRow>
                <DefinitionRow label="Repository URL">{website.repositoryUrl ?? "Not set"}</DefinitionRow>
                <DefinitionRow label="Production URL">{website.productionUrl ?? "Not set"}</DefinitionRow>
                <DefinitionRow label="Staging URL">{website.stagingUrl ?? "Not set"}</DefinitionRow>
                <DefinitionRow label="Domain renewal">
                  <DateWithTone date={website.domainRenewalDate} />
                </DefinitionRow>
                <DefinitionRow label="SSL expiry">
                  <DateWithTone date={website.sslExpiryDate} />
                </DefinitionRow>
                <DefinitionRow label="Environment">{label(website.environment)}</DefinitionRow>
                <DefinitionRow label="Framework">{website.framework ?? "Not set"}</DefinitionRow>
                <DefinitionRow label="Website type">{label(website.websiteType) !== "—" ? label(website.websiteType) : "Not set"}</DefinitionRow>
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Domains */}
        <TabsContent value="domains">
          <DomainsTab websiteId={website.id} domains={website.domains ?? []} />
        </TabsContent>

        {/* Tasks */}
        <TabsContent value="tasks">
          <DetailTaskList
            tasks={tasks}
            links={["client", "project"]}
            newTaskParams={{
              create: "1",
              websiteId: website.id,
              websiteName: website.name,
            }}
            contextLabel="this website"
          />
        </TabsContent>

        {/* Projects */}
        <TabsContent value="projects" className="space-y-3">
          {projectsQuery.isPending ? (
            <ListSkeleton rows={3} />
          ) : projectsQuery.isError ? (
            <LoadErrorState
              message={(projectsQuery.error as Error).message}
              onRetry={() => projectsQuery.refetch()}
            />
          ) : linkedProjects.length === 0 ? (
            <EmptyState
              icon={FolderKanban}
              title="No projects linked"
              description="Projects that include this website will appear here. Link websites from a project's Websites tab."
            />
          ) : (
            <Card>
              <CardContent className="divide-y p-0">
                {linkedProjects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/50"
                    onClick={() => openProject(project.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{project.name}</p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <Progress value={project.progress ?? 0} className="h-1.5 w-24" />
                        <span className="text-xs text-muted-foreground">
                          {project.progress ?? 0}%
                        </span>
                      </div>
                    </div>
                    <StatusBadge value={project.status} />
                  </button>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Documents */}
        <TabsContent value="documents" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Documents uploaded against this website.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("documents", { websiteId: website.id })}
            >
              <ExternalLink className="size-4" />
              Open documents
            </Button>
          </div>
          {documentsQuery.isPending ? (
            <ListSkeleton rows={3} />
          ) : documentsQuery.isError ? (
            <LoadErrorState
              message={(documentsQuery.error as Error).message}
              onRetry={() => documentsQuery.refetch()}
            />
          ) : (documentsQuery.data?.items.length ?? 0) === 0 ? (
            <EmptyState
              icon={Globe}
              title="No documents"
              description="Upload documents from the Documents view and link them to this website."
            />
          ) : (
            <Card>
              <CardContent className="divide-y p-0">
                {documentsQuery.data!.items.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{doc.fileName}</p>
                      <p className="text-xs text-muted-foreground">{fileSize(doc.sizeBytes)}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {timeAgo(doc.createdAt)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Billing */}
        {/* Operations */}
        <TabsContent value="operations">
          <WebsiteOperationsTab websiteId={website.id} website={website} />
        </TabsContent>

        <TabsContent value="billing">
          <EntityBillingTab websiteId={website.id} />
        </TabsContent>

        {/* Activity */}
        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimeline params={{ websiteId: website.id }} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <WebsiteFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        website={website}
        clients={clientsQuery.data?.items ?? []}
        clientsLoading={clientsQuery.isPending}
        initialFocusField={techFocus}
      />

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={`Archive "${website.name}"?`}
        description="Archived websites are hidden from the list but their history is kept. You can restore it here afterwards."
        confirmLabel="Archive website"
        destructive
        loading={archiveMutation.isPending}
        onConfirm={() => archiveMutation.mutate()}
      />

      <ConfirmDialog
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        title={`Restore "${website.name}"?`}
        description="The website will reappear in the active list."
        confirmLabel="Restore website"
        loading={restoreMutation.isPending}
        onConfirm={() => restoreMutation.mutate()}
      />
    </div>
  );
}
