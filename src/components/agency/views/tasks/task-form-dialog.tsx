"use client";

/**
 * AgencyOS — shared create/edit task dialog (Tasks view).
 * Validation is client-side (zod) and the server stays the source of truth:
 * per-field issues from the API are mapped back onto the form.
 */
import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  apiFetch,
  label,
  TASK_PRIORITIES,
  TASK_SOURCES,
  TASK_SCOPE_STATUSES,
  TASK_STATUSES,
  type TaskRecord,
} from "@/lib/types";
import { isoToLocalInput, localInputToIso, useUsersLookup } from "@/components/agency/views/tasks/lookups";
import { LinkFields, type LinkValue } from "@/components/agency/views/tasks/link-fields";

const NONE = "none";

const taskFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Task title must be at least 2 characters.")
    .max(200, "Task title must be at most 200 characters."),
  description: z.string().max(5000, "Description must be 5000 characters or fewer."),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(TASK_PRIORITIES),
  dueLocal: z.string(),
  assigneeId: z.string(),
  // Phase 5 — developer task module
  source: z.enum(TASK_SOURCES),
  estimatedMinutes: z.string(), // "" allowed; parsed server-side
  subscriptionAllowanceIncluded: z.boolean(),
  scopeStatus: z.enum(TASK_SCOPE_STATUSES),
  acceptanceCriteria: z.string().max(5000),
  approvalRequired: z.boolean(),
});

type TaskFormValues = z.infer<typeof taskFormSchema>;

export interface TaskFormDefaults {
  clientId?: string;
  websiteId?: string;
  projectId?: string;
}

export function TaskFormDialog({
  open,
  onOpenChange,
  task,
  defaults,
  defaultAssigneeId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set the dialog edits this task, otherwise it creates a new one. */
  task?: TaskRecord | null;
  /** Deep-link defaults for new tasks (client/website/project). */
  defaults?: TaskFormDefaults;
  /** Pre-selected assignee for new tasks (the signed-in user). */
  defaultAssigneeId?: string;
  onSaved?: (task: TaskRecord) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle>
            <DialogDescription>
              {task
                ? "Update the task details. Status changes follow the workflow (invalid moves are rejected by the server)."
                : "Describe the work and optionally link it to a client, website or project."}
            </DialogDescription>
          </DialogHeader>
          <TaskFormInner
            task={task ?? null}
            defaults={defaults}
            defaultAssigneeId={defaultAssigneeId}
            onOpenChange={onOpenChange}
            onSaved={onSaved}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function TaskFormInner({
  task,
  defaults,
  defaultAssigneeId,
  onOpenChange,
  onSaved,
}: {
  task: TaskRecord | null;
  defaults: TaskFormDefaults | undefined;
  defaultAssigneeId?: string;
  onOpenChange: (open: boolean) => void;
  onSaved?: (task: TaskRecord) => void;
}) {
  const queryClient = useQueryClient();
  const users = useUsersLookup();

  // Link ids live outside RHF (all optional, no validation needed) and the
  // cascade component owns their interdependency.
  const [links, setLinks] = useState<LinkValue>({
    clientId: task?.clientId ?? defaults?.clientId ?? "",
    websiteId: task?.websiteId ?? defaults?.websiteId ?? "",
    projectId: task?.projectId ?? defaults?.projectId ?? "",
  });

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: task?.title ?? "",
      description: task?.description ?? "",
      status: (task?.status ?? "BACKLOG") as TaskFormValues["status"],
      priority: (task?.priority ?? "NORMAL") as TaskFormValues["priority"],
      dueLocal: isoToLocalInput(task?.dueAt),
      assigneeId: task?.assigneeId ?? defaultAssigneeId ?? "",
      source: (task?.source ?? "FOUNDER_REQUEST") as TaskFormValues["source"],
      estimatedMinutes: task?.estimatedMinutes != null ? String(task.estimatedMinutes) : "",
      subscriptionAllowanceIncluded: task?.subscriptionAllowanceIncluded ?? false,
      scopeStatus: (task?.scopeStatus ?? "IN_SCOPE") as TaskFormValues["scopeStatus"],
      acceptanceCriteria: task?.acceptanceCriteria ?? "",
      approvalRequired: task?.approvalRequired ?? false,
    },
  });

  const saveMutation = useMutation({
    mutationFn: (values: TaskFormValues) => {
      const body = {
        title: values.title.trim(),
        description: values.description.trim() ? values.description.trim() : null,
        status: values.status,
        priority: values.priority,
        // Empty input -> null (clears the due date), filled -> ISO string.
        dueAt: localInputToIso(values.dueLocal),
        clientId: links.clientId || null,
        websiteId: links.websiteId || null,
        projectId: links.projectId || null,
        assigneeId: values.assigneeId || null,
        // Phase 5 fields
        source: values.source,
        estimatedMinutes: values.estimatedMinutes.trim() === "" ? null : Number(values.estimatedMinutes),
        subscriptionAllowanceIncluded: values.subscriptionAllowanceIncluded,
        scopeStatus: values.scopeStatus,
        acceptanceCriteria: values.acceptanceCriteria.trim() ? values.acceptanceCriteria.trim() : null,
        approvalRequired: values.approvalRequired,
      };
      return task
        ? apiFetch<TaskRecord>(`/api/tasks/${task.id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          })
        : apiFetch<TaskRecord>("/api/tasks", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: (saved) => {
      toast.success(task ? "Task updated" : "Task created");
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["client"] });
      queryClient.invalidateQueries({ queryKey: ["website"] });
      queryClient.invalidateQueries({ queryKey: ["project"] });
      if (task) queryClient.invalidateQueries({ queryKey: ["task", task.id] });
      onOpenChange(false);
      onSaved?.(saved);
    },
    onError: (error: Error & { issues?: { path: string; message: string }[] }) => {
      toast.error(error.message || "Could not save the task.");
      for (const issue of error.issues ?? []) {
        if (issue.path && (taskFormSchema.shape as Record<string, unknown>)[issue.path]) {
          form.setError(issue.path as keyof TaskFormValues, { message: issue.message });
        }
      }
    },
  });

  return (
    <form
      onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
      className="space-y-4"
      noValidate
    >
      <div className="space-y-1.5">
        <Label htmlFor="task-title">Title</Label>
        <Input
          id="task-title"
          placeholder="e.g. Chase client for launch content"
          autoFocus
          aria-invalid={!!form.formState.errors.title}
          {...form.register("title")}
        />
        {form.formState.errors.title ? (
          <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="task-description">Description</Label>
        <Textarea
          id="task-description"
          rows={3}
          placeholder="Optional detail — what needs doing, links, context."
          {...form.register("description")}
        />
        {form.formState.errors.description ? (
          <p className="text-xs text-destructive">{form.formState.errors.description.message}</p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Controller
            control={form.control}
            name="status"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {label(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Priority</Label>
          <Controller
            control={form.control}
            name="priority"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-full">
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
            )}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="task-due">Due date</Label>
          <Input id="task-due" type="datetime-local" {...form.register("dueLocal")} />
        </div>

        <div className="space-y-1.5">
          <Label>Assignee</Label>
          <Controller
            control={form.control}
            name="assigneeId"
            render={({ field }) => (
              <Select value={field.value || NONE} onValueChange={(v) => field.onChange(v === NONE ? "" : v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Unassigned</SelectItem>
                  {(users.data ?? []).map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Links</Label>
        <LinkFields value={links} onChange={setLinks} />
        <p className="text-xs text-muted-foreground">
          Websites and projects narrow to the chosen client.
        </p>
      </div>

      {/* Phase 5 — developer task module fields */}
      <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Developer workflow</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Source</Label>
            <Controller
              control={form.control}
              name="source"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_SOURCES.map((source) => (
                      <SelectItem key={source} value={source}>
                        {label(source)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Scope</Label>
            <Controller
              control={form.control}
              name="scopeStatus"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_SCOPE_STATUSES.map((scope) => (
                      <SelectItem key={scope} value={scope}>
                        {label(scope)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-estimate">Estimated effort (minutes)</Label>
            <Input
              id="task-estimate"
              type="number"
              min={0}
              step={15}
              placeholder="e.g. 90"
              {...form.register("estimatedMinutes")}
            />
          </div>
          <div className="flex items-end">
            <Controller
              control={form.control}
              name="subscriptionAllowanceIncluded"
              render={({ field }) => (
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                  Included in subscription allowance
                </label>
              )}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="task-acceptance">Acceptance criteria</Label>
          <Textarea
            id="task-acceptance"
            rows={2}
            placeholder="What must be true for this task to be accepted?"
            {...form.register("acceptanceCriteria")}
          />
        </div>
        <Controller
          control={form.control}
          name="approvalRequired"
          render={({ field }) => (
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
              Founder approval required before release
            </label>
          )}
        />
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={saveMutation.isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
          {task ? "Save changes" : "Create task"}
        </Button>
      </DialogFooter>
    </form>
  );
}
