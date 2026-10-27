"use client";

/**
 * AgencyOS — related tasks card (Support workspace, task 3-b).
 * Tasks linked to a ticket: complete toggle (optimistic), open in the Tasks
 * view (deep link via params.taskId), create a new task (reuses TaskFormDialog
 * and links it afterwards via PATCH {ticketId}), link an existing task
 * (searchable picker) and unlink with confirmation.
 */
import { useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  CalendarClock,
  Link2,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  SearchX,
  Unlink,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { ConfirmDialog } from "@/components/agency/shared/confirm-dialog";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { buildQuery } from "@/components/agency/shared/record-list-helpers";
import { useAppStore } from "@/components/agency/store";
import { apiFetch, label, type Paginated, type TaskRecord, type TicketRecord } from "@/lib/types";
import { formatDate, isOverdue } from "@/lib/format";
import { useDebouncedValue } from "@/components/agency/views/tasks/lookups";
import { TaskFormDialog } from "@/components/agency/views/tasks/task-form-dialog";
import { PriorityDot } from "@/components/agency/views/support/list-bits";

export function RelatedTasksCard({ ticket, tasks }: { ticket: TicketRecord; tasks: TaskRecord[] }) {
  const queryClient = useQueryClient();
  const navigate = useAppStore((s) => s.navigate);
  const user = useAppStore((s) => s.user);

  const [createOpen, setCreateOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState<TaskRecord | null>(null);

  function invalidateTicketTasks() {
    void queryClient.invalidateQueries({ queryKey: ["ticket", ticket.id] });
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  // Optimistic complete toggle (same pattern as the Tasks view, applied to the
  // ticket detail cache).
  const toggleComplete = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      apiFetch<TaskRecord>(`/api/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ completed }),
      }),
    onMutate: async ({ id, completed }) => {
      const detailKey = ["ticket", ticket.id] as const;
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<{ tasks: TaskRecord[] }>(detailKey);
      queryClient.setQueryData(detailKey, (old: unknown) => {
        if (!old || typeof old !== "object") return old;
        const data = old as { tasks?: TaskRecord[] };
        return {
          ...data,
          tasks: (data.tasks ?? []).map((task) =>
            task.id === id
              ? {
                  ...task,
                  status: completed ? "COMPLETED" : "TODO",
                  completedAt: completed ? new Date().toISOString() : null,
                  isOverdue: completed
                    ? false
                    : !!task.dueAt && new Date(task.dueAt).getTime() < Date.now(),
                }
              : task,
          ),
        };
      });
      return { previous };
    },
    onError: (error: Error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["ticket", ticket.id], context.previous);
      }
      toast.error(error.message || "Could not update the task.");
    },
    onSettled: () => invalidateTicketTasks(),
  });

  // Links a task (existing or freshly created) to this ticket.
  const linkTask = useMutation({
    mutationFn: (taskId: string) =>
      apiFetch<TaskRecord>(`/api/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ ticketId: ticket.id }),
      }),
    onSuccess: (task) => {
      invalidateTicketTasks();
      toast.success(`Linked "${task.title}" to this ticket`);
      setLinkOpen(false);
    },
    onError: (error: Error) => toast.error(error.message || "Could not link the task."),
  });

  const unlinkTask = useMutation({
    mutationFn: (taskId: string) =>
      apiFetch<TaskRecord>(`/api/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ ticketId: null }),
      }),
    onSuccess: (task) => {
      invalidateTicketTasks();
      toast.success(`Unlinked "${task.title}"`);
      setUnlinkTarget(null);
    },
    onError: (error: Error) => toast.error(error.message || "Could not unlink the task."),
  });

  const pendingToggleId = toggleComplete.isPending ? toggleComplete.variables?.id : null;
  const linkedIds = new Set(tasks.map((task) => task.id));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Related tasks</CardTitle>
        <CardDescription>Work linked to this ticket — click a row to open it in Tasks.</CardDescription>
        <CardAction>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setLinkOpen(true)}>
              <Link2 aria-hidden />
              Link existing
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden />
              New task
            </Button>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <EmptyState
            icon={Link2}
            title="No tasks linked yet"
            description="Create a task from this ticket or link an existing one to track the follow-up work."
            className="py-6"
          />
        ) : (
          <ul className="space-y-2">
            {tasks.map((task) => {
              const completed = task.status === "COMPLETED";
              const overdue = task.isOverdue ?? isOverdue(task.dueAt);
              return (
                <li
                  key={task.id}
                  className="record-row -mx-2 flex w-[calc(100%+1rem)] items-start gap-2.5 rounded-lg px-2 py-2"
                >
                  <div onClick={(event) => event.stopPropagation()} className="pt-0.5">
                    <Checkbox
                      checked={completed}
                      onCheckedChange={(checked) =>
                        toggleComplete.mutate({ id: task.id, completed: checked === true })
                      }
                      disabled={pendingToggleId === task.id}
                      aria-label={completed ? "Reopen task" : "Mark task complete"}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate("tasks", { taskId: task.id })}
                    className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <p
                      className={
                        completed
                          ? "truncate text-sm font-medium text-muted-foreground line-through"
                          : "truncate text-sm font-medium"
                      }
                    >
                      {task.title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <PriorityDot priority={task.priority} />
                        {label(task.priority)}
                      </span>
                      <StatusBadge value={task.status} />
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock aria-hidden className="size-3" />
                        {task.dueAt ? (
                          <span className={overdue ? "font-medium text-destructive" : undefined}>
                            {formatDate(task.dueAt)}
                            {overdue ? " · overdue" : ""}
                          </span>
                        ) : (
                          "No due date"
                        )}
                      </span>
                    </div>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0"
                        aria-label={`Actions for ${task.title}`}
                      >
                        <MoreHorizontal aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => navigate("tasks", { taskId: task.id })}>
                        <Link2 aria-hidden />
                        Open in Tasks
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={() => setUnlinkTarget(task)}>
                        <Unlink aria-hidden />
                        Unlink from ticket
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      {/* New task: reuse the shared dialog, then link the created task. */}
      <TaskFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaults={{
          clientId: ticket.clientId,
          websiteId: ticket.websiteId ?? undefined,
          projectId: ticket.projectId ?? undefined,
        }}
        defaultAssigneeId={user?.id}
        onSaved={(created) => linkTask.mutate(created.id)}
      />

      <LinkTaskDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        linkedIds={linkedIds}
        linking={linkTask.isPending}
        onLink={(taskId) => linkTask.mutate(taskId)}
      />

      <ConfirmDialog
        open={!!unlinkTarget}
        onOpenChange={(open) => !open && setUnlinkTarget(null)}
        title="Unlink this task?"
        description={
          unlinkTarget
            ? `"${unlinkTarget.title}" will no longer be associated with this ticket. The task itself is kept.`
            : ""
        }
        confirmLabel="Unlink task"
        destructive
        loading={unlinkTask.isPending}
        onConfirm={() => unlinkTarget && unlinkTask.mutate(unlinkTarget.id)}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Link existing task dialog (searchable, excludes already-linked)
// ---------------------------------------------------------------------------

function LinkTaskDialog({
  open,
  onOpenChange,
  linkedIds,
  linking,
  onLink,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  linkedIds: Set<string>;
  linking: boolean;
  onLink: (taskId: string) => void;
}) {
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput);

  const query = useQuery({
    queryKey: ["ticket-options", { search }],
    queryFn: () =>
      apiFetch<Paginated<TaskRecord>>(
        `/api/tasks${buildQuery({
          search: search || undefined,
          pageSize: 10,
          sort: "createdAt",
          dir: "desc",
        })}`,
      ),
    enabled: open,
    placeholderData: keepPreviousData,
  });

  const candidates = (query.data?.items ?? []).filter((task) => !linkedIds.has(task.id));

  function handleClose(next: boolean) {
    if (!next) {
      setSearchInput("");
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link an existing task</DialogTitle>
          <DialogDescription>
            Search tasks and pick one — it will be linked to this ticket.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search tasks by title…"
              aria-label="Search tasks"
              className="pl-9"
            />
          </div>

          <div className="scrollbar-thin max-h-72 space-y-1.5 overflow-y-auto">
            {query.isLoading ? (
              <div className="space-y-2" aria-busy>
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-14 animate-pulse rounded-lg border bg-muted/40" />
                ))}
              </div>
            ) : query.isError ? (
              <EmptyState
                icon={SearchX}
                title="Tasks could not be loaded"
                description={(query.error as Error)?.message ?? "Something went wrong."}
                className="py-6"
              />
            ) : candidates.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title="No tasks found"
                description={
                  searchInput
                    ? "Nothing matches this search (or the tasks are already linked)."
                    : "Create a task first, then link it here."
                }
                className="py-6"
              />
            ) : (
              candidates.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  disabled={linking}
                  onClick={() => onLink(task.id)}
                  className="record-row flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{task.title}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      {task.client ? <span className="truncate">{task.client.businessName}</span> : null}
                      <StatusBadge value={task.status} />
                    </span>
                  </span>
                  {linking ? <Loader2 aria-hidden className="size-4 shrink-0 animate-spin" /> : null}
                </button>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
