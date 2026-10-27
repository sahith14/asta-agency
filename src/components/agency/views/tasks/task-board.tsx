"use client";

/**
 * AgencyOS — developer task board (Phase 5, spec §5).
 *
 * Columns follow the Phase 5 workflow (DEV_TASK_STATUSES). Legacy rows are
 * mapped visually (TODO → Backlog, WAITING → Blocked) without mutating data —
 * their real badge still shows the legacy status in the detail drawer.
 * Clicking a card opens the shared detail drawer, where transitions are
 * validated against TASK_TRANSITIONS and enforced server-side.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ListTodo } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { apiFetch, label, type Paginated, type TaskRecord } from "@/lib/types";
import { buildQuery } from "@/components/agency/shared/record-list-helpers";
import { initials } from "@/components/agency/shared/record-list-helpers";

/** Board columns, in workflow order. */
const COLUMNS: { key: string; label: string; matches: readonly string[] }[] = [
  { key: "BACKLOG", label: "Backlog", matches: ["BACKLOG", "TODO"] },
  { key: "READY", label: "Ready", matches: ["READY"] },
  { key: "IN_PROGRESS", label: "In Progress", matches: ["IN_PROGRESS"] },
  { key: "BLOCKED", label: "Blocked", matches: ["BLOCKED", "WAITING"] },
  { key: "IN_REVIEW", label: "In Review", matches: ["IN_REVIEW"] },
  { key: "APPROVAL_REQUIRED", label: "Approval", matches: ["APPROVAL_REQUIRED"] },
  { key: "APPROVED", label: "Approved", matches: ["APPROVED"] },
  { key: "DEPLOYED", label: "Deployed", matches: ["DEPLOYED"] },
];

const PRIORITY_DOT: Record<string, string> = {
  CRITICAL: "bg-destructive",
  HIGH: "bg-warning",
  NORMAL: "bg-muted-foreground/40",
  LOW: "bg-muted-foreground/20",
};

export function displayTaskNumber(task: Pick<TaskRecord, "taskNumber" | "id">): string {
  return task.taskNumber != null ? `T-${String(task.taskNumber).padStart(4, "0")}` : task.id.slice(-6).toUpperCase();
}

export function TaskBoard({
  onOpenTask,
  developerId,
}: {
  onOpenTask: (id: string) => void;
  /** When set (developer role), the board shows only that user's open tasks. */
  developerId?: string;
}) {
  const query = useQuery({
    queryKey: ["tasks", "board", developerId ?? "all"],
    queryFn: () => {
      const params: Record<string, string | number> = {
        status: "BACKLOG,READY,IN_PROGRESS,BLOCKED,IN_REVIEW,APPROVAL_REQUIRED,APPROVED,DEPLOYED,TODO,WAITING",
        pageSize: 100,
        sort: "dueAt",
        dir: "asc",
      };
      if (developerId) params.assigneeId = developerId;
      return apiFetch<Paginated<TaskRecord>>(`/api/tasks${buildQuery(params)}`);
    },
  });

  const byColumn = useMemo(() => {
    const map = new Map<string, TaskRecord[]>(COLUMNS.map((c) => [c.key, []]));
    for (const task of query.data?.items ?? []) {
      const column = COLUMNS.find((c) => c.matches.includes(task.status));
      if (column) map.get(column.key)!.push(task);
    }
    // Within a column: overdue first, then due-date order.
    for (const list of map.values()) {
      list.sort((a, b) => {
        const aOver = a.isOverdue ? 0 : 1;
        const bOver = b.isOverdue ? 0 : 1;
        if (aOver !== bOver) return aOver - bOver;
        const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
        const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
        return aDue - bDue;
      });
    }
    return map;
  }, [query.data]);

  if (query.isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-48" />
        ))}
      </div>
    );
  }

  if ((query.data?.items.length ?? 0) === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card/60 px-6 py-12 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-muted">
          <ListTodo aria-hidden className="size-5 text-muted-foreground" />
        </span>
        <div className="space-y-1">
          <p className="text-sm font-medium">No open workflow tasks</p>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            Cards appear here as tasks move through the development workflow.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 scrollbar-thin sm:mx-0 sm:px-0">
      <div className="grid min-w-[900px] grid-cols-8 gap-3 lg:min-w-0">
        {COLUMNS.map((column) => {
          const tasks = byColumn.get(column.key) ?? [];
          return (
            <div key={column.key} className="flex min-w-0 flex-col gap-2">
              <div className="flex items-center justify-between rounded-md border bg-muted/40 px-2.5 py-1.5">
                <span className="truncate text-xs font-semibold">{column.label}</span>
                <span className="rounded-full bg-background px-1.5 text-[10px] font-medium text-muted-foreground">
                  {tasks.length}
                </span>
              </div>
              <div className="min-h-16 space-y-2">
                {tasks.slice(0, 12).map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onOpenTask(task.id)}
                    className="w-full rounded-lg border bg-card p-2.5 text-left outline-none transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-center gap-1.5">
                      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", PRIORITY_DOT[task.priority] ?? "bg-muted-foreground/40")} />
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {displayTaskNumber(task)}
                      </span>
                      {task.isOverdue ? (
                        <span className="rounded bg-destructive/10 px-1 text-[10px] font-medium text-destructive">overdue</span>
                      ) : null}
                    </div>
                    <p className="mt-1 line-clamp-3 text-xs leading-snug font-medium">{task.title}</p>
                    <div className="mt-1.5 flex items-center justify-between gap-1">
                      <span className="min-w-0 truncate text-[10px] text-muted-foreground">
                        {task.client?.businessName ?? task.project?.name ?? "—"}
                      </span>
                      {task.assignee ? (
                        <span
                          title={task.assignee.displayName}
                          className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[8px] font-semibold text-primary"
                        >
                          {initials(task.assignee.displayName)}
                        </span>
                      ) : null}
                    </div>
                    {task.status !== column.key && (task.status === "TODO" || task.status === "WAITING") ? (
                      <span className="mt-1 block text-[9px] text-muted-foreground">legacy: {label(task.status)}</span>
                    ) : null}
                  </button>
                ))}
                {tasks.length > 12 ? (
                  <p className="px-1 text-[10px] text-muted-foreground">+{tasks.length - 12} more…</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
