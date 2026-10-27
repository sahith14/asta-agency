"use client";

/**
 * AgencyOS — ticket detail (Support workspace, task 3-b).
 *
 * Layout: header (number chip, subject, badges, status controller, resolve /
 * reopen / edit) + two-column body — conversation, reply composer, internal
 * notes and related tasks on the left; context sidebar (linked records,
 * assignment, meta, resolution, activity) on the right. Stacks below xl.
 *
 * Data: useQuery(["ticket", id]) → TicketDetailData (ticket, messages, tasks,
 * activity, allowedTransitions). Status changes are optimistic with rollback;
 * a 400 surfaces the server message verbatim.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity as ActivityIcon,
  ArrowLeft,
  CheckCircle2,
  Globe,
  LifeBuoy,
  Loader2,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { openClient, openProject, openWebsite, useAppStore } from "@/components/agency/store";
import {
  apiFetch,
  label,
  OPEN_TICKET_STATUSES,
  TICKET_PRIORITIES,
  type ActivityRecord,
  type ClientRecord,
  type TicketDetailData,
  type TicketMessageRecord,
  type TicketRecord,
} from "@/lib/types";
import { formatDateTime, timeAgo } from "@/lib/format";
import { useUsersLookup } from "@/components/agency/views/tasks/lookups";
import { ActivityTimeline } from "@/components/agency/views/dashboard/activity-timeline";
import { TicketNumberChip } from "@/components/agency/views/support/list-bits";
import { TicketFormDialog } from "@/components/agency/views/support/ticket-form-dialog";
import { ConversationCard, NoteComposer } from "@/components/agency/views/support/conversation-timeline";
import { ReplyComposer } from "@/components/agency/views/support/reply-composer";
import { RelatedTasksCard } from "@/components/agency/views/support/related-tasks-card";

export default function TicketDetail() {
  const id = useAppStore((s) => s.params.id);
  const back = useAppStore((s) => s.back);
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolveSummary, setResolveSummary] = useState("");
  const [resolving, setResolving] = useState(false);
  const [editDraft, setEditDraft] = useState<TicketMessageRecord | null>(null);

  const detailQuery = useQuery({
    queryKey: ["ticket", id],
    queryFn: () => apiFetch<TicketDetailData>(`/api/tickets/${id}`),
    enabled: !!id,
  });

  const ticket = detailQuery.data?.ticket;
  const clientId = ticket?.clientId ?? null;

  // Client record for the sidebar status badge + composer To prefill.
  // Deliberately under the "ticket-options" namespace (["client", id] belongs
  // to the client detail view).
  const clientQuery = useQuery({
    queryKey: ["ticket-options", "client", clientId],
    queryFn: () => apiFetch<{ client: ClientRecord }>(`/api/clients/${clientId}`),
    enabled: !!clientId,
    staleTime: 60_000,
    retry: false,
  });

  const detailKey = ["ticket", id] as const;

  // --- status (optimistic with rollback) ------------------------------------
  const statusMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<TicketRecord>(`/api/tickets/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<TicketDetailData>(detailKey);
      if (typeof body.status === "string") {
        queryClient.setQueryData<TicketDetailData>(detailKey, (old) =>
          old ? { ...old, ticket: { ...old.ticket, status: body.status as string } } : old,
        );
      }
      return { previous };
    },
    onSuccess: (record) => {
      queryClient.setQueryData<TicketDetailData>(detailKey, (old) =>
        old ? { ...old, ticket: record } : old,
      );
      void queryClient.invalidateQueries({ queryKey: ["tickets"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(`Status set to ${label(record.status)}.`);
    },
    onError: (error: Error, _body, context) => {
      if (context?.previous) queryClient.setQueryData(detailKey, context.previous);
      toast.error(error.message || "Could not update the ticket.");
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: detailKey }),
  });

  // --- assignment / priority quick controls ---------------------------------
  const quickUpdate = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<TicketRecord>(`/api/tickets/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: (record, body) => {
      queryClient.setQueryData<TicketDetailData>(detailKey, (old) =>
        old ? { ...old, ticket: record } : old,
      );
      void queryClient.invalidateQueries({ queryKey: ["tickets"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      if ("priority" in body) toast.success(`Priority set to ${label(record.priority)}.`);
      else toast.success(record.assignee ? `Assigned to ${record.assignee.displayName}.` : "Assignee cleared.");
    },
    onError: (error: Error) => toast.error(error.message || "Could not update the ticket."),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: detailKey }),
  });

  // --- render gates -----------------------------------------------------------

  if (!id) {
    return (
      <div className="space-y-6">
        <PageHeaderLite title="Ticket" onBack={back} />
        <EmptyState
          icon={LifeBuoy}
          title="No ticket selected"
          description="Pick a ticket from the Support list."
          action={
            <Button variant="outline" onClick={back}>
              Back to Support
            </Button>
          }
        />
      </div>
    );
  }

  const detailError = detailQuery.error as (Error & { code?: string }) | null;
  if (detailQuery.isError && detailError?.code === "NOT_FOUND") {
    return (
      <div className="space-y-6">
        <PageHeaderLite title="Ticket" onBack={back} />
        <EmptyState
          icon={LifeBuoy}
          title="Ticket not found"
          description="This ticket may have been removed or the link is out of date."
          action={
            <Button variant="outline" onClick={back}>
              Back to Support
            </Button>
          }
        />
      </div>
    );
  }
  if (detailQuery.isError) {
    return (
      <div className="space-y-6">
        <PageHeaderLite title="Ticket" onBack={back} />
        <EmptyState
          icon={LifeBuoy}
          title="Could not load this ticket"
          description={detailError?.message ?? "Check your connection and try again."}
          action={
            <Button variant="outline" onClick={() => void detailQuery.refetch()}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }
  if (detailQuery.isLoading || !detailQuery.data || !ticket) {
    return <DetailSkeleton />;
  }

  const data = detailQuery.data;
  const allowed = data.allowedTransitions ?? [];
  const showResolve =
    (OPEN_TICKET_STATUSES as readonly string[]).includes(ticket.status) && allowed.includes("RESOLVED");
  const showReopen = ticket.status === "RESOLVED" || ticket.status === "CLOSED";

  function handleStatusSelect(next: string) {
    if (next === ticket!.status) return;
    if (next === "RESOLVED") {
      // Resolving requires a summary — collect it in a dedicated dialog and
      // PATCH status + summary together.
      setResolveSummary(ticket!.resolutionSummary ?? "");
      setResolveOpen(true);
      return;
    }
    statusMutation.mutate({ status: next });
  }

  async function confirmResolve() {
    if (!resolveSummary.trim() || resolving) return;
    setResolving(true);
    try {
      await statusMutation.mutateAsync({
        status: "RESOLVED",
        resolutionSummary: resolveSummary.trim(),
      });
      setResolveOpen(false);
    } catch {
      // The mutation surfaced the server message; keep the dialog open so the
      // draft summary is not lost.
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={back}
            aria-label="Go back"
            className="mt-0.5 size-8 shrink-0"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <TicketNumberChip number={ticket.number} />
              <h2 className="min-w-0 text-xl font-semibold break-words tracking-tight sm:text-2xl">
                {ticket.subject}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <StatusBadge value={ticket.status} />
              <StatusBadge value={ticket.priority} />
              <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {label(ticket.source)}
              </span>
              <span aria-hidden>·</span>
              <span>Created {timeAgo(ticket.createdAt)}</span>
              <span aria-hidden>·</span>
              <span>{ticket.assignee?.displayName ?? "Unassigned"}</span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <StatusSelect
            ticket={ticket}
            allowed={allowed}
            busy={statusMutation.isPending}
            onChange={handleStatusSelect}
          />
          {showResolve ? (
            <Button
              variant="outline"
              onClick={() => {
                setResolveSummary(ticket.resolutionSummary ?? "");
                setResolveOpen(true);
              }}
            >
              <CheckCircle2 aria-hidden />
              Resolve
            </Button>
          ) : null}
          {showReopen ? (
            <Button
              variant="outline"
              onClick={() => statusMutation.mutate({ status: "OPEN" })}
              disabled={statusMutation.isPending}
            >
              <RotateCcw aria-hidden />
              Reopen
            </Button>
          ) : null}
          <Button onClick={() => setEditOpen(true)}>
            <Pencil aria-hidden />
            Edit
          </Button>
        </div>
      </div>

      {/* Body: conversation column + context sidebar */}
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <div className="min-w-0 space-y-4">
          <ConversationCard ticket={ticket} messages={data.messages} onEditDraft={setEditDraft} />
          <ReplyComposer
            ticket={ticket}
            messages={data.messages}
            editDraft={editDraft}
            onExitEdit={() => setEditDraft(null)}
            customerEmail={clientQuery.data?.client.email ?? null}
          />
          <NoteComposer ticketId={ticket.id} />
          <RelatedTasksCard ticket={ticket} tasks={data.tasks} />
        </div>

        <aside className="min-w-0 space-y-4">
          <LinkedRecordsCard
            ticket={ticket}
            client={clientQuery.data?.client ?? null}
            clientLoading={clientQuery.isLoading}
          />
          <AssignmentCard
            ticket={ticket}
            busy={quickUpdate.isPending}
            onPriorityChange={(priority) => quickUpdate.mutate({ priority })}
            onAssigneeChange={(assigneeId) => quickUpdate.mutate({ assigneeId })}
          />
          <MetaCard ticket={ticket} />
          {ticket.resolutionSummary ? <ResolutionCard summary={ticket.resolutionSummary} /> : null}
          <ActivityCard items={data.activity} loading={detailQuery.isLoading} />
        </aside>
      </div>

      {/* Edit dialog */}
      <TicketFormDialog open={editOpen} onOpenChange={setEditOpen} ticket={ticket} />

      {/* Resolve dialog (status + summary patched together) */}
      <Dialog open={resolveOpen} onOpenChange={(open) => !open && setResolveOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Resolve ticket</DialogTitle>
            <DialogDescription>
              Add a resolution summary — it is required before a ticket can be resolved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="resolution-summary">Resolution summary</Label>
            <Textarea
              id="resolution-summary"
              rows={4}
              value={resolveSummary}
              onChange={(event) => setResolveSummary(event.target.value)}
              placeholder="What was the outcome? e.g. Reset the mailbox password and confirmed sign-in works."
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveOpen(false)} disabled={resolving}>
              Cancel
            </Button>
            <Button onClick={confirmResolve} disabled={!resolveSummary.trim() || resolving}>
              {resolving ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
              Resolve ticket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

/** Detail pages have no page padding of their own — plain header + back button. */
function PageHeaderLite({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <Button variant="outline" size="icon" onClick={onBack} aria-label="Go back" className="mt-0.5 size-8 shrink-0">
        <ArrowLeft className="size-4" />
      </Button>
      <h2 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
    </div>
  );
}

/** Status options = allowedTransitions only (current shown disabled). */
function StatusSelect({
  ticket,
  allowed,
  busy,
  onChange,
}: {
  ticket: TicketRecord;
  allowed: string[];
  busy: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <Select value={ticket.status} onValueChange={onChange} disabled={busy}>
      <SelectTrigger className="w-[190px]" aria-label="Change ticket status">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ticket.status} disabled>
          {label(ticket.status)} — current
        </SelectItem>
        {allowed.map((status) => (
          <SelectItem key={status} value={status}>
            {label(status)}
          </SelectItem>
        ))}
        {allowed.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            This status is terminal — reopen it to make further changes.
          </p>
        ) : null}
      </SelectContent>
    </Select>
  );
}

function DetailRow({ label: rowLabel, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
      <span className="w-28 shrink-0 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {rowLabel}
      </span>
      <span className="min-w-0 text-sm break-words">{children}</span>
    </div>
  );
}

function LinkedRecordsCard({
  ticket,
  client,
  clientLoading,
}: {
  ticket: TicketRecord;
  client: ClientRecord | null;
  clientLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Linked records</CardTitle>
        <CardDescription>Context this ticket belongs to.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Client</p>
          {clientLoading && !client ? (
            <Skeleton className="h-5 w-40" />
          ) : client ? (
            <button
              type="button"
              onClick={() => openClient(client.id)}
              className="flex w-full items-center justify-between gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="truncate text-sm font-medium hover:underline">{client.businessName}</span>
              <StatusBadge value={client.status} />
            </button>
          ) : ticket.client ? (
            <span className="text-sm font-medium">{ticket.client.businessName}</span>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </div>
        <div className="space-y-1">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Website</p>
          {ticket.website ? (
            <button
              type="button"
              onClick={() => openWebsite(ticket.website!.id)}
              className="flex w-full items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Globe aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate text-sm hover:underline">{ticket.website.name}</span>
            </button>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </div>
        {ticket.project ? (
          <div className="space-y-1">
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Project</p>
            <button
              type="button"
              onClick={() => openProject(ticket.project!.id)}
              className="truncate text-sm hover:underline"
            >
              {ticket.project.name}
            </button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function AssignmentCard({
  ticket,
  busy,
  onPriorityChange,
  onAssigneeChange,
}: {
  ticket: TicketRecord;
  busy: boolean;
  onPriorityChange: (priority: string) => void;
  onAssigneeChange: (assigneeId: string | null) => void;
}) {
  const users = useUsersLookup();
  const NONE = "none";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Assignment</CardTitle>
        <CardDescription>Quick controls — saved immediately.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label>Assignee</Label>
          <Select
            value={ticket.assigneeId || NONE}
            onValueChange={(value) => onAssigneeChange(value === NONE ? null : value)}
            disabled={busy}
          >
            <SelectTrigger className="w-full" aria-label="Assignee">
              <SelectValue />
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
        <div className="space-y-1.5">
          <Label>Priority</Label>
          <Select value={ticket.priority} onValueChange={onPriorityChange} disabled={busy}>
            <SelectTrigger className="w-full" aria-label="Priority">
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
        </div>
      </CardContent>
    </Card>
  );
}

function MetaCard({ ticket }: { ticket: TicketRecord }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Details</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-2.5">
          <DetailRow label="Created">{formatDateTime(ticket.createdAt)}</DetailRow>
          <DetailRow label="First response">
            {ticket.firstResponseAt ? formatDateTime(ticket.firstResponseAt) : "—"}
          </DetailRow>
          <DetailRow label="Resolved">{ticket.resolvedAt ? formatDateTime(ticket.resolvedAt) : "—"}</DetailRow>
          <DetailRow label="Closed">{ticket.closedAt ? formatDateTime(ticket.closedAt) : "—"}</DetailRow>
          <DetailRow label="Last activity">{timeAgo(ticket.lastActivityAt)}</DetailRow>
          <DetailRow label="Source">{label(ticket.source)}</DetailRow>
        </dl>
      </CardContent>
    </Card>
  );
}

function ResolutionCard({ summary }: { summary: string }) {
  return (
    <Card className="border-success/30 bg-success/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CheckCircle2 aria-hidden className="size-4 text-success" />
          Resolution summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm break-words whitespace-pre-wrap">{summary}</p>
      </CardContent>
    </Card>
  );
}

function ActivityCard({ items, loading }: { items: ActivityRecord[]; loading: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ActivityIcon aria-hidden className="size-4 text-muted-foreground" />
          Activity
        </CardTitle>
        <CardDescription>Recent history for this ticket.</CardDescription>
      </CardHeader>
      <CardContent className="scrollbar-thin max-h-96 overflow-y-auto">
        <ActivityTimeline
          items={items}
          loading={loading}
          emptyTitle="No activity yet"
          emptyDescription="Status changes, notes and replies will appear here."
        />
      </CardContent>
    </Card>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy aria-label="Loading ticket">
      <div className="flex items-start gap-3">
        <Skeleton className="size-8 rounded-md" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <Skeleton className="h-9 w-40" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-52 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
