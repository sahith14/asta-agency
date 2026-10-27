"use client";

/**
 * AgencyOS — conversation timeline + internal note composer (Support, task 3-b).
 *
 * Visual contract:
 *  - CUSTOMER_MESSAGE  → left-aligned card with customer avatar, plain body.
 *  - REPLY             → right-accent card (burgundy left border), delivery
 *                        status badge, draft/failed/uncertain actions.
 *  - INTERNAL_NOTE     → amber-tinted, Lock-labelled card — VISIBLY internal,
 *                        never styled like a customer message, no reply
 *                        affordance and never included in reply quotes.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlarmClock, Lock, Loader2, MessageSquareText, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { initials } from "@/components/agency/shared/record-list-helpers";
import { DraftMessageActions } from "@/components/agency/views/support/reply-composer";
import { apiFetch, type TicketMessageRecord, type TicketRecord } from "@/lib/types";
import { timeAgo } from "@/lib/format";

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export function ConversationCard({
  ticket,
  messages,
  onEditDraft,
}: {
  ticket: TicketRecord;
  messages: TicketMessageRecord[];
  onEditDraft: (message: TicketMessageRecord) => void;
}) {
  const customerName = ticket.client?.businessName ?? "Customer";
  const awaiting =
    ticket.awaitingReply && !["RESOLVED", "CLOSED"].includes(ticket.status);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Conversation</CardTitle>
        <CardDescription>
          {messages.length === 1 ? "1 message" : `${messages.length} messages`} · customer messages,
          your replies and internal notes
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {awaiting ? (
          <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs font-medium text-warning-foreground">
            <AlarmClock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            The latest customer message has not been answered yet.
          </p>
        ) : null}

        {messages.length === 0 ? (
          <EmptyState
            icon={MessageSquareText}
            title="No messages yet"
            description="Customer emails converted from the Inbox appear here. Use the composer below to start the conversation."
            className="py-8"
          />
        ) : (
          <ol className="scrollbar-thin max-h-[560px] space-y-4 overflow-y-auto pr-1">
            {messages.map((message) => {
              if (message.kind === "REPLY") {
                return <ReplyRow key={message.id} ticketId={ticket.id} message={message} onEditDraft={onEditDraft} />;
              }
              if (message.kind === "INTERNAL_NOTE") {
                return <NoteRow key={message.id} message={message} />;
              }
              return <CustomerRow key={message.id} message={message} customerName={customerName} />;
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function CustomerRow({ message, customerName }: { message: TicketMessageRecord; customerName: string }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
      >
        {initials(customerName)}
      </span>
      <div className="min-w-0 flex-1 rounded-xl border bg-card p-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{customerName}</span>
          <span>Customer</span>
          <span aria-hidden>·</span>
          <span>{timeAgo(message.createdAt)}</span>
        </div>
        <p className="mt-1.5 text-sm break-words whitespace-pre-wrap">{message.bodyText}</p>
      </div>
    </li>
  );
}

function ReplyRow({
  ticketId,
  message,
  onEditDraft,
}: {
  ticketId: string;
  message: TicketMessageRecord;
  onEditDraft: (message: TicketMessageRecord) => void;
}) {
  return (
    <li className="flex justify-end">
      <div className="w-full max-w-[92%] rounded-xl border border-l-4 border-l-primary bg-card p-3 sm:max-w-[85%]">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Reply to customer</span>
          {message.author?.displayName ? <span>· {message.author.displayName}</span> : null}
          <StatusBadge value={message.deliveryStatus} />
          <span aria-hidden>·</span>
          <span>
            {message.sentAt ? `Sent ${timeAgo(message.sentAt)}` : `Drafted ${timeAgo(message.createdAt)}`}
          </span>
        </div>
        <p className="mt-1.5 text-sm break-words whitespace-pre-wrap">{message.bodyText}</p>
        {message.deliveryError ? (
          <p className="mt-2 text-xs font-medium text-destructive">{message.deliveryError}</p>
        ) : null}
        <DraftMessageActions ticketId={ticketId} message={message} onEdit={onEditDraft} />
      </div>
    </li>
  );
}

function NoteRow({ message }: { message: TicketMessageRecord }) {
  return (
    <li className="flex gap-3">
      <div className="w-full rounded-xl border border-warning/40 bg-warning/10 p-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-medium text-warning-foreground">
          <Lock aria-hidden className="size-3.5 shrink-0" />
          <span>Internal note — never visible to the client</span>
          <span aria-hidden>·</span>
          <span className="font-normal text-muted-foreground">{timeAgo(message.createdAt)}</span>
        </div>
        <p className="mt-1.5 text-sm break-words whitespace-pre-wrap text-foreground">{message.bodyText}</p>
        {message.author?.displayName ? (
          <p className="mt-1.5 text-xs text-muted-foreground">{message.author.displayName}</p>
        ) : null}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Internal note composer (separate card under the conversation)
// ---------------------------------------------------------------------------

export function NoteComposer({ ticketId }: { ticketId: string }) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<TicketMessageRecord>(`/api/tickets/${ticketId}/messages`, {
        method: "POST",
        body: JSON.stringify({ kind: "INTERNAL_NOTE", body: body.trim() }),
      }),
    onSuccess: () => {
      // Notes never touch awaitingReply; the list message counts change though.
      void queryClient.invalidateQueries({ queryKey: ["ticket", ticketId] });
      void queryClient.invalidateQueries({ queryKey: ["tickets"] });
      toast.success("Internal note added");
      setBody("");
    },
    onError: (error: Error) => toast.error(error.message || "Could not add the note."),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <StickyNote aria-hidden className="size-4 text-warning-foreground" />
          Internal note
        </CardTitle>
        <CardDescription>
          Context for the team only — notes are permanent and never sent to the customer or
          included in replies.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          rows={3}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="e.g. Called the client — hosting credentials arrive tomorrow…"
          aria-label="Internal note text"
        />
        <div className="flex justify-end">
          <Button onClick={() => mutation.mutate()} disabled={!body.trim() || mutation.isPending}>
            {mutation.isPending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
            Add internal note
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
