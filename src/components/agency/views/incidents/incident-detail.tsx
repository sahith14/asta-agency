"use client";

/**
 * AgencyOS — incident detail (Phase 4, task 4-b).
 *
 * Header (INC number, title, severity/status/detection badges, assigned-to)
 * with status action buttons built from `allowedTransitions`: RESOLVED opens a
 * dialog requiring a resolution summary, CLOSED is confirmed, reopen (via
 * INVESTIGATING) requires a reason. Body: editable write-up cards
 * (description/diagnosis/mitigation/resolution) + affected websites, linked
 * tickets, timeline with notes, and the latest health checks as evidence.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  FileSearch,
  LifeBuoy,
  Link2,
  Loader2,
  RotateCcw,
  SearchX,
  ShieldAlert,
  StickyNote,
  Unlink,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Input } from "@/components/ui/input";
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
import { ConfirmDialog } from "@/components/agency/shared/confirm-dialog";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { openTicket, useAppStore } from "@/components/agency/store";
import {
  apiFetch,
  label,
  type HealthCheckRecord,
  type IncidentDetailData,
  type Paginated,
  type TicketRecord,
} from "@/lib/types";
import { formatDateTime, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useUsersLookup } from "@/components/agency/views/tasks/lookups";
import { IncidentNumberChip, incidentNumber } from "@/components/agency/views/incidents/bits";
import { ticketNumber } from "@/components/agency/views/support/list-bits";
import { CheckResultBadge, formatMs } from "@/components/agency/views/monitoring/bits";

const NONE = "none";
const OPEN_TICKET_FILTER = "NEW,OPEN,IN_PROGRESS,WAITING_CLIENT,WAITING_THIRD_PARTY";

export default function IncidentDetail() {
  const id = useAppStore((s) => s.params.id);
  const back = useAppStore((s) => s.back);
  const queryClient = useQueryClient();

  // --- dialogs ---------------------------------------------------------------
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolveText, setResolveText] = useState("");
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [closeOpen, setCloseOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [unlinkTicket, setUnlinkTicket] = useState<TicketRecord | null>(null);

  const detailKey = useMemo(() => ["incident", id] as const, [id]);

  const detailQuery = useQuery({
    queryKey: detailKey,
    queryFn: () => apiFetch<IncidentDetailData>(`/api/incidents/${id}`),
    enabled: !!id,
  });

  const data = detailQuery.data;
  const incident = data?.incident;
  const allowed = data?.allowedTransitions ?? [];

  // --- mutations ---------------------------------------------------------------

  const invalidateAfterMutation = () => {
    void queryClient.invalidateQueries({ queryKey: detailKey });
    void queryClient.invalidateQueries({ queryKey: ["incidents"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["monitoring-summary"] });
  };

  const statusMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<IncidentDetailData["incident"]>(`/api/incidents/${id}/status`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (record, body) => {
      queryClient.setQueryData<IncidentDetailData>(detailKey, (old) =>
        old ? { ...old, incident: record } : old,
      );
      invalidateAfterMutation();
      const action = String(body.action ?? "");
      if (action === "RESOLVED") toast.success("Incident marked as resolved.");
      else if (action === "CLOSED") toast.success("Incident closed.");
      else if (record.status === "INVESTIGATING") toast.success("Incident reopened.");
      else toast.success(`Status set to ${label(record.status)}.`);
    },
    onError: (error: Error) => toast.error(error.message || "Could not update the incident."),
    onSettled: () => invalidateAfterMutation(),
  });

  const patchMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<IncidentDetailData["incident"]>(`/api/incidents/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<IncidentDetailData>(detailKey);
      if (previous) {
        queryClient.setQueryData<IncidentDetailData>(detailKey, {
          ...previous,
          incident: { ...previous.incident, ...body },
        });
      }
      return { previous };
    },
    onError: (error: Error, _body, context) => {
      if (context?.previous) queryClient.setQueryData(detailKey, context.previous);
      toast.error(error.message || "Could not save the change.");
    },
    onSuccess: (record) => {
      queryClient.setQueryData<IncidentDetailData>(detailKey, (old) =>
        old ? { ...old, incident: record } : old,
      );
      void queryClient.invalidateQueries({ queryKey: ["incidents"] });
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: detailKey }),
  });

  const addNoteMutation = useMutation({
    mutationFn: (message: string) =>
      apiFetch<unknown>(`/api/incidents/${id}/notes`, {
        method: "POST",
        body: JSON.stringify({ message }),
      }),
    onSuccess: () => {
      toast.success("Note added.");
      void queryClient.invalidateQueries({ queryKey: detailKey });
    },
    onError: (error: Error) => toast.error(error.message || "Could not add the note."),
  });

  const linkTicketMutation = useMutation({
    mutationFn: (ticketId: string) =>
      apiFetch<unknown>(`/api/incidents/${id}/tickets`, {
        method: "POST",
        body: JSON.stringify({ ticketId }),
      }),
    onSuccess: () => {
      toast.success("Ticket linked to this incident.");
      setLinkOpen(false);
      void queryClient.invalidateQueries({ queryKey: detailKey });
    },
    onError: (error: Error) => toast.error(error.message || "Could not link the ticket."),
  });

  const unlinkTicketMutation = useMutation({
    mutationFn: (ticketId: string) =>
      apiFetch<unknown>(`/api/incidents/${id}/tickets/${ticketId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Ticket unlinked. The ticket itself is unchanged.");
      setUnlinkTicket(null);
      void queryClient.invalidateQueries({ queryKey: detailKey });
    },
    onError: (error: Error) => toast.error(error.message || "Could not unlink the ticket."),
  });

  // --- render gates ---------------------------------------------------------------

  if (!id) {
    return (
      <div className="space-y-6">
        <DetailHeaderLite title="Incident" onBack={back} />
        <EmptyState
          icon={ShieldAlert}
          title="No incident selected"
          description="Pick an incident from the Incidents list."
          action={
            <Button variant="outline" onClick={back}>
              Back to Incidents
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
        <DetailHeaderLite title="Incident" onBack={back} />
        <EmptyState
          icon={ShieldAlert}
          title="Incident not found"
          description="This incident may have been removed or the link is out of date."
          action={
            <Button variant="outline" onClick={back}>
              Back to Incidents
            </Button>
          }
        />
      </div>
    );
  }
  if (detailQuery.isError) {
    return (
      <div className="space-y-6">
        <DetailHeaderLite title="Incident" onBack={back} />
        <EmptyState
          icon={SearchX}
          title="Could not load this incident"
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
  if (detailQuery.isLoading || !data || !incident) {
    return <DetailSkeleton />;
  }

  const isClosed = incident.status === "CLOSED";

  function handleStatusAction(action: string) {
    if (action === "RESOLVED") {
      setResolveText(incident?.resolution ?? "");
      setResolveOpen(true);
      return;
    }
    if (action === "CLOSED") {
      setCloseOpen(true);
      return;
    }
    if (action === "INVESTIGATING" && (incident?.status === "RESOLVED" || incident?.status === "CLOSED")) {
      // Reopen path — requires a reason.
      setReopenReason("");
      setReopenOpen(true);
      return;
    }
    statusMutation.mutate({ action });
  }

  async function confirmResolve() {
    if (!resolveText.trim()) return;
    try {
      // Persist the write-up first (PATCH contract), then transition.
      await patchMutation.mutateAsync({ resolution: resolveText.trim() });
      await statusMutation.mutateAsync({ action: "RESOLVED" });
      setResolveOpen(false);
    } catch {
      // Mutations surfaced the server message; keep the dialog open.
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
              <IncidentNumberChip number={incident.number} />
              <h2 className="min-w-0 text-xl font-semibold break-words tracking-tight sm:text-2xl">
                {incident.title}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <StatusBadge value={incident.severity} />
              <StatusBadge value={incident.status} />
              <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {label(incident.detectionSource)}
              </span>
              {incident.autoCreated ? (
                <span className="inline-flex items-center rounded-full border border-dashed px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  Auto-created by monitoring
                </span>
              ) : null}
              <span aria-hidden>·</span>
              <span>Detected {timeAgo(incident.detectedAt)}</span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <AssigneeSelect
            assignedToId={incident.assignedToId ?? ""}
            busy={patchMutation.isPending}
            onChange={(value) => patchMutation.mutate({ assignedToId: value || null })}
          />
          {allowed.map((action) => (
            <Button
              key={action}
              variant={action === "RESOLVED" ? "default" : "outline"}
              size="sm"
              className="min-h-9"
              disabled={statusMutation.isPending}
              onClick={() => handleStatusAction(action)}
            >
              {action === "RESOLVED" ? <CheckCircle2 aria-hidden className="size-4" /> : null}
              {action === "INVESTIGATING" &&
              (incident.status === "RESOLVED" || incident.status === "CLOSED")
                ? "Reopen"
                : label(action)}
            </Button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
        <div className="min-w-0 space-y-4">
          <WriteUpCard
            title="Description"
            value={incident.description}
            placeholder="What happened, when it started and what the client sees."
            closed={isClosed}
            onSave={(text) => patchMutation.mutate({ description: text })}
          />
          <WriteUpCard
            title="Diagnosis"
            value={incident.diagnosis}
            placeholder="Root cause once identified."
            closed={isClosed}
            onSave={(text) => patchMutation.mutate({ diagnosis: text })}
          />
          <WriteUpCard
            title="Mitigation"
            value={incident.mitigation}
            placeholder="What was done to limit the impact."
            closed={isClosed}
            onSave={(text) => patchMutation.mutate({ mitigation: text })}
          />
          <WriteUpCard
            title="Resolution"
            value={incident.resolution}
            placeholder="How it was fixed. Required when resolving the incident."
            closed={isClosed}
            hint={isClosed ? "Closed incidents are read-only — reopen to edit." : undefined}
            onSave={(text) => patchMutation.mutate({ resolution: text })}
          />
        </div>

        <aside className="min-w-0 space-y-4">
          <AffectedWebsitesCard data={data} />
          <LinkedTicketsCard
            tickets={data.tickets}
            linkBusy={linkTicketMutation.isPending}
            onOpenLink={() => setLinkOpen(true)}
            onUnlink={(ticket) => setUnlinkTicket(ticket)}
          />
          <TimelineCard
            events={data.events}
            noteBusy={addNoteMutation.isPending}
            onAddNote={(message) => addNoteMutation.mutate(message)}
          />
          <EvidenceCard checks={data.recentChecks} />
        </aside>
      </div>

      {/* Resolve dialog — resolution summary required */}
      <Dialog open={resolveOpen} onOpenChange={(open) => !open && setResolveOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Resolve incident</DialogTitle>
            <DialogDescription>
              A resolution summary is required — it is kept on the incident record.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="incident-resolution">Resolution summary</Label>
            <Textarea
              id="incident-resolution"
              rows={4}
              value={resolveText}
              onChange={(event) => setResolveText(event.target.value)}
              placeholder="What was the fix? e.g. Restarted the origin server; confirmed all sites healthy for 10 minutes."
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveOpen(false)} disabled={patchMutation.isPending || statusMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => void confirmResolve()}
              disabled={!resolveText.trim() || patchMutation.isPending || statusMutation.isPending}
            >
              {patchMutation.isPending || statusMutation.isPending ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : null}
              Resolve incident
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reopen dialog — reason required */}
      <Dialog open={reopenOpen} onOpenChange={(open) => !open && setReopenOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reopen incident</DialogTitle>
            <DialogDescription>
              A reason is required — it is recorded on the incident timeline.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="incident-reopen-reason">Reason</Label>
            <Textarea
              id="incident-reopen-reason"
              rows={3}
              value={reopenReason}
              onChange={(event) => setReopenReason(event.target.value)}
              placeholder="Why is this incident being reopened?"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenOpen(false)} disabled={statusMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!reopenReason.trim()) return;
                statusMutation.mutate({ action: "INVESTIGATING", reason: reopenReason.trim() });
                setReopenOpen(false);
              }}
              disabled={!reopenReason.trim() || statusMutation.isPending}
            >
              {statusMutation.isPending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
              Reopen incident
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close confirm */}
      <ConfirmDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        title="Close this incident?"
        description="Closing is terminal for the record — reopening later requires a reason and shows on the timeline. Linked tickets are never changed automatically."
        confirmLabel="Close incident"
        loading={statusMutation.isPending}
        onConfirm={() => statusMutation.mutate({ action: "CLOSED" })}
      />

      {/* Link ticket dialog */}
      <LinkTicketDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        linkedIds={(data.tickets ?? []).map((ticket) => ticket.id)}
        busy={linkTicketMutation.isPending}
        onPick={(ticketId) => linkTicketMutation.mutate(ticketId)}
      />

      {/* Unlink confirm */}
      <ConfirmDialog
        open={!!unlinkTicket}
        onOpenChange={(open) => !open && setUnlinkTicket(null)}
        title={`Unlink ${unlinkTicket ? ticketNumber(unlinkTicket.number) : "ticket"}?`}
        description="Unlinking does not change the ticket — its status, conversation and assignment stay exactly as they are."
        confirmLabel="Unlink ticket"
        destructive
        loading={unlinkTicketMutation.isPending}
        onConfirm={() => unlinkTicket && unlinkTicketMutation.mutate(unlinkTicket.id)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function DetailHeaderLite({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <Button variant="outline" size="icon" onClick={onBack} aria-label="Go back" className="mt-0.5 size-8 shrink-0">
        <ArrowLeft className="size-4" />
      </Button>
      <h2 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
    </div>
  );
}

function AssigneeSelect({
  assignedToId,
  busy,
  onChange,
}: {
  assignedToId: string;
  busy: boolean;
  onChange: (value: string) => void;
}) {
  const users = useUsersLookup();
  return (
    <Select value={assignedToId || NONE} onValueChange={onChange} disabled={busy}>
      <SelectTrigger className="w-[180px] min-h-9" aria-label="Assigned to">
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
  );
}

/** Editable write-up card (description / diagnosis / mitigation / resolution). */
function WriteUpCard({
  title,
  value,
  placeholder,
  closed,
  hint,
  onSave,
}: {
  title: string;
  value: string | null;
  placeholder: string;
  closed?: boolean;
  hint?: string;
  onSave: (text: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? value ?? "";
  const dirty = draft !== null && draft !== (value ?? "");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {hint ? <CardDescription>{hint}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-2">
        <Textarea
          rows={3}
          value={text}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={placeholder}
          disabled={closed}
          aria-label={title}
        />
        {dirty ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="min-h-8"
              disabled={!text.trim()}
              onClick={() => {
                onSave(text.trim());
                setDraft(null);
              }}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="min-h-8"
              onClick={() => setDraft(null)}
            >
              Discard
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function AffectedWebsitesCard({ data }: { data: IncidentDetailData }) {
  // Latest check per affected website, from the evidence list.
  const latestByWebsite = useMemo(() => {
    const map = new Map<string, HealthCheckRecord>();
    for (const check of data.recentChecks) {
      const existing = map.get(check.websiteId);
      if (!existing || existing.checkedAt < check.checkedAt) map.set(check.websiteId, check);
    }
    return map;
  }, [data.recentChecks]);

  const websites = data.websites ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Affected websites</CardTitle>
        <CardDescription>Observation and recovery per website, straight from the checks.</CardDescription>
      </CardHeader>
      <CardContent>
        {websites.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No websites linked to this incident.
          </p>
        ) : (
          <ul className="space-y-3">
            {websites.map((link) => {
              const latest = latestByWebsite.get(link.websiteId);
              return (
                <li key={link.id} className="space-y-1.5 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-medium">
                      {link.website?.name ?? "Website"}
                      {link.website?.clientName ? (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          · {link.website.clientName}
                        </span>
                      ) : null}
                    </span>
                    {link.recoveredAt ? (
                      <span className="inline-flex shrink-0 items-center rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                        <span aria-hidden className="mr-1 size-1.5 rounded-full bg-success" />
                        Recovered
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 items-center rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                        <span aria-hidden className="mr-1 size-1.5 rounded-full bg-destructive" />
                        Still down
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    First observed {formatDateTime(link.firstObservedAt)}
                    {link.recoveredAt ? ` · recovered ${formatDateTime(link.recoveredAt)}` : ""}
                  </p>
                  {latest ? (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <CheckResultBadge success={latest.success} errorCategory={latest.errorCategory} />
                      <span className="tabular-nums">
                        HTTP {latest.statusCode ?? "—"} ·{" "}
                        {latest.durationMs !== null ? formatMs(latest.durationMs) : "—"} ·{" "}
                        {timeAgo(latest.checkedAt)}
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No recent checks recorded.</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function LinkedTicketsCard({
  tickets,
  linkBusy,
  onOpenLink,
  onUnlink,
}: {
  tickets: TicketRecord[];
  linkBusy: boolean;
  onOpenLink: () => void;
  onUnlink: (ticket: TicketRecord) => void;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 text-base">
            <LifeBuoy aria-hidden className="size-4 text-muted-foreground" />
            Linked tickets
          </CardTitle>
          <CardDescription>Support conversations related to this incident.</CardDescription>
        </div>
        <Button variant="outline" size="sm" className="min-h-8" onClick={onOpenLink} disabled={linkBusy}>
          <Link2 aria-hidden className="size-3.5" />
          Link ticket
        </Button>
      </CardHeader>
      <CardContent>
        {tickets.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tickets linked yet — link an open support ticket to keep client
            communication and the incident record together.
          </p>
        ) : (
          <ul className="space-y-2">
            {tickets.map((ticket) => (
              <li
                key={ticket.id}
                className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
              >
                <button
                  type="button"
                  onClick={() => openTicket(ticket.id)}
                  className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex items-center gap-2">
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {ticketNumber(ticket.number)}
                    </span>
                    <span className="truncate text-sm hover:underline">{ticket.subject}</span>
                  </span>
                </button>
                <StatusBadge value={ticket.status} />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => onUnlink(ticket)}
                  aria-label={`Unlink ${ticketNumber(ticket.number)}`}
                >
                  <Unlink aria-hidden className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Search + pick from open tickets. */
function LinkTicketDialog({
  open,
  onOpenChange,
  linkedIds,
  busy,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  linkedIds: string[];
  busy: boolean;
  onPick: (ticketId: string) => void;
}) {
  const [search, setSearch] = useState("");

  const ticketsQuery = useQuery({
    queryKey: ["tickets", "linkable", open],
    queryFn: () =>
      apiFetch<Paginated<TicketRecord>>(
        `/api/tickets?pageSize=50&status=${OPEN_TICKET_FILTER}`,
      ),
    enabled: open,
    staleTime: 30_000,
  });

  const items = (ticketsQuery.data?.items ?? []).filter((ticket) => {
    if (linkedIds.includes(ticket.id)) return false;
    if (!search.trim()) return true;
    const needle = search.trim().toLowerCase();
    return (
      ticket.subject.toLowerCase().includes(needle) ||
      String(ticket.number).includes(needle) ||
      ticketNumber(ticket.number).toLowerCase().includes(needle)
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link a ticket</DialogTitle>
          <DialogDescription>
            Only tickets that are not resolved or closed can be linked.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by subject or TKT number…"
            aria-label="Search tickets"
          />
          <div className="scrollbar-thin max-h-72 space-y-1.5 overflow-y-auto">
            {ticketsQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : ticketsQuery.isError ? (
              <p className="text-sm text-destructive">
                {(ticketsQuery.error as Error)?.message ?? "Tickets could not be loaded."}
              </p>
            ) : items.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                No linkable open tickets found.
              </p>
            ) : (
              items.map((ticket) => (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => onPick(ticket.id)}
                  disabled={busy}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {ticketNumber(ticket.number)}
                      </span>
                      <span className="truncate text-sm font-medium">{ticket.subject}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {ticket.client?.businessName ?? "—"}
                    </span>
                  </span>
                  <StatusBadge value={ticket.status} />
                </button>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TimelineCard({
  events,
  noteBusy,
  onAddNote,
}: {
  events: IncidentDetailData["events"];
  noteBusy: boolean;
  onAddNote: (message: string) => void;
}) {
  const [note, setNote] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <StickyNote aria-hidden className="size-4 text-muted-foreground" />
          Timeline
        </CardTitle>
        <CardDescription>Status changes, monitoring observations and notes.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="scrollbar-thin max-h-96 space-y-2.5 overflow-y-auto pr-1">
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events recorded yet.</p>
          ) : (
            [...events]
              .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
              .map((event) => (
                <div key={event.id} className="space-y-0.5 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {label(event.kind)}
                    </span>
                    <span className="text-xs text-muted-foreground" title={formatDateTime(event.createdAt)}>
                      {timeAgo(event.createdAt)} · {event.actorName}
                    </span>
                  </div>
                  <p className="text-sm break-words whitespace-pre-wrap">{event.message}</p>
                </div>
              ))
          )}
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!note.trim()) return;
            onAddNote(note.trim());
            setNote("");
          }}
        >
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="incident-note" className="sr-only">
              Add note
            </Label>
            <Input
              id="incident-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Add an internal note…"
              autoComplete="off"
            />
          </div>
          <Button type="submit" className="min-h-9" disabled={!note.trim() || noteBusy}>
            {noteBusy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
            Add note
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function EvidenceCard({ checks }: { checks: HealthCheckRecord[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSearch aria-hidden className="size-4 text-muted-foreground" />
          Evidence
        </CardTitle>
        <CardDescription>Latest health checks for the affected websites.</CardDescription>
      </CardHeader>
      <CardContent className="scrollbar-thin max-h-72 overflow-y-auto">
        {checks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No checks recorded yet — enable monitoring on the affected websites to gather evidence.
          </p>
        ) : (
          <ul className="space-y-2">
            {checks.map((check) => (
              <li key={check.id} className="space-y-1 rounded-lg border px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-medium">
                    {check.website?.name ?? "Website"}
                  </span>
                  <CheckResultBadge success={check.success} errorCategory={check.errorCategory} />
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">
                  HTTP {check.statusCode ?? "—"} ·{" "}
                  {check.durationMs !== null ? formatMs(check.durationMs) : "—"} ·{" "}
                  {timeAgo(check.checkedAt)} · {label(check.trigger)}
                </p>
                {check.errorSummary ? (
                  <p
                    className={cn("text-xs break-words text-destructive")}
                    title={check.errorSummary}
                  >
                    {check.errorSummary}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy aria-label="Loading incident">
      <div className="flex items-start gap-3">
        <Skeleton className="size-8 rounded-md" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <Skeleton className="h-9 w-56" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-52 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
