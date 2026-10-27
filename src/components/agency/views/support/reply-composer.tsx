"use client";

/**
 * AgencyOS — reply composer + delivery actions (Support workspace, task 3-b).
 *
 * Send flow (two-step, never implicit):
 *   1. "Send…" always opens a confirmation dialog with recipient(s), subject
 *      and the FULL body preview.
 *   2. On confirm: an in-progress composer edit PATCHes its draft first, a
 *      fresh composition POSTs a draft, then POST .../send hands the stored
 *      row to Gmail (server rebuilds the MIME — client content is never sent
 *      directly). The composer content is NEVER auto-sent.
 *
 * Gmail gate: when GET /api/gmail-status is not CONNECTED, Send is disabled
 * with an explanation — drafts remain saveable.
 *
 * Delivery states (server outcome-as-data): SENT_ACCEPTED → success toast;
 * FAILED → destructive toast, row offers Retry; UNCERTAIN → warning toast,
 * row offers Check delivery (reconcile) + Mark as failed (acknowledged risk);
 * PENDING_SEND → spinner.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlarmClock,
  Loader2,
  Pencil,
  Reply,
  Send,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/agency/shared/confirm-dialog";
import { apiFetch, type EmailAccountStatusRecord, type TicketMessageRecord, type TicketRecord } from "@/lib/types";

// ---------------------------------------------------------------------------
// Shared mutations
// ---------------------------------------------------------------------------

export interface ComposerValues {
  to: string;
  cc: string;
  subject: string;
  body: string;
}

/** Precise invalidation for every message mutation (outbound copies land in the inbox). */
function invalidateTicketScope(queryClient: ReturnType<typeof useQueryClient>, ticketId: string) {
  void queryClient.invalidateQueries({ queryKey: ["ticket", ticketId] });
  void queryClient.invalidateQueries({ queryKey: ["tickets"] });
  void queryClient.invalidateQueries({ queryKey: ["emails"] });
}

/** Read-only view of the Gmail connection (3-a owns the writes/settings UI). */
export function useGmailStatus() {
  return useQuery({
    queryKey: ["gmail-status"],
    queryFn: () => apiFetch<EmailAccountStatusRecord>("/api/gmail/status"),
    staleTime: 30_000,
  });
}

/**
 * All reply-delivery mutations for one ticket. Outcome toasts live here so the
 * composer and the timeline draft rows behave identically.
 */
export function useTicketReplyMutations(ticketId: string) {
  const queryClient = useQueryClient();

  const saveDraft = useMutation({
    mutationFn: (values: ComposerValues) =>
      apiFetch<TicketMessageRecord>(`/api/tickets/${ticketId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          kind: "REPLY",
          to: values.to,
          cc: values.cc,
          subject: values.subject || undefined,
          body: values.body,
        }),
      }),
    onSuccess: () => invalidateTicketScope(queryClient, ticketId),
  });

  const updateDraft = useMutation({
    mutationFn: ({ messageId, values }: { messageId: string; values: ComposerValues }) =>
      apiFetch<TicketMessageRecord>(`/api/tickets/${ticketId}/messages/${messageId}`, {
        method: "PATCH",
        body: JSON.stringify({
          to: values.to,
          cc: values.cc,
          subject: values.subject || undefined,
          body: values.body,
        }),
      }),
    onSuccess: () => invalidateTicketScope(queryClient, ticketId),
  });

  const sendReply = useMutation({
    mutationFn: (messageId: string) =>
      apiFetch<TicketMessageRecord>(`/api/tickets/${ticketId}/messages/${messageId}/send`, {
        method: "POST",
      }),
    onSuccess: (message) => {
      invalidateTicketScope(queryClient, ticketId);
      if (message.deliveryStatus === "SENT_ACCEPTED") {
        toast.success("Reply accepted by Gmail");
      } else if (message.deliveryStatus === "FAILED") {
        toast.error(message.deliveryError || "The reply failed to send. You can retry it from the conversation.");
      } else if (message.deliveryStatus === "UNCERTAIN") {
        toast.warning("Gmail did not confirm delivery. Use Check delivery on the message.");
      }
    },
    onError: (error: Error) => toast.error(error.message || "Could not send the reply."),
  });

  const reconcileReply = useMutation({
    mutationFn: (messageId: string) =>
      apiFetch<{ reconciled: boolean; providerMessageId: string | null; message: TicketMessageRecord }>(
        `/api/tickets/${ticketId}/messages/${messageId}/reconcile`,
        { method: "POST" },
      ),
    onSuccess: (result) => {
      invalidateTicketScope(queryClient, ticketId);
      if (result.reconciled) {
        toast.success("Delivery confirmed in Gmail");
      } else {
        toast.warning(
          "Gmail has no record of this message yet. Verify in Gmail, then mark it as failed if it was not sent.",
        );
      }
    },
    onError: (error: Error) => toast.error(error.message || "Could not check delivery."),
  });

  const markReplyFailed = useMutation({
    mutationFn: (messageId: string) =>
      apiFetch<TicketMessageRecord>(`/api/tickets/${ticketId}/messages/${messageId}`, {
        method: "PATCH",
        body: JSON.stringify({ deliveryStatus: "FAILED" }),
      }),
    onSuccess: () => {
      invalidateTicketScope(queryClient, ticketId);
      toast.success("Marked as failed");
    },
    onError: (error: Error) => toast.error(error.message || "Could not update the message."),
  });

  const deleteDraft = useMutation({
    mutationFn: (messageId: string) =>
      apiFetch<{ deleted: boolean }>(`/api/tickets/${ticketId}/messages/${messageId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      invalidateTicketScope(queryClient, ticketId);
      toast.success("Draft discarded");
    },
    onError: (error: Error) => toast.error(error.message || "Could not delete the draft."),
  });

  return { saveDraft, updateDraft, sendReply, reconcileReply, markReplyFailed, deleteDraft };
}

// ---------------------------------------------------------------------------
// Send confirmation dialog (required for EVERY send)
// ---------------------------------------------------------------------------

export function SendConfirmDialog({
  open,
  onOpenChange,
  to,
  cc,
  subject,
  body,
  loading,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  to: string;
  cc: string;
  subject: string;
  body: string;
  loading?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[90svh] overflow-y-auto scrollbar-thin sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Send this reply?</AlertDialogTitle>
          <AlertDialogDescription>
            The message is sent as plain text from the connected Gmail mailbox and cannot be
            unsent. Review it once more.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
          <p className="break-words">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">To</span>
            <br />
            {to || "—"}
          </p>
          {cc && cc !== "—" ? (
            <p className="break-words">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Cc</span>
              <br />
              {cc}
            </p>
          ) : null}
          <p className="break-words">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Subject</span>
            <br />
            {subject || "—"}
          </p>
          <div>
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Message</span>
            <div className="mt-1 max-h-64 overflow-y-auto scrollbar-thin rounded-md border bg-background p-2.5 whitespace-pre-wrap break-words">
              {body || "—"}
            </div>
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={loading}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {loading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
            Send via Gmail
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// Quoted context (explicit, customer messages only — never internal notes)
// ---------------------------------------------------------------------------

function buildQuote(ticket: TicketRecord, messages: TicketMessageRecord[]): string | null {
  const lastCustomer = [...messages].reverse().find((m) => m.kind === "CUSTOMER_MESSAGE");
  if (!lastCustomer) return null;
  const from = ticket.client?.businessName ?? "Customer";
  const subject = lastCustomer.subject ?? ticket.subject;
  return `---- Original message ----\nFrom: ${from}\nSubject: ${subject}\n\n${lastCustomer.bodyText}`;
}

// ---------------------------------------------------------------------------
// Reply composer card
// ---------------------------------------------------------------------------

export function ReplyComposer({
  ticket,
  messages,
  editDraft,
  onExitEdit,
  customerEmail,
}: {
  ticket: TicketRecord;
  messages: TicketMessageRecord[];
  /** Draft being edited inline (set from the timeline's Edit action). */
  editDraft: TicketMessageRecord | null;
  onExitEdit: () => void;
  /** Customer's email from the client record — used as the To prefill. */
  customerEmail?: string | null;
}) {
  const { saveDraft, updateDraft, sendReply } = useTicketReplyMutations(ticket.id);
  const gmailQuery = useGmailStatus();
  const gmailConnected = gmailQuery.data?.state === "CONNECTED";

  const [collapsed, setCollapsed] = useState(false);
  const [to, setTo] = useState("");
  const [toTouched, setToTouched] = useState(false);
  const [cc, setCc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState(`Re: ${ticket.subject}`);
  const [body, setBody] = useState("");
  const [quoteIncluded, setQuoteIncluded] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const quote = useMemo(() => buildQuote(ticket, messages), [ticket, messages]);

  // Late-arriving client email prefills To until the user types their own.
  useEffect(() => {
    if (!toTouched && !editDraft && customerEmail) setTo(customerEmail);
  }, [customerEmail, editDraft, toTouched]);

  // Sync the composer with a draft chosen for editing in the timeline.
  useEffect(() => {
    if (!editDraft) return;
    setTo(editDraft.toEmails.join(", "));
    setCc(editDraft.ccEmails.join(", "));
    setShowCc(editDraft.ccEmails.length > 0);
    setSubject(editDraft.subject ?? `Re: ${ticket.subject}`);
    setBody(editDraft.bodyText);
    setQuoteIncluded(false);
    setToTouched(true);
    setCollapsed(false);
  }, [editDraft, ticket.subject]);

  function resetComposer() {
    setTo(customerEmail ?? "");
    setToTouched(false);
    setCc("");
    setShowCc(false);
    setSubject(`Re: ${ticket.subject}`);
    setBody("");
    setQuoteIncluded(false);
  }

  const canSend = to.trim().length > 0 && body.trim().length > 0;
  const currentValues = (): ComposerValues => ({
    to: to.trim(),
    cc: cc.trim(),
    subject: subject.trim() || `Re: ${ticket.subject}`,
    body,
  });

  async function handleSaveDraft() {
    if (!canSend || busy) return;
    setBusy(true);
    try {
      const values = currentValues();
      if (editDraft) {
        await updateDraft.mutateAsync({ messageId: editDraft.id, values });
        toast.success("Draft updated");
        resetComposer();
        setCollapsed(true);
        onExitEdit();
      } else {
        await saveDraft.mutateAsync(values);
        toast.success("Draft saved");
        resetComposer();
        setCollapsed(true);
      }
    } catch {
      // onError handlers already surfaced the message
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmSend() {
    setBusy(true);
    try {
      const values = currentValues();
      let messageId = editDraft?.id ?? null;
      if (messageId) {
        await updateDraft.mutateAsync({ messageId, values });
      } else {
        const created = await saveDraft.mutateAsync(values);
        messageId = created.id;
      }
      const sent = await sendReply.mutateAsync(messageId);
      // On FAILED the composer keeps its content (the row offers Retry);
      // otherwise reset and collapse.
      if (sent.deliveryStatus !== "FAILED") {
        resetComposer();
        setCollapsed(true);
        onExitEdit();
      }
    } catch {
      // onError handlers already surfaced the message
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  }

  function toggleQuote(checked: boolean | string) {
    const include = checked === true;
    if (include) {
      if (quote && !body.includes(quote)) {
        setBody((current) => (current.trimEnd() ? `${current.trimEnd()}\n\n${quote}` : quote));
      }
      setQuoteIncluded(true);
    } else {
      if (quote && body.endsWith(quote)) {
        setBody((current) => current.slice(0, current.length - quote.length).trimEnd());
      }
      setQuoteIncluded(false);
    }
  }

  if (collapsed) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <Reply aria-hidden className="size-4 shrink-0 text-primary" />
            <span className="truncate">Reply to customer{editDraft ? " — draft in progress" : ""}</span>
          </div>
          <Button size="sm" onClick={() => setCollapsed(false)}>
            <Pencil aria-hidden />
            Write reply
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Reply to customer</CardTitle>
        <CardDescription>
          Plain-text email sent via the connected Gmail mailbox. Nothing is sent without confirmation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {editDraft ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
            <span>Editing saved draft — saving updates it in place.</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-primary hover:text-primary"
              onClick={() => {
                resetComposer();
                onExitEdit();
              }}
            >
              Cancel editing
            </Button>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="reply-to">To</Label>
            <Input
              id="reply-to"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
                setToTouched(true);
              }}
              placeholder="customer@example.com, second@example.com"
              inputMode="email"
            />
            <p className="text-xs text-muted-foreground">Comma-separated email addresses.</p>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            {showCc ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="reply-cc">Cc</Label>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setShowCc(false);
                      setCc("");
                    }}
                  >
                    Remove Cc
                  </button>
                </div>
                <Input
                  id="reply-cc"
                  value={cc}
                  onChange={(event) => setCc(event.target.value)}
                  placeholder="cc@example.com"
                  inputMode="email"
                />
              </div>
            ) : (
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                onClick={() => setShowCc(true)}
              >
                Add Cc
              </button>
            )}
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="reply-subject">Subject</Label>
            <Input id="reply-subject" value={subject} onChange={(event) => setSubject(event.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reply-body">Message</Label>
          <Textarea
            id="reply-body"
            rows={8}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Write the reply to the customer…"
          />
        </div>

        {quote ? (
          <div className="flex items-center gap-2">
            <Checkbox
              id="reply-quote"
              checked={quoteIncluded}
              onCheckedChange={toggleQuote}
              disabled={busy}
            />
            <Label htmlFor="reply-quote" className="text-xs font-normal text-muted-foreground">
              Include quoted conversation context
            </Label>
          </div>
        ) : null}

        {!gmailConnected ? (
          <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs font-medium text-warning-foreground">
            <ShieldAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            Connect Gmail in Settings → Integrations to send replies. Drafts can still be saved.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={handleSaveDraft} disabled={!canSend || busy}>
            {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
            Save draft
          </Button>
          <Button onClick={() => setConfirmOpen(true)} disabled={!canSend || busy || !gmailConnected}>
            <Send aria-hidden />
            Send…
          </Button>
          {!editDraft ? (
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => {
                resetComposer();
                setCollapsed(true);
              }}
            >
              Discard text
            </Button>
          ) : null}
        </div>
      </CardContent>

      <SendConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        loading={busy}
        to={to.trim()}
        cc={cc.trim()}
        subject={subject.trim() || `Re: ${ticket.subject}`}
        body={body}
        onConfirm={handleConfirmSend}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Timeline actions for a REPLY row (drafts, failed, uncertain, pending)
// ---------------------------------------------------------------------------

export function DraftMessageActions({
  ticketId,
  message,
  onEdit,
}: {
  ticketId: string;
  message: TicketMessageRecord;
  /** Opens the composer pre-filled with this draft. */
  onEdit: (message: TicketMessageRecord) => void;
}) {
  const { sendReply, reconcileReply, markReplyFailed, deleteDraft } = useTicketReplyMutations(ticketId);
  const gmailQuery = useGmailStatus();
  const gmailConnected = gmailQuery.data?.state === "CONNECTED";

  const [sendOpen, setSendOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [markFailedOpen, setMarkFailedOpen] = useState(false);

  const status = message.deliveryStatus;
  const sendDisabled = gmailQuery.isSuccess && !gmailConnected;

  if (status === "PENDING_SEND") {
    return (
      <span className="inline-flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
        <Loader2 aria-hidden className="size-3.5 animate-spin" />
        Sending…
      </span>
    );
  }

  if (status === "DRAFT") {
    return (
      <>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={() => onEdit(message)}>
            <Pencil aria-hidden />
            Edit
          </Button>
          <Button
            size="sm"
            onClick={() => setSendOpen(true)}
            disabled={sendDisabled}
            title={sendDisabled ? "Gmail is not connected — drafts can still be saved." : undefined}
          >
            <Send aria-hidden />
            Send now
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => setDiscardOpen(true)}
          >
            <Trash2 aria-hidden />
            Discard
          </Button>
        </div>
        <SendConfirmDialog
          open={sendOpen}
          onOpenChange={setSendOpen}
          loading={sendReply.isPending}
          to={message.toEmails.join(", ")}
          cc={message.ccEmails.join(", ")}
          subject={message.subject ?? ""}
          body={message.bodyText}
          onConfirm={() => {
            void sendReply.mutateAsync(message.id).catch(() => undefined).finally(() => setSendOpen(false));
          }}
        />
        <ConfirmDialog
          open={discardOpen}
          onOpenChange={setDiscardOpen}
          title="Discard this draft?"
          description="The draft reply will be deleted permanently. This cannot be undone."
          confirmLabel="Discard draft"
          destructive
          loading={deleteDraft.isPending}
          onConfirm={() => deleteDraft.mutate(message.id)}
        />
      </>
    );
  }

  if (status === "FAILED") {
    return (
      <>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSendOpen(true)}
            disabled={sendDisabled}
            title={sendDisabled ? "Gmail is not connected." : undefined}
          >
            <Send aria-hidden />
            Retry
          </Button>
        </div>
        <SendConfirmDialog
          open={sendOpen}
          onOpenChange={setSendOpen}
          loading={sendReply.isPending}
          to={message.toEmails.join(", ")}
          cc={message.ccEmails.join(", ")}
          subject={message.subject ?? ""}
          body={message.bodyText}
          onConfirm={() => {
            void sendReply.mutateAsync(message.id).catch(() => undefined).finally(() => setSendOpen(false));
          }}
        />
      </>
    );
  }

  if (status === "UNCERTAIN") {
    return (
      <>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void reconcileReply.mutateAsync(message.id).catch(() => undefined)}
            disabled={reconcileReply.isPending}
          >
            {reconcileReply.isPending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <AlarmClock aria-hidden />}
            Check delivery
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => setMarkFailedOpen(true)}
          >
            <ShieldAlert aria-hidden />
            Mark as failed
          </Button>
        </div>
        <ConfirmDialog
          open={markFailedOpen}
          onOpenChange={setMarkFailedOpen}
          title="Mark delivery as failed?"
          description="Only mark as failed after checking the Gmail Sent folder — sending again may duplicate the message."
          confirmLabel="Mark as failed"
          destructive
          loading={markReplyFailed.isPending}
          onConfirm={() => markReplyFailed.mutate(message.id)}
        />
      </>
    );
  }

  // SENT_ACCEPTED — the badge communicates the state, no actions.
  return null;
}
