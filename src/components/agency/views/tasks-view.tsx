"use client";

/**
 * AgencyOS — Tasks view (task 4-c).
 * Filterable task list with a detail Drawer (not a store route), optimistic
 * complete toggles, deep-link param support (due / clientId / websiteId /
 * projectId / create=1) and a shared create/edit dialog.
 */
import { useEffect, useMemo, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Ban,
  CheckCircle2,
  Eye,
  ListTodo,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  SearchX,
  X,
  Kanban,
  List,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { PageHeader } from "@/components/agency/shared/page-header";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { ConfirmDialog } from "@/components/agency/shared/confirm-dialog";
import { buildQuery } from "@/components/agency/shared/record-list-helpers";
import {
  openClient,
  openProject,
  openWebsite,
  useAppStore,
} from "@/components/agency/store";
import {
  apiFetch,
  label,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type Paginated,
  type TaskRecord,
} from "@/lib/types";
import {
  formatDate,
  formatDateTime,
  isDueToday,
  isOverdue,
  timeAgo,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  useClientsLookup,
  useDebouncedValue,
  useRefName,
} from "@/components/agency/views/tasks/lookups";
import { ListPagination } from "@/components/agency/views/tasks/list-pagination";
import {
  TaskFormDialog,
  type TaskFormDefaults,
} from "@/components/agency/views/tasks/task-form-dialog";
import { TaskBoard } from "@/components/agency/views/tasks/task-board";
import {
  TaskWorkflowPanel,
  TaskChecklistPanel,
  TaskCommentsPanel,
} from "@/components/agency/views/tasks/task-detail-extra";

const PAGE_SIZE = 25;
const DUE_FILTERS = ["overdue", "today", "week", "none"] as const;
const OPEN_STATUS_PARAM = "BACKLOG,READY,IN_PROGRESS,BLOCKED,IN_REVIEW,APPROVAL_REQUIRED,APPROVED,DEPLOYED,TODO,WAITING";

type StatusChip = "open" | "all" | (typeof TASK_STATUSES)[number];
type SortChoice = "auto" | "newest" | "due" | "priority";

interface TaskFilters {
  statusChip: StatusChip;
  priority: string;
  due: string;
  clientId: string;
  websiteId: string;
  projectId: string;
  sort: SortChoice;
}

const DEFAULT_FILTERS: TaskFilters = {
  statusChip: "open",
  priority: "",
  due: "",
  clientId: "",
  websiteId: "",
  projectId: "",
  sort: "auto",
};

/**
 * Survives the params-clearing remount caused by navigate(): set when
 * params.create === "1", consumed by the next mount's lazy dialog state.
 */
let autoOpenCreateOnNextMount = false;

export default function TasksView() {
  const queryClient = useQueryClient();
  const params = useAppStore((s) => s.params);
  const navigate = useAppStore((s) => s.navigate);
  const user = useAppStore((s) => s.user);

  // Seed filters from deep-link params ONCE (lazy initializers survive the
  // remount that happens when params.create is cleared below).
  const [filters, setFilters] = useState<TaskFilters>(() => ({
    ...DEFAULT_FILTERS,
    due: (DUE_FILTERS as readonly string[]).includes(params.due ?? "") ? params.due : "",
    clientId: params.clientId ?? "",
    websiteId: params.websiteId ?? "",
    projectId: params.projectId ?? "",
  }));
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput);
  const [createOpen, setCreateOpen] = useState<boolean>(() => {
    // Consume the auto-open flag set before the params-clearing remount.
    if (autoOpenCreateOnNextMount) {
      autoOpenCreateOnNextMount = false;
      return true;
    }
    return false;
  });
  const [editTask, setEditTask] = useState<TaskRecord | null>(null);
  // params.taskId deep link (Related tasks card in a ticket): open the drawer
  // for that task on mount.
  const [detailId, setDetailId] = useState<string | null>(() => params.taskId ?? null);
  const [cancelTarget, setCancelTarget] = useState<TaskRecord | null>(null);
  // Phase 5 — Board (developer workflow) vs List view. Developers default to
  // the board; everyone else starts on the classic list.
  const [viewMode, setViewMode] = useState<"board" | "list">(() =>
    user?.role === "WEB_DEVELOPER" || user?.role === "OWNER" ? "board" : "list",
  );

  // params.create === "1" (e.g. "Add task" shortcut): open the create dialog,
  // then clear the param via navigate (the remount re-seeds the filters above
  // and consumes the auto-open flag).
  useEffect(() => {
    if (params.create !== "1") return;
    autoOpenCreateOnNextMount = true;
    const rest = { ...params };
    delete rest.create;
    navigate("tasks", rest);
  }, [params, navigate]);

  const setFilter = (patch: Partial<TaskFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };

  /** Close the detail drawer; strip a params.taskId deep-link from the store. */
  function closeDetail() {
    setDetailId(null);
    if (params.taskId) {
      const rest = { ...params };
      delete rest.taskId;
      navigate("tasks", rest);
    }
  }

  // --- computed query params -------------------------------------------------

  const statusParam =
    filters.statusChip === "open"
      ? OPEN_STATUS_PARAM
      : filters.statusChip === "all"
        ? undefined
        : filters.statusChip;

  const effectiveSort = useMemo<{ sort: string; dir: "asc" | "desc" }>(() => {
    if (filters.sort === "due") return { sort: "dueAt", dir: "asc" };
    if (filters.sort === "priority") return { sort: "priority", dir: "asc" };
    if (filters.sort === "newest") return { sort: "createdAt", dir: "desc" };
    // "auto": due-date order while a due filter is active, newest otherwise.
    return filters.due ? { sort: "dueAt", dir: "asc" } : { sort: "createdAt", dir: "desc" };
  }, [filters.sort, filters.due]);

  const listQueryKey = useMemo(
    () =>
      [
        "tasks",
        {
          page,
          search: debouncedSearch,
          status: statusParam ?? "",
          priority: filters.priority,
          due: filters.due,
          clientId: filters.clientId,
          websiteId: filters.websiteId,
          projectId: filters.projectId,
          sort: effectiveSort.sort,
          dir: effectiveSort.dir,
        },
      ] as const,
    [
      page,
      debouncedSearch,
      statusParam,
      filters.priority,
      filters.due,
      filters.clientId,
      filters.websiteId,
      filters.projectId,
      effectiveSort,
    ],
  );

  // --- queries ----------------------------------------------------------------

  const listQuery = useQuery({
    queryKey: listQueryKey,
    queryFn: () =>
      apiFetch<Paginated<TaskRecord>>(
        `/api/tasks${buildQuery({
          page,
          pageSize: PAGE_SIZE,
          search: debouncedSearch || undefined,
          status: statusParam,
          priority: filters.priority || undefined,
          due: filters.due || undefined,
          clientId: filters.clientId || undefined,
          websiteId: filters.websiteId || undefined,
          projectId: filters.projectId || undefined,
          sort: effectiveSort.sort,
          dir: effectiveSort.dir,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });

  // Lightweight totals for the header description ("{open} open · {overdue} overdue").
  const metaQuery = useQuery({
    queryKey: ["tasks", "meta"],
    queryFn: async () => {
      const [open, overdue] = await Promise.all([
        apiFetch<Paginated<TaskRecord>>(
          `/api/tasks${buildQuery({ status: OPEN_STATUS_PARAM, pageSize: 5 })}`,
        ),
        apiFetch<Paginated<TaskRecord>>(`/api/tasks${buildQuery({ due: "overdue", pageSize: 5 })}`),
      ]);
      return { open: open.total, overdue: overdue.total };
    },
    staleTime: 30_000,
  });

  const detailQuery = useQuery({
    queryKey: ["task", detailId],
    queryFn: () => apiFetch<TaskRecord>(`/api/tasks/${detailId}`),
    enabled: !!detailId,
  });

  const clients = useClientsLookup();

  // --- mutations ---------------------------------------------------------------

  const invalidateAfterTaskChange = (taskId?: string) => {
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["client"] });
    queryClient.invalidateQueries({ queryKey: ["website"] });
    queryClient.invalidateQueries({ queryKey: ["project"] });
    if (taskId) queryClient.invalidateQueries({ queryKey: ["task", taskId] });
  };

  // Optimistic complete/reopen straight from the row checkbox.
  const toggleComplete = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      apiFetch<TaskRecord>(`/api/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ completed }),
      }),
    onMutate: async ({ id, completed }) => {
      await queryClient.cancelQueries({ queryKey: listQueryKey });
      const previous = queryClient.getQueryData<Paginated<TaskRecord>>(listQueryKey);
      queryClient.setQueryData<Paginated<TaskRecord>>(listQueryKey, (old) =>
        old
          ? {
              ...old,
              items: old.items.map((item) =>
                item.id === id
                  ? {
                      ...item,
                      // Reopen lands in BACKLOG for Phase 5 tasks (server rule:
                      // taskNumber != null → BACKLOG, legacy rows → TODO).
                      status: completed ? "COMPLETED" : item.taskNumber != null ? "BACKLOG" : "TODO",
                      completedAt: completed ? new Date().toISOString() : null,
                      isOverdue: completed
                        ? false
                        : !!item.dueAt && new Date(item.dueAt).getTime() < Date.now(),
                    }
                  : item,
              ),
            }
          : old,
      );
      return { previous };
    },
    onError: (error: Error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(listQueryKey, context.previous);
      toast.error(error.message || "Could not update the task.");
    },
    onSettled: () => {
      invalidateAfterTaskChange();
    },
  });

  // Drawer mutations (status/priority selects, complete/reopen button).
  const updateTask = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiFetch<TaskRecord>(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: (updated) => invalidateAfterTaskChange(updated.id),
    onError: (error: Error) => toast.error(error.message || "Could not update the task."),
  });

  // DELETE is a soft archive: the server sets status CANCELLED.
  const cancelTask = useMutation({
    mutationFn: (id: string) =>
      apiFetch<TaskRecord>(`/api/tasks/${id}`, { method: "DELETE" }),
    onSuccess: (cancelled) => {
      toast.success("Task cancelled");
      setCancelTarget(null);
      closeDetail();
      invalidateAfterTaskChange(cancelled.id);
    },
    onError: (error: Error) => toast.error(error.message || "Could not cancel the task."),
  });

  // --- derived -----------------------------------------------------------------

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const pageCount = listQuery.data?.pageCount ?? 1;
  const hasActiveFilters =
    !!debouncedSearch ||
    filters.statusChip !== "open" ||
    !!filters.priority ||
    !!filters.due ||
    !!filters.clientId ||
    !!filters.websiteId ||
    !!filters.projectId;

  const websiteChipName = useRefName("website", filters.websiteId || null, params.websiteName);
  const projectChipName = useRefName("project", filters.projectId || null, params.projectName);

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setSearchInput("");
    setPage(1);
  };

  const createDefaults: TaskFormDefaults = {
    clientId: filters.clientId || undefined,
    websiteId: filters.websiteId || undefined,
    projectId: filters.projectId || undefined,
  };

  const pendingToggleId = toggleComplete.isPending ? toggleComplete.variables?.id : null;

  // --- render --------------------------------------------------------------------

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tasks"
        description={
          metaQuery.data
            ? `${metaQuery.data.open} open · ${metaQuery.data.overdue} overdue`
            : "Assign and track work across clients and projects."
        }
        actions={
          <div className="flex items-center gap-2">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={viewMode}
              onValueChange={(value) => {
                if (value === "board" || value === "list") setViewMode(value);
              }}
              aria-label="Tasks view mode"
            >
              <ToggleGroupItem value="board" className="gap-1.5">
                <Kanban aria-hidden className="size-3.5" />
                Board
              </ToggleGroupItem>
              <ToggleGroupItem value="list" className="gap-1.5">
                <List aria-hidden className="size-3.5" />
                List
              </ToggleGroupItem>
            </ToggleGroup>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden />
              New task
            </Button>
          </div>
        }
      />

      {/* Filter bar */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative flex-1 lg:max-w-xs">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={searchInput}
              onChange={(event) => {
                setSearchInput(event.target.value);
                setPage(1);
              }}
              placeholder="Search tasks…"
              aria-label="Search tasks"
              className="pl-9"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex lg:w-auto">
            <Select
              value={filters.priority || "all"}
              onValueChange={(value) => setFilter({ priority: value === "all" ? "" : value })}
            >
              <SelectTrigger className="w-full lg:w-36" aria-label="Priority filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                {TASK_PRIORITIES.map((priority) => (
                  <SelectItem key={priority} value={priority}>
                    {label(priority)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.due || "all"}
              onValueChange={(value) => setFilter({ due: value === "all" ? "" : value })}
            >
              <SelectTrigger className="w-full lg:w-36" aria-label="Due filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All dates</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="today">Due today</SelectItem>
                <SelectItem value="week">Next 7 days</SelectItem>
                <SelectItem value="none">No due date</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.clientId || "all"}
              onValueChange={(value) => setFilter({ clientId: value === "all" ? "" : value })}
            >
              <SelectTrigger className="w-full lg:w-40" aria-label="Client filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clients</SelectItem>
                {(clients.data ?? []).map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.businessName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.sort}
              onValueChange={(value) => setFilter({ sort: value as SortChoice })}
            >
              <SelectTrigger className="w-full lg:w-36" aria-label="Sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Sort: auto</SelectItem>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="due">Due date</SelectItem>
                <SelectItem value="priority">Priority</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={filters.statusChip}
            onValueChange={(value) => {
              if (value) setFilter({ statusChip: value as StatusChip });
            }}
            className="flex-wrap gap-1.5"
            aria-label="Status filter"
          >
            <ToggleGroupItem value="open" className="flex-none whitespace-nowrap">Open</ToggleGroupItem>
            <ToggleGroupItem value="all" className="flex-none whitespace-nowrap">All</ToggleGroupItem>
            {TASK_STATUSES.map((status) => (
              <ToggleGroupItem key={status} value={status} className="flex-none whitespace-nowrap">
                {label(status)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <div className="flex flex-wrap items-center gap-1.5">
            {filters.websiteId ? (
              <FilterChip
                text={`Website: ${websiteChipName ?? "loading…"}`}
                onRemove={() => setFilter({ websiteId: "" })}
              />
            ) : null}
            {filters.projectId ? (
              <FilterChip
                text={`Project: ${projectChipName ?? "loading…"}`}
                onRemove={() => setFilter({ projectId: "" })}
              />
            ) : null}
          </div>
        </div>
      </div>

      {/* Board (Phase 5 developer workflow) */}
      {viewMode === "board" ? (
        <TaskBoard
          onOpenTask={(id) => setDetailId(id)}
          developerId={user?.role === "WEB_DEVELOPER" ? user.id : undefined}
        />
      ) : null}

      {/* List */}
      {viewMode === "list" && listQuery.isLoading ? (
        <ListSkeleton />
      ) : listQuery.isError ? (
        <EmptyState
          icon={SearchX}
          title="Tasks could not be loaded"
          description={(listQuery.error as Error)?.message ?? "Something went wrong."}
          action={<Button variant="outline" onClick={() => listQuery.refetch()}>Try again</Button>}
        />
      ) : total === 0 && !hasActiveFilters ? (
        <EmptyState
          icon={ListTodo}
          title="No tasks yet"
          description="Create the first task to start tracking work across clients and projects."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden />
              Create your first task
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No tasks match"
          description="No tasks match the current filters. Try widening them."
          action={
            <Button variant="outline" onClick={clearFilters}>
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
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-10">
                    <span className="sr-only">Completed</span>
                  </TableHead>
                  <TableHead>Task</TableHead>
                  <TableHead className="w-40">Links</TableHead>
                  <TableHead className="w-28">Priority</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  <TableHead className="w-40">Due</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((task) => (
                  <TableRow
                    key={task.id}
                    onClick={() => setDetailId(task.id)}
                    className="cursor-pointer"
                  >
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        checked={task.status === "COMPLETED"}
                        onCheckedChange={(checked) =>
                          toggleComplete.mutate({ id: task.id, completed: checked === true })
                        }
                        disabled={pendingToggleId === task.id}
                        aria-label={task.status === "COMPLETED" ? "Reopen task" : "Mark task complete"}
                      />
                    </TableCell>
                    <TableCell className="max-w-md">
                      <div className="space-y-0.5">
                        <p
                          className={cn(
                            "truncate text-sm font-medium",
                            task.status === "COMPLETED" && "text-muted-foreground line-through",
                          )}
                        >
                          {task.title}
                        </p>
                        {task.description ? (
                          <p className="truncate text-xs text-muted-foreground">{task.description}</p>
                        ) : null}
                        {task.status === "COMPLETED" && task.completedAt ? (
                          <p className="text-xs text-muted-foreground">
                            Completed {timeAgo(task.completedAt)}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <div className="flex flex-col items-start gap-0.5">
                        {task.client ? (
                          <button
                            type="button"
                            onClick={() => openClient(task.client!.id)}
                            className="max-w-36 truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
                          >
                            {task.client.businessName}
                          </button>
                        ) : null}
                        {task.website ? (
                          <button
                            type="button"
                            onClick={() => openWebsite(task.website!.id)}
                            className="max-w-36 truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
                          >
                            {task.website.name}
                          </button>
                        ) : null}
                        {task.project ? (
                          <button
                            type="button"
                            onClick={() => openProject(task.project!.id)}
                            className="max-w-36 truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
                          >
                            {task.project.name}
                          </button>
                        ) : null}
                        {!task.client && !task.website && !task.project ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <PriorityLabel priority={task.priority} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={task.status} />
                    </TableCell>
                    <TableCell>
                      <DueCell task={task} />
                    </TableCell>
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <RowActions
                        task={task}
                        onOpen={() => setDetailId(task.id)}
                        onToggle={() =>
                          toggleComplete.mutate({
                            id: task.id,
                            completed: task.status !== "COMPLETED",
                          })
                        }
                        onEdit={() => setEditTask(task)}
                        onCancel={() => setCancelTarget(task)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="grid gap-2 md:hidden">
            {items.map((task) => (
              <div
                key={task.id}
                role="button"
                tabIndex={0}
                onClick={() => setDetailId(task.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setDetailId(task.id);
                  }
                }}
                className="flex items-start gap-3 rounded-xl border bg-card p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div onClick={(event) => event.stopPropagation()}>
                  <Checkbox
                    checked={task.status === "COMPLETED"}
                    onCheckedChange={(checked) =>
                      toggleComplete.mutate({ id: task.id, completed: checked === true })
                    }
                    disabled={pendingToggleId === task.id}
                    aria-label={task.status === "COMPLETED" ? "Reopen task" : "Mark task complete"}
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p
                    className={cn(
                      "text-sm leading-snug font-medium",
                      task.status === "COMPLETED" && "text-muted-foreground line-through",
                    )}
                  >
                    {task.title}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge value={task.status} />
                    <PriorityLabel priority={task.priority} />
                    <DueCell task={task} compact />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <ListPagination
            page={page}
            pageCount={pageCount}
            total={total}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </>
      )}

      {/* Create / edit dialogs */}
      <TaskFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaults={createDefaults}
        defaultAssigneeId={user?.id}
      />
      <TaskFormDialog
        open={!!editTask}
        onOpenChange={(open) => {
          if (!open) setEditTask(null);
        }}
        task={editTask}
      />

      {/* Detail drawer */}
      <Sheet open={!!detailId} onOpenChange={(open) => !open && closeDetail()}>
        <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle className="pr-8 text-base">
              {detailQuery.data?.title ?? "Task details"}
            </SheetTitle>
            <SheetDescription>Full task record and quick actions.</SheetDescription>
          </SheetHeader>
          {detailQuery.data ? (
            <TaskDetailBody
              task={detailQuery.data}
              busy={updateTask.isPending}
              onStatusChange={(status) =>
                updateTask.mutate({ id: detailQuery.data.id, body: { status } })
              }
              onPriorityChange={(priority) =>
                updateTask.mutate({ id: detailQuery.data.id, body: { priority } })
              }
              onToggleComplete={() =>
                updateTask.mutate({
                  id: detailQuery.data.id,
                  body: { completed: detailQuery.data!.status !== "COMPLETED" },
                })
              }
              onEdit={() => setEditTask(detailQuery.data)}
              onCancel={() => setCancelTarget(detailQuery.data)}
              onPatch={(body) => updateTask.mutate({ id: detailQuery.data.id, body })}
            />
          ) : (
            <div className="space-y-3 p-4">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Cancel (soft archive) confirmation */}
      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title="Cancel this task?"
        description={
          cancelTarget
            ? `"${cancelTarget.title}" will be marked Cancelled. The record is kept, not deleted.`
            : ""
        }
        confirmLabel="Cancel task"
        destructive
        loading={cancelTask.isPending}
        onConfirm={() => cancelTarget && cancelTask.mutate(cancelTarget.id)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function FilterChip({ text, onRemove }: { text: string; onRemove: () => void }) {
  return (
    <span className="inline-flex max-w-64 items-center gap-1 rounded-full border bg-muted/60 py-1 pr-1 pl-2.5 text-xs font-medium">
      <span className="truncate">{text}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter ${text}`}
        className="rounded-full p-0.5 transition-colors hover:bg-muted"
      >
        <X aria-hidden className="size-3" />
      </button>
    </span>
  );
}

const PRIORITY_DOT: Record<string, string> = {
  CRITICAL: "bg-destructive",
  HIGH: "bg-warning",
  NORMAL: "bg-muted-foreground/50",
  LOW: "border border-muted-foreground/50 bg-transparent",
};

function PriorityLabel({ priority }: { priority: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap">
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", PRIORITY_DOT[priority] ?? "bg-muted-foreground/50")} />
      {label(priority)}
    </span>
  );
}

function DueCell({ task, compact = false }: { task: TaskRecord; compact?: boolean }) {
  const overdue = task.isOverdue ?? isOverdue(task.dueAt);
  const today = isDueToday(task.dueAt);
  if (!task.dueAt) {
    return <span className="text-xs text-muted-foreground">No due date</span>;
  }
  return (
    <span
      className={cn(
        "inline-flex flex-wrap items-center gap-1 text-xs whitespace-nowrap",
        overdue ? "font-medium text-destructive" : "text-foreground",
      )}
    >
      {formatDate(task.dueAt)}
      {overdue ? (
        <Badge variant="destructive" className="px-1.5 py-0">
          Overdue
        </Badge>
      ) : today ? (
        <Badge className="border-warning/40 bg-warning/15 px-1.5 py-0 text-warning-foreground">
          Today
        </Badge>
      ) : null}
      {compact && task.status === "COMPLETED" && task.completedAt ? (
        <span className="text-muted-foreground">· done {timeAgo(task.completedAt)}</span>
      ) : null}
    </span>
  );
}

function RowActions({
  task,
  onOpen,
  onToggle,
  onEdit,
  onCancel,
}: {
  task: TaskRecord;
  onOpen: () => void;
  onToggle: () => void;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const completed = task.status === "COMPLETED";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${task.title}`}>
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuItem onSelect={onOpen}>
          <Eye aria-hidden />
          Open details
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onToggle}>
          {completed ? <RotateCcw aria-hidden /> : <CheckCircle2 aria-hidden />}
          {completed ? "Reopen" : "Mark complete"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil aria-hidden />
          Edit
        </DropdownMenuItem>
        {task.status !== "CANCELLED" ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onCancel}>
              <Ban aria-hidden />
              Cancel task
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DetailRow({ label: text, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
      <span className="w-28 shrink-0 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {text}
      </span>
      <span className="min-w-0 text-sm">{children}</span>
    </div>
  );
}

function TaskDetailBody({
  task,
  busy,
  onStatusChange,
  onPriorityChange,
  onToggleComplete,
  onEdit,
  onCancel,
  onPatch,
}: {
  task: TaskRecord;
  busy: boolean;
  onStatusChange: (status: string) => void;
  onPriorityChange: (priority: string) => void;
  onToggleComplete: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onPatch: (body: Record<string, unknown>) => void;
}) {
  const completed = task.status === "COMPLETED";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-4">
        {/* Quick status / priority editors — transitions validated server-side */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Priority
            </span>
            <Select value={task.priority} onValueChange={onPriorityChange} disabled={busy}>
              <SelectTrigger className="w-full" aria-label="Task priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_PRIORITIES.map((priority) => (
                  <SelectItem key={priority} value={priority}>
                    {label(priority)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StatusBadge value={task.status} />
          <PriorityLabel priority={task.priority} />
        </div>

        {task.description ? (
          <div className="space-y-1">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Description
            </span>
            <p className="text-sm whitespace-pre-wrap">{task.description}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">No description.</p>
        )}

        {/* Phase 5 — workflow, checklist, comments */}
        <TaskWorkflowPanel task={task} busy={busy} onStatusChange={onStatusChange} onPatch={onPatch} />
        <TaskChecklistPanel task={task} busy={busy} onPatch={onPatch} />
        <TaskCommentsPanel task={task} />

        <div className="space-y-2.5 rounded-lg border bg-muted/30 p-3">
          <DetailRow label="Due">
            {task.dueAt ? (
              <span className="inline-flex items-center gap-1.5">
                {formatDateTime(task.dueAt)}
                {task.isOverdue ?? isOverdue(task.dueAt) ? (
                  <Badge variant="destructive">Overdue</Badge>
                ) : isDueToday(task.dueAt) ? (
                  <Badge className="border-warning/40 bg-warning/15 text-warning-foreground">
                    Today
                  </Badge>
                ) : null}
              </span>
            ) : (
              "—"
            )}
          </DetailRow>
          <DetailRow label="Client">
            {task.client ? (
              <button
                type="button"
                onClick={() => openClient(task.client!.id)}
                className="text-sm hover:underline"
              >
                {task.client.businessName}
              </button>
            ) : (
              "—"
            )}
          </DetailRow>
          <DetailRow label="Website">
            {task.website ? (
              <button
                type="button"
                onClick={() => openWebsite(task.website!.id)}
                className="text-sm hover:underline"
              >
                {task.website.name}
              </button>
            ) : (
              "—"
            )}
          </DetailRow>
          <DetailRow label="Project">
            {task.project ? (
              <button
                type="button"
                onClick={() => openProject(task.project!.id)}
                className="text-sm hover:underline"
              >
                {task.project.name}
              </button>
            ) : (
              "—"
            )}
          </DetailRow>
          <DetailRow label="Assignee">{task.assignee?.displayName ?? "Unassigned"}</DetailRow>
          <DetailRow label="Created">
            {formatDateTime(task.createdAt)}
            {task.createdBy?.displayName ? ` · by ${task.createdBy.displayName}` : ""}
          </DetailRow>
          {task.completedAt ? (
            <DetailRow label="Completed">{formatDateTime(task.completedAt)}</DetailRow>
          ) : null}
        </div>
      </div>

      <div className="space-y-2 border-t p-4">
        <Button
          className="w-full"
          onClick={onToggleComplete}
          disabled={busy}
          variant={completed ? "outline" : "default"}
        >
          {completed ? <RotateCcw aria-hidden /> : <CheckCircle2 aria-hidden />}
          {completed ? "Reopen task" : "Mark complete"}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onEdit} disabled={busy}>
            <Pencil aria-hidden />
            Edit
          </Button>
          {task.status !== "CANCELLED" ? (
            <Button variant="outline" className="text-destructive" onClick={onCancel} disabled={busy}>
              <Ban aria-hidden />
              Cancel task
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-xl border bg-card p-4">
          <Skeleton className="size-4" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-16" />
        </div>
      ))}
    </div>
  );
}
