"use client";

/**
 * AgencyOS — Project create/edit dialog.
 * Create → POST /api/projects; edit → PATCH /api/projects/{id}.
 * On edit the status Select only offers allowedTransitions (plus the current
 * status, disabled) — the server validates the same transition map, so this
 * is the "belt"; the 400 toast is the braces.
 */
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, label, PROJECT_STATUSES, PROJECT_TYPES } from "@/lib/types";
import type {
  ClientRecord,
  Paginated,
  ProjectRecord,
  WebsiteRecord,
} from "@/lib/types";
import { buildQuery } from "@/components/agency/shared/record-list-helpers";

const CURRENCIES = ["GBP", "EUR", "USD"];

const projectFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Project name must be at least 2 characters."),
  clientId: z.string().min(1, "Client is required."),
  projectType: z.string(),
  status: z.string(),
  price: z
    .string()
    .refine(
      (v) => v.trim() === "" || (!Number.isNaN(Number(v)) && Number(v) >= 0),
      "Enter a valid non-negative amount."
    ),
  currency: z.string(),
  scope: z.string(),
  startDate: z.string(),
  dueDate: z.string(),
  internalNotes: z.string(),
  websiteIds: z.array(z.string()),
});

type ProjectFormValues = z.infer<typeof projectFormSchema>;

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function emptyValues(seedClientId?: string): ProjectFormValues {
  return {
    name: "",
    clientId: seedClientId ?? "",
    projectType: "NEW_WEBSITE",
    status: "LEAD",
    price: "",
    currency: "GBP",
    scope: "",
    startDate: "",
    dueDate: "",
    internalNotes: "",
    websiteIds: [],
  };
}

function valuesFromProject(p: ProjectRecord): ProjectFormValues {
  return {
    name: p.name,
    clientId: p.clientId,
    projectType: p.projectType,
    status: p.status,
    price:
      p.agreedAmountMinor === null || p.agreedAmountMinor === undefined
        ? ""
        : (p.agreedAmountMinor / 100).toFixed(2),
    currency: p.currency,
    scope: p.scope ?? "",
    startDate: toDateInput(p.startDate),
    dueDate: toDateInput(p.dueDate),
    internalNotes: p.internalNotes ?? "",
    websiteIds: (p.websites ?? []).map((w) => w.id),
  };
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

export function ProjectFormDialog({
  open,
  onOpenChange,
  project,
  clients,
  clientsLoading,
  seedClientId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: ProjectRecord | null;
  clients: ClientRecord[];
  clientsLoading?: boolean;
  /** Pre-selected client when opened via the params.create convention. */
  seedClientId?: string;
  onSaved?: () => void;
}) {
  const isEdit = Boolean(project);
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: project ? valuesFromProject(project) : emptyValues(seedClientId),
  });
  const { register, handleSubmit, control, reset, formState } = form;
  const { errors } = formState;

  // Re-seed the form every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    reset(project ? valuesFromProject(project) : emptyValues(seedClientId));
  }, [open, project, seedClientId, reset]);

  const selectedClientId = useWatch({ control, name: "clientId" });

  const clientWebsitesQuery = useQuery({
    queryKey: ["websites", { clientId: selectedClientId, picker: true }],
    queryFn: () =>
      apiFetch<Paginated<WebsiteRecord>>(
        `/api/websites${buildQuery({ clientId: selectedClientId, pageSize: 100 })}`
      ),
    enabled: Boolean(selectedClientId),
  });
  const clientWebsites = clientWebsitesQuery.data?.items ?? [];

  // Edit: restrict status options to the recorded allowedTransitions.
  const statusOptions = isEdit
    ? [project!.status, ...(project?.allowedTransitions ?? []).filter((s) => s !== project!.status)]
    : [...PROJECT_STATUSES];

  async function onSubmit(values: ProjectFormValues) {
    setServerError(null);
    const priceNumber = values.price.trim() === "" ? null : Number(values.price);
    const body = JSON.stringify({
      name: values.name.trim(),
      clientId: values.clientId,
      projectType: values.projectType,
      status: values.status,
      agreedAmountMinor:
        priceNumber === null ? null : Math.round(priceNumber * 100),
      currency: values.currency,
      scope: values.scope.trim() || null,
      startDate: values.startDate || null,
      dueDate: values.dueDate || null,
      internalNotes: values.internalNotes.trim() || null,
      websiteIds: values.websiteIds,
    });
    try {
      if (isEdit && project) {
        await apiFetch<ProjectRecord>(`/api/projects/${project.id}`, {
          method: "PATCH",
          body,
        });
      } else {
        await apiFetch<ProjectRecord>("/api/projects", { method: "POST", body });
      }
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["project", project?.id] });
      await queryClient.invalidateQueries({ queryKey: ["client", values.clientId] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(isEdit ? "Project updated." : "Project created.");
      onOpenChange(false);
      onSaved?.();
    } catch (error) {
      const err = error as Error & { code?: string };
      // Illegal transitions (400) / validation errors surface verbatim.
      toast.error(err.message);
      setServerError(err.message);
    }
  }

  const allowedHint =
    isEdit && project
      ? (project.allowedTransitions ?? []).map((s) => label(s)).join(", ")
      : "";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setServerError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto scrollbar-thin sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit project" : "New project"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the project. Status changes are limited to the allowed flow."
              : "Create a project for a client and optionally link their websites."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {serverError ? (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                placeholder="e.g. Website redesign 2025"
                aria-invalid={!!errors.name}
                {...register("name")}
              />
              <FieldError message={errors.name?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-client">Client</Label>
              <Controller
                control={control}
                name="clientId"
                render={({ field }) => (
                  <Select
                    value={field.value || undefined}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger id="project-client" aria-invalid={!!errors.clientId}>
                      <SelectValue
                        placeholder={clientsLoading ? "Loading clients…" : "Select a client"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.length === 0 ? (
                        <p className="px-3 py-2 text-sm text-muted-foreground">
                          No clients found. Create a client first.
                        </p>
                      ) : (
                        clients.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.businessName}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError message={errors.clientId?.message} />
            </div>

            <div className="space-y-2">
              <Label>Project type</Label>
              <Controller
                control={control}
                name="projectType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROJECT_TYPES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {label(value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((value) => (
                        <SelectItem
                          key={value}
                          value={value}
                          disabled={isEdit && value === project?.status}
                        >
                          {label(value)}
                          {isEdit && value === project?.status ? " (current)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {isEdit ? (
                <p className="text-xs text-muted-foreground">
                  {allowedHint
                    ? `Allowed next: ${allowedHint}`
                    : "No further status transitions from here."}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-price">Agreed price (£)</Label>
              <Input
                id="project-price"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                placeholder="e.g. 1450.00"
                aria-invalid={!!errors.price}
                {...register("price")}
              />
              <FieldError message={errors.price?.message} />
            </div>

            <div className="space-y-2">
              <Label>Currency</Label>
              <Controller
                control={control}
                name="currency"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-start">Start date</Label>
              <Input
                id="project-start"
                type="date"
                {...register("startDate")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-due">Due date</Label>
              <Input
                id="project-due"
                type="date"
                {...register("dueDate")}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-scope">Scope</Label>
            <Textarea
              id="project-scope"
              rows={3}
              placeholder="What is being delivered…"
              {...register("scope")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-notes">Internal notes</Label>
            <Textarea
              id="project-notes"
              rows={2}
              placeholder="Internal-only context…"
              {...register("internalNotes")}
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Linked websites</Label>
            {!selectedClientId ? (
              <p className="text-sm text-muted-foreground">
                Select a client to see their websites.
              </p>
            ) : clientWebsitesQuery.isPending ? (
              <p className="text-sm text-muted-foreground">Loading websites…</p>
            ) : clientWebsites.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                This client has no websites yet.
              </p>
            ) : (
              <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-md border p-3 scrollbar-thin">
                {clientWebsites.map((website) => (
                  <Controller
                    key={website.id}
                    control={control}
                    name="websiteIds"
                    render={({ field }) => {
                      const checked = field.value.includes(website.id);
                      return (
                        <label
                          key={website.id}
                          className="flex cursor-pointer items-center gap-2 text-sm"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(next) => {
                              field.onChange(
                                next === true
                                  ? [...field.value, website.id]
                                  : field.value.filter((id) => id !== website.id)
                              );
                            }}
                          />
                          <span className="min-w-0 truncate">
                            {website.name}
                            {website.primaryDomain ? (
                              <span className="text-muted-foreground">
                                {" "}
                                · {website.primaryDomain}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      );
                    }}
                  />
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {isEdit
                ? "Saving replaces the website links with the ticked ones."
                : "Tick the websites this project covers (optional)."}
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={formState.isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={formState.isSubmitting}>
              {formState.isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
              {isEdit ? "Save changes" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
