"use client";

/**
 * AgencyOS — Projects kanban board.
 * Columns = the 9 pipeline statuses (LIVE / COMPLETED / CANCELLED are hidden
 * from the board; they are still reachable via the detail status controller
 * and the table view). Drag & drop via @dnd-kit/core: dropping a card on
 * another column optimistically moves it, then PATCHes /api/projects/{id}/status.
 * A 400 (illegal transition) reverts the card and surfaces the server's
 * "Cannot move project from X to Y. Allowed: …" message in a destructive toast.
 */
import { useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GripVertical, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { openProject } from "@/components/agency/store";
import { buildQuery } from "@/components/agency/shared/record-list-helpers";
import { LoadErrorState } from "@/components/agency/views/websites/list-bits";
import { apiFetch, label, type Paginated, type ProjectRecord } from "@/lib/types";
import { formatDate, isOverdue } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The 9 board-visible pipeline statuses (ACTIVE_PROJECT_STATUSES). */
const BOARD_STATUSES = [
  "LEAD",
  "QUOTED",
  "DEPOSIT_PAID",
  "IN_DEVELOPMENT",
  "CLIENT_REVIEW",
  "REVISIONS",
  "READY_TO_LAUNCH",
  "AWAITING_CLIENT",
  "ON_HOLD",
] as const;

export function KanbanBoard({
  clientId,
  search,
}: {
  clientId: string;
  search: string;
}) {
  const queryClient = useQueryClient();
  const [optimistic, setOptimistic] = useState<{ id: string; to: string } | null>(null);
  const kanbanKey = useMemo(
    () => ["projects", { kanban: true, clientId, search }] as const,
    [clientId, search]
  );

  const query = useQuery({
    queryKey: kanbanKey,
    queryFn: () =>
      apiFetch<Paginated<ProjectRecord>>(
        `/api/projects${buildQuery({ pageSize: 100, clientId, search })}`
      ),
    placeholderData: keepPreviousData,
  });

  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiFetch<ProjectRecord>(`/api/projects/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onMutate: ({ id, status }) => setOptimistic({ id, to: status }),
    onSuccess: (record) => {
      setOptimistic(null);
      queryClient.setQueryData<Paginated<ProjectRecord>>(kanbanKey, (old) =>
        old
          ? { ...old, items: old.items.map((p) => (p.id === record.id ? record : p)) }
          : old
      );
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["project", record.id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(`Moved "${record.name}" to ${label(record.status)}.`);
    },
    onError: (error) => {
      // Illegal transition (400) → revert the optimistic card and explain.
      setOptimistic(null);
      queryClient.invalidateQueries({ queryKey: kanbanKey });
      toast.error((error as Error).message);
    },
  });

  // Suppress the click that browsers fire right after a drag drop.
  const dragEndedAt = useRef(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const projects = query.data?.items ?? [];
  const effectiveStatus = (project: ProjectRecord): string =>
    optimistic && project.id === optimistic.id ? optimistic.to : project.status;

  const columns = BOARD_STATUSES.map((status) => ({
    status,
    projects: projects.filter((p) => effectiveStatus(p) === status),
  }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    dragEndedAt.current = Date.now();
    if (!over) return;
    const toStatus = over.data.current?.status as string | undefined;
    const fromStatus = active.data.current?.status as string | undefined;
    const projectId = String(active.id);
    if (!toStatus || toStatus === fromStatus) return;
    if (!projects.some((p) => p.id === projectId)) return;
    move.mutate({ id: projectId, status: toStatus });
  }

  if (query.isPending) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
        {BOARD_STATUSES.slice(0, 5).map((status) => (
          <div key={status} className="w-64 shrink-0 space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <LoadErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
    );
  }

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={LayoutGrid}
        title="No projects in the pipeline"
        description="Active projects appear here as draggable cards. Completed, live and cancelled projects are only shown in the table view."
      />
    );
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
        {columns.map((column) => (
          <KanbanColumn
            key={column.status}
            status={column.status}
            projects={column.projects}
            dragging={Boolean(optimistic && optimistic.to === column.status)}
            dragJustEnded={() => Date.now() - dragEndedAt.current < 250}
          />
        ))}
      </div>
    </DndContext>
  );
}

function KanbanColumn({
  status,
  projects,
  dragging,
  dragJustEnded,
}: {
  status: string;
  projects: ProjectRecord[];
  dragging: boolean;
  dragJustEnded: () => boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column-${status}`, data: { status } });
  return (
    <div className="flex w-64 shrink-0 flex-col rounded-xl border bg-muted/40">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <StatusBadge value={status} />
        <span className="text-xs tabular-nums text-muted-foreground">{projects.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex max-h-[26rem] flex-1 flex-col gap-2 overflow-y-auto rounded-b-xl p-2 scrollbar-thin",
          isOver && "bg-primary/5 ring-1 ring-inset ring-primary/30",
          dragging && "ring-1 ring-inset ring-primary/20"
        )}
      >
        {projects.length === 0 ? (
          <p className="rounded-lg border border-dashed px-2 py-6 text-center text-xs text-muted-foreground">
            Nothing here
          </p>
        ) : (
          projects.map((project) => (
            <KanbanCard key={project.id} project={project} dragJustEnded={dragJustEnded} />
          ))
        )}
      </div>
    </div>
  );
}

function KanbanCard({
  project,
  dragJustEnded,
}: {
  project: ProjectRecord;
  dragJustEnded: () => boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: project.id,
    data: { status: project.status },
  });
  const overdue = isOverdue(project.dueDate);

  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: CSS.Translate.toString(transform) } : undefined}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (dragJustEnded()) return; // ignore the click a drag leaves behind
        openProject(project.id);
      }}
      className={cn(
        "cursor-grab touch-none rounded-lg border bg-card p-3 shadow-xs select-none active:cursor-grabbing",
        isDragging && "z-20 opacity-70 shadow-lg ring-1 ring-primary/40"
      )}
    >
      <span className="flex items-start gap-1.5">
        <GripVertical className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{project.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {project.client?.businessName ?? "—"}
          </span>
        </span>
      </span>
      <div className="mt-2.5 space-y-1.5">
        <p className={cn("text-xs", overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
          {project.dueDate ? `Due ${formatDate(project.dueDate)}` : "No due date"}
          {overdue ? " · overdue" : ""}
        </p>
        <div className="flex items-center gap-2">
          <Progress value={project.progress ?? 0} className="h-1.5 flex-1" />
          <span className="text-xs tabular-nums text-muted-foreground">
            {project.progress ?? 0}%
          </span>
        </div>
      </div>
    </div>
  );
}
