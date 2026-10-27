"use client";

/**
 * AgencyOS — Projects view: the "projects" list (table + kanban board) and
 * the "project-detail" page (dispatched off the navigation store).
 */
import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  FolderKanban,
  LayoutGrid,
  ListFilter,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Table as TableIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { EmptyState } from "@/components/agency/shared/empty-state";
import { PageHeader } from "@/components/agency/shared/page-header";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { buildQuery } from "@/components/agency/shared/record-list-helpers";
import { openClient, openProject, useAppStore } from "@/components/agency/store";
import { ActivityTimeline } from "@/components/agency/views/websites/activity-timeline";
import {
  ListSkeleton,
  LoadErrorState,
  MetaSep,
  PaginationFooter,
  SampleBadge,
  useDebouncedState,
} from "@/components/agency/views/websites/list-bits";
import { DetailTaskList } from "@/components/agency/views/websites/task-rows";
import { KanbanBoard } from "@/components/agency/views/projects/kanban-board";
import { MilestonesTab } from "@/components/agency/views/projects/milestones-tab";
import { ProjectFormDialog } from "@/components/agency/views/projects/project-form-dialog";
import { StatusController } from "@/components/agency/views/projects/status-controller";
import { WebsitesLinkTab } from "@/components/agency/views/projects/websites-link-tab";
import {
  apiFetch,
  label,
  PROJECT_STATUSES,
  type ClientRecord,
  type DocumentRecord,
  type Paginated,
  type ProjectRecord,
  type TaskRecord,
} from "@/lib/types";
import { fileSize, formatCurrency, formatDate, isOverdue, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

type DetailPayload = { project: ProjectRecord; tasks: TaskRecord[] };
type ListMode = "table" | "board";

export default function ProjectsView() {
  const view = useAppStore((s) => s.view);
  const id = useAppStore((s) => s.params.id);
  if (view === "project-detail") {
    return <ProjectDetail id={id} />;
  }
  return <ProjectsList />;
}

// ---------------------------------------------------------------------------
// List (table + board)
// ---------------------------------------------------------------------------

function ProjectsList() {
  const params = useAppStore((s) => s.params);
  const navigate = useAppStore((s) => s.navigate);

  // Board/table choice is deliberately local state, NOT in the URL params.
  const [mode, setMode] = useState<ListMode>("table");

  // Filters, seeded once from params (dashboard KPI deep links). Only a
  // single valid status can be reflected in the Select; other values fall
  // back to "All statuses".
  const [searchInput, setSearchInput, search] = useDebouncedState("");
  const [status, setStatus] = useState(() =>
    (PROJECT_STATUSES as readonly string[]).includes(params.status ?? "") ? params.status : ""
  );
  const [clientFilter, setClientFilter] = useState(() => params.clientId ?? "");
  const [sortKey, setSortKey] = useState<"newest" | "due" | "name">("newest");
  const [page, setPage] = useState(1);

  const [dialogOpen, setDialogOpen] = useState(params.create === "1");
  const [editTarget, setEditTarget] = useState<ProjectRecord | null>(null);

  const clientsQuery = useQuery({
    queryKey: ["clients", { picker: true }],
    queryFn: () => apiFetch<Paginated<ClientRecord>>("/api/clients?pageSize=100"),
  });
  const clients = useMemo(() => clientsQuery.data?.items ?? [], [clientsQuery.data]);

  const sort = sortKey === "name" ? "name" : sortKey === "due" ? "dueDate" : "createdAt";
  const dir = sortKey === "name" || sortKey === "due" ? "asc" : "desc";

  const query = useQuery({
    queryKey: [
      "projects",
      { view: "table", page, pageSize: PAGE_SIZE, search, status, clientId: clientFilter, sort, dir },
    ],
    queryFn: () =>
      apiFetch<Paginated<ProjectRecord>>(
        `/api/projects${buildQuery({
          page,
          pageSize: PAGE_SIZE,
          search,
          status,
          clientId: clientFilter,
          sort,
          dir,
        })}`
      ),
    placeholderData: keepPreviousData,
  });

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const hasFilters = Boolean(search || status || clientFilter);

  /** Close create/edit dialog; strip a params.create intent from the store. */
  function closeDialog() {
    const wasCreateIntent = params.create === "1";
    setDialogOpen(false);
    setEditTarget(null);
    if (wasCreateIntent) {
      const cleaned: Record<string, string> = {};
      if (status) cleaned.status = status;
      if (clientFilter) cleaned.clientId = clientFilter;
      navigate("projects", cleaned);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description={query.data ? `${total} project${total === 1 ? "" : "s"}` : "Loading projects…"}
        actions={
          <>
            <div className="flex overflow-hidden rounded-md border">
              <Button
                variant={mode === "table" ? "secondary" : "ghost"}
                size="sm"
                className="rounded-none border-0"
                aria-pressed={mode === "table"}
                onClick={() => setMode("table")}
              >
                <TableIcon className="size-4" />
                Table
              </Button>
              <Button
                variant={mode === "board" ? "secondary" : "ghost"}
                size="sm"
                className="rounded-none border-0 border-l"
                aria-pressed={mode === "board"}
                onClick={() => setMode("board")}
              >
                <LayoutGrid className="size-4" />
                Board
              </Button>
            </div>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="size-4" />
              New project
            </Button>
          </>
        }
      />

      {mode === "board" ? (
        <KanbanBoard clientId={clientFilter} search={search} />
      ) : (
        <>
          {/* Filters */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative sm:col-span-2 lg:col-span-1">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(event) => {
                  setSearchInput(event.target.value);
                  setPage(1);
                }}
                placeholder="Search projects…"
                className="pl-8"
                aria-label="Search projects"
              />
            </div>
            <Select
              value={status || "ALL"}
              onValueChange={(v) => {
                setStatus(v === "ALL" ? "" : v);
                setPage(1);
              }}
            >
              <SelectTrigger aria-label="Filter by status">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                {PROJECT_STATUSES.map((value) => (
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
              value={sortKey}
              onValueChange={(v) => {
                if (v === "name" || v === "due") setSortKey(v);
                else setSortKey("newest");
              }}
            >
              <SelectTrigger aria-label="Sort projects">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Sort: Newest</SelectItem>
                <SelectItem value="due">Sort: Due date</SelectItem>
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
              icon={FolderKanban}
              title="No projects yet"
              description="Create your first project to start tracking leads through to launch."
              action={
                <Button onClick={() => setDialogOpen(true)}>
                  <Plus className="size-4" />
                  New project
                </Button>
              }
            />
          ) : items.length === 0 ? (
            <EmptyState
              icon={ListFilter}
              title="No projects match your filters"
              description="Try a different search term, status or client."
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchInput("");
                    setStatus("");
                    setClientFilter("");
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
                      <TableHead>Status</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Tasks</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((project) => (
                      <TableRow
                        key={project.id}
                        className="cursor-pointer"
                        onClick={() => openProject(project.id)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{project.name}</span>
                            {project.isSample ? <SampleBadge /> : null}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {project.client?.businessName ?? "—"}
                          </p>
                        </TableCell>
                        <TableCell>
                          <StatusBadge value={project.status} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={project.progress ?? 0} className="h-1.5 w-20" />
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {project.progress ?? 0}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatCurrency(project.agreedAmountMinor, project.currency)}
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              "text-sm",
                              isOverdue(project.dueDate) ? "font-medium text-destructive" : "text-foreground"
                            )}
                          >
                            {formatDate(project.dueDate)}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm tabular-nums text-muted-foreground">
                          {project._count?.tasks ?? 0}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {timeAgo(project.updatedAt)}
                        </TableCell>
                        <TableCell onClick={(event) => event.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label={`Actions for ${project.name}`}>
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-36">
                              <DropdownMenuItem onSelect={() => openProject(project.id)}>
                                View
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => setEditTarget(project)}>
                                Edit
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile cards */}
              <div className="space-y-3 md:hidden">
                {items.map((project) => (
                  <div
                    key={project.id}
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer space-y-2 rounded-xl border bg-card p-4"
                    onClick={() => openProject(project.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") openProject(project.id);
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium">{project.name}</p>
                          {project.isSample ? <SampleBadge /> : null}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {project.client?.businessName ?? "—"}
                        </p>
                      </div>
                      <StatusBadge value={project.status} />
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress value={project.progress ?? 0} className="h-1.5 flex-1" />
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {project.progress ?? 0}%
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{formatCurrency(project.agreedAmountMinor, project.currency)}</span>
                      <span
                        className={cn(
                          isOverdue(project.dueDate) && "font-medium text-destructive"
                        )}
                      >
                        Due {formatDate(project.dueDate)}
                      </span>
                      <span>{project._count?.tasks ?? 0} tasks</span>
                      <span>{timeAgo(project.updatedAt)}</span>
                    </div>
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
        </>
      )}

      <ProjectFormDialog
        open={dialogOpen || editTarget !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog();
          else setDialogOpen(true);
        }}
        project={editTarget}
        clients={clients}
        clientsLoading={clientsQuery.isPending}
        seedClientId={params.clientId}
      />
    </div>
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

function ProjectDetail({ id }: { id: string }) {
  const back = useAppStore((s) => s.back);
  const navigate = useAppStore((s) => s.navigate);
  const clientsQuery = useQuery({
    queryKey: ["clients", { picker: true }],
    queryFn: () => apiFetch<Paginated<ClientRecord>>("/api/clients?pageSize=100"),
  });

  const [editOpen, setEditOpen] = useState(false);
  const detailKey = useMemo(() => ["project", id] as const, [id]);

  const query = useQuery({
    queryKey: detailKey,
    queryFn: () => apiFetch<DetailPayload>(`/api/projects/${id}`),
    enabled: Boolean(id),
  });

  const documentsQuery = useQuery({
    queryKey: ["documents", { projectId: id }],
    queryFn: () =>
      apiFetch<Paginated<DocumentRecord>>(
        `/api/documents${buildQuery({ projectId: id, pageSize: 20 })}`
      ),
    enabled: Boolean(id),
  });

  if (!id) {
    return (
      <EmptyState
        icon={FolderKanban}
        title="No project selected"
        description="Pick a project from the list."
        action={
          <Button variant="outline" onClick={() => navigate("projects")}>
            Go to projects
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
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-9 w-full max-w-xl" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (query.isError) {
    const notFound = (query.error as Error & { code?: string }).code === "NOT_FOUND";
    if (notFound) {
      return (
        <EmptyState
          icon={FolderKanban}
          title="Project not found"
          description="It may have been removed. Check the projects list for the record you need."
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

  const project = query.data.project;
  const tasks = query.data.tasks;
  const milestones = project.milestones ?? [];
  const milestonesDone = milestones.filter((m) => m.completedAt).length;
  const dueOverdue = isOverdue(project.dueDate);

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
              <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{project.name}</h2>
              <StatusBadge value={project.status} />
              {project.isSample ? <SampleBadge /> : null}
            </div>
            <div className="flex max-w-2xl flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <button
                type="button"
                className="font-medium text-foreground underline-offset-4 hover:underline"
                onClick={() => openClient(project.clientId)}
              >
                {project.client?.businessName ?? "Unknown client"}
              </button>
              <MetaSep />
              <span>{label(project.projectType)}</span>
              <MetaSep />
              <span>{formatCurrency(project.agreedAmountMinor, project.currency)}</span>
              <MetaSep />
              <span className={cn(dueOverdue && "font-medium text-destructive")}>
                {project.dueDate ? `Due ${formatDate(project.dueDate)}` : "No due date"}
                {dueOverdue ? " · overdue" : ""}
              </span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <StatusController project={project} />
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" />
            Edit
          </Button>
        </div>
      </div>

      {/* Progress card */}
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3 sm:items-center">
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <p className="text-xs text-muted-foreground">Progress</p>
              <p className="text-sm font-medium tabular-nums">{project.progress ?? 0}%</p>
            </div>
            <Progress value={project.progress ?? 0} />
          </div>
          <div className="flex items-center gap-3">
            <CheckCircle2 className="size-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">
                {milestonesDone} of {milestones.length} milestone
                {milestones.length === 1 ? "" : "s"}
              </p>
              <p className="text-xs text-muted-foreground">
                {milestones.length > 0
                  ? "Progress is driven by milestone completion."
                  : "No milestones yet — progress falls back to completed tasks."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <CalendarDays className="size-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{project._count?.tasks ?? 0} tasks</p>
              <p className="text-xs text-muted-foreground">Latest 20 shown in the Tasks tab.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="milestones">Milestones</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="websites">Websites</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Scope</CardTitle>
              </CardHeader>
              <CardContent>
                {project.scope ? (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{project.scope}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No scope recorded — use Edit to describe what is being delivered.
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Details</CardTitle>
              </CardHeader>
              <CardContent>
                <dl>
                  <DefinitionRow label="Type">{label(project.projectType)}</DefinitionRow>
                  <DefinitionRow label="Status">{label(project.status)}</DefinitionRow>
                  <DefinitionRow label="Agreed price">
                    {formatCurrency(project.agreedAmountMinor, project.currency)}
                  </DefinitionRow>
                  <DefinitionRow label="Currency">{project.currency}</DefinitionRow>
                  <DefinitionRow label="Start date">{formatDate(project.startDate)}</DefinitionRow>
                  <DefinitionRow label="Due date">
                    <span className={cn(dueOverdue && "font-medium text-destructive")}>
                      {formatDate(project.dueDate)}
                    </span>
                  </DefinitionRow>
                  {project.completedAt ? (
                    <DefinitionRow label="Completed">{formatDate(project.completedAt)}</DefinitionRow>
                  ) : null}
                  <DefinitionRow label="Created">{formatDate(project.createdAt)}</DefinitionRow>
                  <DefinitionRow label="Updated">{formatDate(project.updatedAt)}</DefinitionRow>
                </dl>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Internal notes</CardTitle>
            </CardHeader>
            <CardContent>
              {project.internalNotes ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {project.internalNotes}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">No internal notes.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Milestones */}
        <TabsContent value="milestones">
          <MilestonesTab project={project} onRefreshKey={detailKey} />
        </TabsContent>

        {/* Tasks */}
        <TabsContent value="tasks">
          <DetailTaskList
            tasks={tasks}
            links={["client", "website"]}
            newTaskParams={{
              create: "1",
              projectId: project.id,
              projectName: project.name,
              clientId: project.clientId,
              clientName: project.client?.businessName ?? "",
            }}
            contextLabel="this project"
          />
        </TabsContent>

        {/* Websites */}
        <TabsContent value="websites">
          <WebsitesLinkTab project={project} detailKey={detailKey} />
        </TabsContent>

        {/* Documents */}
        <TabsContent value="documents" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">Documents uploaded against this project.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("documents", { projectId: project.id })}
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
              icon={FolderKanban}
              title="No documents"
              description="Upload documents from the Documents view and link them to this project."
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

        {/* Activity */}
        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimeline params={{ projectId: project.id }} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ProjectFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        project={project}
        clients={clientsQuery.data?.items ?? []}
        clientsLoading={clientsQuery.isPending}
      />
    </div>
  );
}
