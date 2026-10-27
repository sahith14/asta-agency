"use client";

/**
 * AgencyOS — task rows used inside the Website and Project detail views.
 * Both detail payloads already include the latest 20 tasks, so this renders
 * the shared read-only row pattern (title, status, priority dot, due, links)
 * plus the "New task" / "Open tasks board" actions that route into the
 * Tasks view via the navigation store.
 */
import { ExternalLink, ListChecks, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { useAppStore, openClient, openProject, openWebsite } from "@/components/agency/store";
import { isOverdue, formatDate } from "@/lib/format";
import { label, type TaskRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Priority label with a colored dot (CRITICAL/HIGH get the loud tones). */
export function PriorityDot({ priority }: { priority: string }) {
  const dot =
    priority === "CRITICAL"
      ? "bg-destructive"
      : priority === "HIGH"
        ? "bg-warning"
        : priority === "LOW"
          ? "bg-muted-foreground/40"
          : "bg-muted-foreground/70";
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", dot)} />
      {label(priority)}
    </span>
  );
}

function TaskLinkChip({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="inline-flex max-w-40 items-center gap-1 truncate rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
    >
      {children}
    </button>
  );
}

/**
 * Shared tasks card for detail views.
 * `links` controls which reference chips are shown per row; `newTaskParams`
 * seeds the Tasks view create flow via the params.create convention.
 */
export function DetailTaskList({
  tasks,
  links = [],
  newTaskParams,
  contextLabel = "this record",
}: {
  tasks: TaskRecord[];
  links?: Array<"client" | "website" | "project">;
  newTaskParams?: Record<string, string>;
  contextLabel?: string;
}) {
  const navigate = useAppStore((s) => s.navigate);

  const newTaskButton = newTaskParams ? (
    <Button size="sm" onClick={() => navigate("tasks", newTaskParams)}>
      <Plus className="size-4" />
      New task
    </Button>
  ) : null;

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title="No tasks yet"
        description={`Tasks linked to ${contextLabel} will appear here.`}
        action={newTaskButton}
      />
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">Tasks</CardTitle>
          <CardDescription>
            Latest {tasks.length} task{tasks.length === 1 ? "" : "s"}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {newTaskButton}
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("tasks")}
          >
            <ExternalLink className="size-4" />
            Open tasks board
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y border-t">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <p className="truncate text-sm font-medium">{task.title}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <PriorityDot priority={task.priority} />
                  <span
                    className={cn(
                      "text-xs",
                      task.isOverdue ? "font-medium text-destructive" : "text-muted-foreground"
                    )}
                  >
                    {task.dueAt ? `Due ${formatDate(task.dueAt)}` : "No due date"}
                  </span>
                  {task.isOverdue ? (
                    <span className="text-xs font-medium text-destructive">Overdue</span>
                  ) : null}
                  {links.includes("client") && task.client ? (
                    <TaskLinkChip onClick={() => openClient(task.client!.id)}>
                      {task.client.businessName}
                    </TaskLinkChip>
                  ) : null}
                  {links.includes("website") && task.website ? (
                    <TaskLinkChip onClick={() => openWebsite(task.website!.id)}>
                      {task.website.name}
                    </TaskLinkChip>
                  ) : null}
                  {links.includes("project") && task.project ? (
                    <TaskLinkChip onClick={() => openProject(task.project!.id)}>
                      {task.project.name}
                    </TaskLinkChip>
                  ) : null}
                </div>
              </div>
              <div className="shrink-0">
                <StatusBadge value={task.status} />
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
