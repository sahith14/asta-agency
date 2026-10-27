"use client";

/**
 * AgencyOS — Inbox message drawer: match/review panel (task 3-a).
 * Rendered only for review-queue items (matchStatus SUGGESTED / NEEDS_REVIEW).
 * Actions: save match (client + optional website), link to an existing ticket
 * (searchable picker, cross-client links rejected server-side), create a
 * ticket from the email, mark unrelated. Every action POSTs to
 * /api/emails/[id]/match and invalidates the affected query caches.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Link2, Loader2, Plus, Search, TicketX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { ConfirmDialog } from "@/components/agency/shared/confirm-dialog";
import { buildQuery } from "@/components/agency/shared/record-list-helpers";
import { openTicket } from "@/components/agency/store";
import {
  useClientsLookup,
  useDebouncedValue,
  useWebsitesLookup,
} from "@/components/agency/views/tasks/lookups";
import { ticketLabel } from "@/components/agency/views/inbox/list-bits";
import { apiFetch, type EmailMessageRecord, type Paginated, type TicketRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

const TICKET_OPTIONS_PAGE_SIZE = 10;

interface MatchPanelProps {
  email: EmailMessageRecord;
  /** Called after any successful match action — the parent closes the drawer when the list was the review tab. */
  onAfterMatch: () => void;
}

export function MatchPanel({ email, onAfterMatch }: MatchPanelProps) {
  const queryClient = useQueryClient();
  const clients = useClientsLookup();

  const [clientId, setClientId] = useState(email.suggestedClientId ?? "");
  const [websiteId, setWebsiteId] = useState(email.websiteId ?? "");
  const [ticketSearchInput, setTicketSearchInput] = useState("");
  const debouncedTicketSearch = useDebouncedValue(ticketSearchInput, 300);
  const [selectedTicketId, setSelectedTicketId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createSubject, setCreateSubject] = useState(email.subject ?? "");
  const [unrelatedOpen, setUnrelatedOpen] = useState(false);

  const websites = useWebsitesLookup(clientId);

  const suggestedName = useMemo(
    () =>
      email.suggestedClientId
        ? clients.data?.find((client) => client.id === email.suggestedClientId)?.businessName
        : undefined,
    [clients.data, email.suggestedClientId],
  );

  const ticketOptions = useQuery({
    queryKey: ["ticket-options", { search: debouncedTicketSearch, clientId }],
    queryFn: () =>
      apiFetch<Paginated<TicketRecord>>(
        `/api/tickets${buildQuery({
          search: debouncedTicketSearch || undefined,
          clientId: clientId || undefined,
          pageSize: TICKET_OPTIONS_PAGE_SIZE,
        })}`,
      ),
    placeholderData: (previous) => previous,
  });

  const selectedTicket = ticketOptions.data?.items.find((t) => t.id === selectedTicketId);

  function invalidateAfterMatch(ticketId?: string | null) {
    queryClient.invalidateQueries({ queryKey: ["emails"] });
    queryClient.invalidateQueries({ queryKey: ["email", email.id] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    if (ticketId) queryClient.invalidateQueries({ queryKey: ["ticket", ticketId] });
  }

  const matchMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<EmailMessageRecord>(`/api/emails/${email.id}/match`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onError: (error: Error) => {
      // Surface the server message verbatim (e.g. the cross-client guard).
      toast.error(error.message || "The match action failed.");
    },
  });

  const onSaveMatch = () => {
    matchMutation.mutate(
      {
        action: "CONFIRM",
        clientId,
        ...(websiteId ? { websiteId } : {}),
      },
      {
        onSuccess: () => {
          toast.success("Match saved");
          invalidateAfterMatch();
          onAfterMatch();
        },
      },
    );
  };

  const onLinkTicket = () => {
    if (!selectedTicketId) return;
    matchMutation.mutate(
      { action: "LINK_TICKET", ticketId: selectedTicketId },
      {
        onSuccess: (updated) => {
          toast.success("Email linked to ticket");
          invalidateAfterMatch(updated.ticketId);
          onAfterMatch();
        },
      },
    );
  };

  const onCreateTicket = () => {
    matchMutation.mutate(
      {
        action: "CONFIRM",
        clientId,
        ...(websiteId ? { websiteId } : {}),
        createTicket: { subject: createSubject.trim() || undefined },
      },
      {
        onSuccess: (updated) => {
          toast.success("Match saved", {
            description: updated.ticket
              ? `Ticket ${ticketLabel(updated.ticket.number)} created.`
              : "A ticket was created from this email.",
          });
          invalidateAfterMatch(updated.ticketId);
          onAfterMatch();
          if (updated.ticketId) openTicket(updated.ticketId);
        },
      },
    );
  };

  const onMarkUnrelated = () => {
    matchMutation.mutate(
      { action: "UNRELATED" },
      {
        onSuccess: () => {
          toast.success("Marked as unrelated");
          invalidateAfterMatch();
          onAfterMatch();
        },
      },
    );
  };

  const busy = matchMutation.isPending;
  const canConfirm = !!clientId;

  return (
    <section
      aria-label="Match review"
      className="space-y-4 rounded-xl border bg-muted/30 p-4"
    >
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Match review</h3>
        <p className="text-xs text-muted-foreground">
          Confirm the client so future emails from this address are matched automatically.
        </p>
      </div>

      {email.suggestedClientId ? (
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge value="SUGGESTED" />
          <span className="text-xs text-muted-foreground">
            Suggested client:{" "}
            <span className="font-medium text-foreground">{suggestedName ?? "loading…"}</span>
          </span>
        </div>
      ) : null}

      {email.ticket ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Currently linked to</span>
          <button
            type="button"
            onClick={() => email.ticket && openTicket(email.ticket.id)}
            className="rounded-full border bg-background px-2 py-0.5 font-medium text-foreground hover:bg-muted"
          >
            {ticketLabel(email.ticket.number)}
          </button>
        </div>
      ) : null}

      {/* Client + website pickers */}
      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="match-client" className="text-xs">
            Client
          </Label>
          <Select
            value={clientId || "none"}
            onValueChange={(value) => {
              setClientId(value === "none" ? "" : value);
              setWebsiteId(""); // websites cascade from the client — clear on change
            }}
          >
            <SelectTrigger id="match-client" aria-label="Client for the match" className="w-full">
              <SelectValue placeholder="Choose a client" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" disabled>
                Choose a client
              </SelectItem>
              {(clients.data ?? []).map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.businessName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="match-website" className="text-xs">
            Website <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Select
            value={websiteId || "none"}
            onValueChange={(value) => setWebsiteId(value === "none" ? "" : value)}
            disabled={!clientId}
          >
            <SelectTrigger id="match-website" aria-label="Website for the match" className="w-full">
              <SelectValue placeholder={clientId ? "No website" : "Choose a client first"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No website</SelectItem>
              {(websites.data ?? []).map((website) => (
                <SelectItem key={website.id} value={website.id}>
                  {website.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Primary actions */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={onSaveMatch} disabled={!canConfirm || busy} className="flex-1">
          {matchMutation.isPending && matchMutation.variables?.action === "CONFIRM" ? (
            <Loader2 aria-hidden className="animate-spin" />
          ) : (
            <Check aria-hidden />
          )}
          Save match
        </Button>
        <Button
          variant="outline"
          onClick={() => setUnrelatedOpen(true)}
          disabled={busy}
          className="flex-1"
        >
          <TicketX aria-hidden />
          Mark unrelated
        </Button>
      </div>

      <Separator />

      {/* Link to an existing ticket */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <Link2 aria-hidden className="size-3.5 text-muted-foreground" />
          Link to an existing ticket
        </div>
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={ticketSearchInput}
            onChange={(event) => setTicketSearchInput(event.target.value)}
            placeholder="Search tickets by subject…"
            aria-label="Search tickets"
            className="pl-9"
          />
        </div>

        {ticketOptions.isLoading ? (
          <div className="space-y-1.5">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : ticketOptions.isError ? (
          <p className="text-xs text-destructive">
            {(ticketOptions.error as Error)?.message ?? "Tickets could not be loaded."}
          </p>
        ) : (ticketOptions.data?.items.length ?? 0) === 0 ? (
          <p className="text-xs text-muted-foreground">No tickets found.</p>
        ) : (
          <ul
            className="max-h-40 space-y-1 overflow-y-auto pr-1 scrollbar-thin"
            aria-label="Ticket options"
          >
            {ticketOptions.data!.items.map((ticket) => {
              const active = ticket.id === selectedTicketId;
              return (
                <li key={ticket.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedTicketId(ticket.id)}
                    aria-pressed={active}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted",
                      active && "border-primary/40 bg-primary/5",
                    )}
                  >
                    <span className="shrink-0 font-mono font-medium text-foreground">
                      {ticketLabel(ticket.number)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{ticket.subject}</span>
                    <span className="shrink-0 text-muted-foreground">({ticket.status})</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {selectedTicket ? (
          <p className="text-xs text-muted-foreground">
            Selected:{" "}
            <span className="font-medium text-foreground">
              {ticketLabel(selectedTicket.number)} — {selectedTicket.subject}
            </span>
          </p>
        ) : null}

        <Button
          variant="outline"
          size="sm"
          onClick={onLinkTicket}
          disabled={!selectedTicketId || busy}
        >
          <Link2 aria-hidden />
          Link to ticket
        </Button>
      </div>

      <Separator />

      {/* Create ticket from email */}
      <div className="space-y-2">
        {createOpen ? (
          <div className="space-y-2">
            <div className="grid gap-1.5">
              <Label htmlFor="create-ticket-subject" className="text-xs">
                New ticket subject
              </Label>
              <Input
                id="create-ticket-subject"
                value={createSubject}
                onChange={(event) => setCreateSubject(event.target.value)}
                placeholder="Ticket subject"
                maxLength={200}
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                size="sm"
                onClick={onCreateTicket}
                disabled={!canConfirm || busy}
                className="flex-1"
              >
                <Plus aria-hidden />
                Create ticket from email
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setCreateOpen(false)}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Creates a New ticket for the selected client with this email as the first customer
              message.
            </p>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)} disabled={busy}>
            <Plus aria-hidden />
            Create ticket from email
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={unrelatedOpen}
        onOpenChange={setUnrelatedOpen}
        title="Mark email as unrelated?"
        description="This email will be marked as not client-related. It leaves the review queue and will not be matched automatically."
        confirmLabel="Mark unrelated"
        destructive
        loading={busy}
        onConfirm={() => {
          setUnrelatedOpen(false);
          onMarkUnrelated();
        }}
      />
    </section>
  );
}
