"use client";

/**
 * AgencyOS — Milestones tab of the project detail view.
 * Checklist rows toggle completion (optimistic PATCH /api/milestones/{id},
 * reverted on error); adding/removing hits
 * POST /api/projects/{id}/milestones and DELETE /api/milestones/{id}.
 * Milestones drive the project progress percentage, so the detail query is
 * re-invalidated after every change.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ListChecks, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/agency/shared/confirm-dialog";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { apiFetch, type MilestoneRecord, type ProjectRecord, type TaskRecord } from "@/lib/types";
import { formatDate, isOverdue } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ProjectDetailPayload = { project: ProjectRecord; tasks: TaskRecord[] };

export function MilestonesTab({
  project,
  onRefreshKey,
}: {
  project: ProjectRecord;
  /** Query key of the parent detail cache to invalidate/patch. */
  onRefreshKey: readonly unknown[];
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [removeTarget, setRemoveTarget] = useState<MilestoneRecord | null>(null);

  const milestones = project.milestones ?? [];

  const toggle = useMutation({
    mutationFn: ({ milestoneId, completed }: { milestoneId: string; completed: boolean }) =>
      apiFetch<MilestoneRecord>(`/api/milestones/${milestoneId}`, {
        method: "PATCH",
        body: JSON.stringify({ completed }),
      }),
    onMutate: async ({ milestoneId, completed }) => {
      await queryClient.cancelQueries({ queryKey: onRefreshKey });
      const previous = queryClient.getQueryData<ProjectDetailPayload>(onRefreshKey);
      queryClient.setQueryData<ProjectDetailPayload>(onRefreshKey, (old) =>
        old
          ? {
              ...old,
              project: {
                ...old.project,
                milestones: (old.project.milestones ?? []).map((m) =>
                  m.id === milestoneId
                    ? { ...m, completedAt: completed ? new Date().toISOString() : null }
                    : m
                ),
              },
            }
          : old
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(onRefreshKey, context.previous);
      toast.error((error as Error).message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: onRefreshKey }),
  });

  const add = useMutation({
    mutationFn: () =>
      apiFetch<MilestoneRecord>(`/api/projects/${project.id}/milestones`, {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), dueDate: dueDate || null }),
      }),
    onSuccess: (milestone) => {
      toast.success(`Milestone "${milestone.title}" added.`);
      setTitle("");
      setDueDate("");
      queryClient.invalidateQueries({ queryKey: onRefreshKey });
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const remove = useMutation({
    mutationFn: (milestoneId: string) =>
      apiFetch<{ id: string }>(`/api/milestones/${milestoneId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Milestone removed.");
      setRemoveTarget(null);
      queryClient.invalidateQueries({ queryKey: onRefreshKey });
    },
    onError: (error) => toast.error((error as Error).message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="New milestone, e.g. Design sign-off"
          aria-label="Milestone title"
          className="flex-1"
        />
        <Input
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          aria-label="Milestone due date"
          className="sm:w-40"
        />
        <Button
          disabled={!title.trim() || add.isPending}
          onClick={() => add.mutate()}
        >
          {add.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Add
        </Button>
      </div>

      {milestones.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No milestones yet"
          description="Add milestones to track delivery progress. They drive the project's progress percentage."
        />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {milestones.map((milestone) => {
            const done = Boolean(milestone.completedAt);
            const overdue = !done && isOverdue(milestone.dueDate);
            return (
              <li key={milestone.id} className="flex items-center gap-3 px-4 py-3">
                <Checkbox
                  checked={done}
                  onCheckedChange={(next) =>
                    toggle.mutate({ milestoneId: milestone.id, completed: next === true })
                  }
                  aria-label={`Toggle ${milestone.title}`}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate text-sm",
                      done && "text-muted-foreground line-through"
                    )}
                  >
                    {milestone.title}
                  </p>
                  <p
                    className={cn(
                      "text-xs",
                      overdue ? "font-medium text-destructive" : "text-muted-foreground"
                    )}
                  >
                    {milestone.dueDate
                      ? `Due ${formatDate(milestone.dueDate)}${overdue ? " · overdue" : ""}`
                      : "No due date"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${milestone.title}`}
                  onClick={() => setRemoveTarget(milestone)}
                >
                  <Trash2 className="size-4 text-muted-foreground" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
        title={`Remove "${removeTarget?.title ?? ""}"?`}
        description="The milestone is deleted and no longer counts towards project progress."
        confirmLabel="Remove milestone"
        destructive
        loading={remove.isPending}
        onConfirm={() => {
          if (removeTarget) remove.mutate(removeTarget.id);
        }}
      />
    </div>
  );
}
