"use client";

/**
 * AgencyOS — Inbox message drawer (task 3-a).
 * Right-side Sheet with the full message: plain-text body (default), optional
 * server-SANITISED HTML preview inside a script-less sandboxed iframe (the raw
 * bodyHtml is never rendered), thread context, attachment metadata and — for
 * review-queue items — the match panel.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { openTicket } from "@/components/agency/store";
import { MatchPanel } from "@/components/agency/views/inbox/match-panel";
import {
  DirectionIcon,
  AttachmentDot,
  senderName,
  ticketLabel,
} from "@/components/agency/views/inbox/list-bits";
import {
  apiFetch,
  label,
  type EmailMessageDetailRecord,
} from "@/lib/types";
import { fileSize, formatDateTime, timeAgo } from "@/lib/format";

interface EmailDrawerProps {
  emailId: string | null;
  onClose: () => void;
  /** Called after a successful match action — the parent closes when the review tab is active. */
  onCloseAfterMatch: () => void;
}

export function EmailDrawer({ emailId, onClose, onCloseAfterMatch }: EmailDrawerProps) {
  const detailQuery = useQuery({
    queryKey: ["email", emailId],
    queryFn: () => apiFetch<EmailMessageDetailRecord>(`/api/emails/${emailId}`),
    enabled: !!emailId,
  });

  const message = detailQuery.data;
  const inReviewQueue =
    !!message && message.matchStatus !== "CONFIRMED" && message.matchStatus !== "NO_MATCH";

  return (
    <Sheet open={!!emailId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-xl">
        <SheetHeader className="border-b">
          <SheetTitle className="pr-8 text-base leading-snug">
            {message
              ? message.subject?.trim()
                ? message.subject
                : "(no subject)"
              : "Message"}
          </SheetTitle>
          {message ? (
            <SheetDescription>
              {senderName(message)} &lt;{message.fromEmail}&gt; ·{" "}
              {formatDateTime(message.sentAt)}
            </SheetDescription>
          ) : (
            <SheetDescription>Full message record and review actions.</SheetDescription>
          )}
        </SheetHeader>

        {detailQuery.isLoading ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : detailQuery.isError ? (
          <div className="flex flex-col items-start gap-3 p-4">
            <p className="text-sm text-destructive">
              {(detailQuery.error as Error)?.message ?? "The message could not be loaded."}
            </p>
            <Button variant="outline" size="sm" onClick={() => detailQuery.refetch()}>
              <RotateCw aria-hidden />
              Try again
            </Button>
          </div>
        ) : message ? (
          <div className="space-y-5 p-4">
            {/* Meta line */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <DirectionIcon direction={message.direction} className="size-4" />
                {label(message.direction)}
              </span>
              <StatusBadge value={message.matchStatus} />
              {message.client ? (
                <span className="text-xs text-muted-foreground">
                  Client: <span className="font-medium text-foreground">{message.client.businessName}</span>
                </span>
              ) : null}
              {message.hasAttachments ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <AttachmentDot />
                  {message.attachments.length} attachment{message.attachments.length === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>

            {/* Linked ticket */}
            {message.ticket ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>Linked ticket</span>
                <button
                  type="button"
                  onClick={() => openTicket(message.ticket!.id)}
                  className="rounded-full border bg-background px-2 py-0.5 font-medium text-foreground hover:bg-muted"
                  aria-label={`Open ticket ${ticketLabel(message.ticket.number)}`}
                >
                  {ticketLabel(message.ticket.number)} · {message.ticket.subject}
                </button>
              </div>
            ) : null}

            {/* Body (keyed by message so the format toggle resets per email) */}
            <MessageBody key={message.id} message={message} />

            {/* Thread context */}
            {message.threadMessages.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">
                  Thread ({message.threadMessages.length}{" "}
                  {message.threadMessages.length === 1 ? "message" : "messages"})
                </h3>
                <ul className="max-h-48 space-y-1.5 overflow-y-auto pr-1 scrollbar-thin">
                  {message.threadMessages.map((threadMessage) => (
                    <li
                      key={threadMessage.id}
                      className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs"
                    >
                      <DirectionIcon direction={threadMessage.direction} className="size-4" />
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium text-foreground">
                          {senderName(threadMessage)}
                        </span>{" "}
                        <span className="text-muted-foreground">&lt;{threadMessage.fromEmail}&gt;</span>
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {threadMessage.sentAt ? timeAgo(threadMessage.sentAt) : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Attachments (metadata only this phase) */}
            {message.attachments.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">
                  Attachments ({message.attachments.length})
                </h3>
                <ul className="space-y-1.5">
                  {message.attachments.map((attachment) => (
                    <li
                      key={attachment.attachmentId}
                      className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border px-2.5 py-1.5 text-xs"
                    >
                      <AttachmentDot />
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                        {attachment.fileName}
                      </span>
                      <span className="text-muted-foreground">{fileSize(attachment.sizeBytes)}</span>
                      <span className="truncate text-muted-foreground/70">{attachment.mimeType}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Review actions */}
            {inReviewQueue ? (
              <>
                <Separator />
                <MatchPanel email={message} onAfterMatch={onCloseAfterMatch} />
              </>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            Loading message…
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Message body renderer. Plain text is the default; when the server provided a
 * sanitised HTML subset a "View formatted" toggle renders it inside a
 * sandboxed iframe WITHOUT allow-scripts, so nothing can execute. The raw
 * bodyHtml is never rendered anywhere.
 */
function MessageBody({ message }: { message: EmailMessageDetailRecord }) {
  const [formatted, setFormatted] = useState(false);
  const showFormatted = formatted && !!message.sanitisedHtml;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Message body</h3>
        {message.sanitisedHtml ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFormatted((v) => !v)}
            aria-pressed={showFormatted}
          >
            {showFormatted ? "View plain text" : "View formatted"}
          </Button>
        ) : null}
      </div>
      {showFormatted && message.sanitisedHtml ? (
        <iframe
          sandbox=""
          srcDoc={message.sanitisedHtml}
          className="h-96 w-full rounded-md border bg-white"
          title="Formatted email body"
        />
      ) : (
        <pre className="max-h-96 overflow-y-auto rounded-md border bg-muted/30 p-3 font-sans text-sm whitespace-pre-wrap scrollbar-thin">
          {message.bodyText?.trim() || "(No plain-text body was synchronised for this message.)"}
        </pre>
      )}
    </div>
  );
}
