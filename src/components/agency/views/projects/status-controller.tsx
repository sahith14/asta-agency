"use client";

/**
 * AgencyOS — project status controller for the detail header.
 * Options = allowedTransitions only (current status shown disabled), so
 * illegal moves are never offered. The server still validates (400 → revert
 * + toast with its message) — belt and braces.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, label, type ProjectRecord } from "@/lib/types";

type ProjectDetailPayload = { project: ProjectRecord; tasks: unknown[] };

export function StatusController({ project }: { project: ProjectRecord }) {
  const queryClient = useQueryClient();
  const detailKey = ["project", project.id] as const;

  const mutation = useMutation({
    mutationFn: (status: string) =>
      apiFetch<ProjectRecord>(`/api/projects/${project.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onMutate: async (status) => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<ProjectDetailPayload>(detailKey);
      queryClient.setQueryData<ProjectDetailPayload>(detailKey, (old) =>
        old ? { ...old, project: { ...old.project, status } } : old
      );
      return { previous };
    },
    onSuccess: (record) => {
      queryClient.setQueryData<ProjectDetailPayload>(detailKey, (old) =>
        old ? { ...old, project: record } : old
      );
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(`Status set to ${label(record.status)}.`);
    },
    onError: (error, _status, context) => {
      if (context?.previous) queryClient.setQueryData(detailKey, context.previous);
      toast.error((error as Error).message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: detailKey }),
  });

  const allowed = project.allowedTransitions ?? [];

  return (
    <Select
      value={project.status}
      onValueChange={(next) => {
        if (next !== project.status) mutation.mutate(next);
      }}
    >
      <SelectTrigger className="w-[190px]" aria-label="Change project status">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={project.status} disabled>
          {label(project.status)} — current
        </SelectItem>
        {allowed.map((status) => (
          <SelectItem key={status} value={status}>
            {label(status)}
          </SelectItem>
        ))}
        {allowed.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            This status is terminal — no further transitions.
          </p>
        ) : null}
      </SelectContent>
    </Select>
  );
}
