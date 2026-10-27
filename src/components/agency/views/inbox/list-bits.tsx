"use client";

/**
 * AgencyOS — small building blocks for the Inbox view (task 3-a).
 * Kept colocated under views/inbox/ so the main view file stays readable.
 */
import { ArrowDownLeft, ArrowUpRight, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EmailMessageRecord } from "@/lib/types";

/** "Ada Lovelace" / fallback to the bare email address. */
export function senderName(email: Pick<EmailMessageRecord, "fromName" | "fromEmail">): string {
  const name = email.fromName?.trim();
  return name || email.fromEmail;
}

/** "Name <address>" when a display name exists, otherwise just the address. */
export function senderFull(email: Pick<EmailMessageRecord, "fromName" | "fromEmail">): string {
  const name = email.fromName?.trim();
  return name ? `${name} <${email.fromEmail}>` : email.fromEmail;
}

/** Direction arrow: inbound (customer) vs outbound (sent). */
export function DirectionIcon({
  direction,
  className,
}: {
  direction: string;
  className?: string;
}) {
  const inbound = direction !== "OUTBOUND";
  const Icon = inbound ? ArrowDownLeft : ArrowUpRight;
  return (
    <span
      title={inbound ? "Inbound" : "Outbound"}
      aria-label={inbound ? "Inbound" : "Outbound"}
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-full border",
        inbound
          ? "border-primary/25 bg-primary/10 text-primary"
          : "border-border bg-muted text-muted-foreground",
        className,
      )}
    >
      <Icon aria-hidden className="size-3" />
    </span>
  );
}

/** Paperclip indicator for messages with attachments. */
export function AttachmentDot({ className }: { className?: string }) {
  return (
    <span
      title="Has attachments"
      aria-label="Has attachments"
      className={cn("inline-flex items-center text-muted-foreground", className)}
    >
      <Paperclip aria-hidden className="size-3.5" />
    </span>
  );
}

/** "TKT-0042" from the numeric ticket number. */
export function ticketLabel(number: number): string {
  return `TKT-${String(number).padStart(4, "0")}`;
}
