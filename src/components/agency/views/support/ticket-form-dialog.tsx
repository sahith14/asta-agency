"use client";

/**
 * AgencyOS — shared create/edit ticket dialog (Support workspace, task 3-b).
 * Create → POST /api/tickets; edit → PATCH /api/tickets/{id}.
 * Edit mode restricts the status Select to allowedTransitions (plus the current
 * status, disabled) with an "Allowed next: …" hint, mirroring the projects
 * dialog. The ticket client is immutable, so edit mode never sends clientId.
 */
import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import {
  apiFetch,
  label,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_TRANSITIONS,
  type TicketRecord,
} from "@/lib/types";
import {
  useClientsLookup,
  useProjectsLookup,
  useUsersLookup,
  useWebsitesLookup,
} from "@/components/agency/views/tasks/lookups";

const NONE = "none";

const ticketFormSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(2, "Ticket subject must be at least 2 characters.")
    .max(200, "Ticket subject must be at most 200 characters."),
  description: z.string().max(5000, "Description must be 5000 characters or fewer."),
  priority: z.enum(TICKET_PRIORITIES),
  status: z.string().min(1),
});

type TicketFormValues = z.infer<typeof ticketFormSchema>;

/** Link ids + assignee live outside RHF (optional, no client-side validation). */
interface ExtraValues {
  clientId: string;
  websiteId: string;
  projectId: string;
  assigneeId: string;
}

export function TicketFormDialog({
  open,
  onOpenChange,
  ticket,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set the dialog edits this ticket, otherwise it creates a new one. */
  ticket?: TicketRecord | null;
  onSaved?: (ticket: TicketRecord) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent className="max-h-[90svh] overflow-y-auto scrollbar-thin sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{ticket ? "Edit ticket" : "New ticket"}</DialogTitle>
            <DialogDescription>
              {ticket
                ? "Update the ticket details. Status changes follow the allowed flow."
                : "Log a support ticket for a client. It starts on the ticket list immediately."}
            </DialogDescription>
          </DialogHeader>
          <TicketFormInner ticket={ticket ?? null} onOpenChange={onOpenChange} onSaved={onSaved} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function TicketFormInner({
  ticket,
  onOpenChange,
  onSaved,
}: {
  ticket: TicketRecord | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: (ticket: TicketRecord) => void;
}) {
  const isEdit = Boolean(ticket);
  const queryClient = useQueryClient();
  const users = useUsersLookup();

  const [serverError, setServerError] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  // Link ids + assignee live outside RHF; this dialog owns the client →
  // website/project cascade.
  const [extras, setExtras] = useState<ExtraValues>({
    clientId: ticket?.clientId ?? "",
    websiteId: ticket?.websiteId ?? "",
    projectId: ticket?.projectId ?? "",
    assigneeId: ticket?.assigneeId ?? "",
  });

  const form = useForm<TicketFormValues>({
    resolver: zodResolver(ticketFormSchema),
    defaultValues: {
      subject: ticket?.subject ?? "",
      description: ticket?.description ?? "",
      priority: (ticket?.priority ?? "NORMAL") as TicketFormValues["priority"],
      status: ticket?.status ?? "NEW",
    },
  });

  // Edit: restrict status options to the server's transition map.
  const allowedNext = isEdit ? (TICKET_TRANSITIONS[ticket!.status] ?? []) : [];
  const statusOptions = isEdit
    ? [ticket!.status, ...allowedNext.filter((s) => s !== ticket!.status)]
    : [...TICKET_STATUSES];

  const clients = useClientsLookup();
  const websites = useWebsitesLookup(extras.clientId);
  const projects = useProjectsLookup(extras.clientId);

  const saveMutation = useMutation({
    mutationFn: (values: TicketFormValues) => {
      const body = {
        subject: values.subject.trim(),
        description: values.description.trim() ? values.description.trim() : null,
        priority: values.priority,
        status: values.status,
        websiteId: extras.websiteId || null,
        projectId: extras.projectId || null,
        assigneeId: extras.assigneeId || null,
      };
      return isEdit && ticket
        ? apiFetch<TicketRecord>(`/api/tickets/${ticket.id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          })
        : apiFetch<TicketRecord>("/api/tickets", {
            method: "POST",
            body: JSON.stringify({ ...body, clientId: extras.clientId }),
          });
    },
    onSuccess: (saved) => {
      toast.success(isEdit ? "Ticket updated" : "Ticket created");
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      if (isEdit) queryClient.invalidateQueries({ queryKey: ["ticket", saved.id] });
      onOpenChange(false);
      onSaved?.(saved);
    },
    onError: (error: Error & { issues?: { path: string; message: string }[] }) => {
      setServerError(error.message || "Could not save the ticket.");
      for (const issue of error.issues ?? []) {
        if (issue.path && (ticketFormSchema.shape as Record<string, unknown>)[issue.path]) {
          form.setError(issue.path as keyof TicketFormValues, { message: issue.message });
        }
      }
    },
  });

  return (
    <form
      onSubmit={form.handleSubmit((values) => {
        setServerError(null);
        setClientError(null);
        if (!extras.clientId) {
          setClientError("Client is required.");
          return;
        }
        saveMutation.mutate(values);
      })}
      className="space-y-4"
      noValidate
    >
      {serverError ? (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="ticket-subject">Subject</Label>
        <Input
          id="ticket-subject"
          placeholder="e.g. Contact form stopped sending emails"
          autoFocus
          aria-invalid={!!form.formState.errors.subject}
          {...form.register("subject")}
        />
        {form.formState.errors.subject ? (
          <p className="text-xs text-destructive">{form.formState.errors.subject.message}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ticket-description">Description</Label>
        <Textarea
          id="ticket-description"
          rows={4}
          placeholder="What happened, when, and what the client expects."
          {...form.register("description")}
        />
        {form.formState.errors.description ? (
          <p className="text-xs text-destructive">{form.formState.errors.description.message}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label>Client</Label>
        <Select
          value={extras.clientId || NONE}
          onValueChange={(next) => {
            // The client is immutable on the server; on create it resets the cascade.
            setExtras((current) => ({
              ...current,
              clientId: next === NONE ? "" : next,
              websiteId: isEdit ? current.websiteId : "",
              projectId: isEdit ? current.projectId : "",
            }));
            setClientError(null);
          }}
          disabled={isEdit}
        >
          <SelectTrigger className="w-full" aria-label="Client">
            <SelectValue placeholder="Select a client" />
          </SelectTrigger>
          <SelectContent>
            {!isEdit ? <SelectItem value={NONE}>No client</SelectItem> : null}
            {(clients.data ?? []).map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.businessName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {clientError ? <p className="text-xs text-destructive">{clientError}</p> : null}
        {isEdit ? (
          <p className="text-xs text-muted-foreground">
            The client cannot be changed — create a new ticket if this was mis-filed.
          </p>
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
                <SelectTrigger className="w-full" aria-label="Ticket status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((status) => (
                    <SelectItem
                      key={status}
                      value={status}
                      disabled={isEdit && status === ticket?.status}
                    >
                      {label(status)}
                      {isEdit && status === ticket?.status ? " (current)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {isEdit ? (
            <p className="text-xs text-muted-foreground">
              {allowedNext.length > 0
                ? `Allowed next: ${allowedNext.map((s) => label(s)).join(", ")}`
                : "No further status transitions from here."}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label>Priority</Label>
          <Controller
            control={form.control}
            name="priority"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-full" aria-label="Ticket priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_PRIORITIES.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {label(priority)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Website</Label>
          <Select
            value={extras.websiteId || NONE}
            onValueChange={(next) =>
              setExtras((current) => ({ ...current, websiteId: next === NONE ? "" : next }))
            }
          >
            <SelectTrigger className="w-full" aria-label="Website (optional)">
              <SelectValue placeholder="No website" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No website</SelectItem>
              {(websites.data ?? []).map((website) => (
                <SelectItem key={website.id} value={website.id}>
                  {website.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Project</Label>
          <Select
            value={extras.projectId || NONE}
            onValueChange={(next) =>
              setExtras((current) => ({ ...current, projectId: next === NONE ? "" : next }))
            }
          >
            <SelectTrigger className="w-full" aria-label="Project (optional)">
              <SelectValue placeholder="No project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No project</SelectItem>
              {(projects.data ?? []).map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Assignee</Label>
        <Select
          value={extras.assigneeId || NONE}
          onValueChange={(next) =>
            setExtras((current) => ({ ...current, assigneeId: next === NONE ? "" : next }))
          }
        >
          <SelectTrigger className="w-full" aria-label="Assignee (optional)">
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
          {isEdit ? "Save changes" : "Create ticket"}
        </Button>
      </DialogFooter>
    </form>
  );
}
