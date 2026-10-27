/**
 * AgencyOS — Shared Ticket/TicketMessage → Record mapping for the tickets API
 * routes (colocated helper, not a route).
 *
 * JSON string columns (toEmails/ccEmails) are parsed into typed arrays here so
 * every tickets route returns the same shapes.
 */
import { Prisma } from "@prisma/client";
import type { TicketMessageRecord, TicketRecord } from "@/lib/types";

export const ticketInclude = {
  client: { select: { id: true, businessName: true } },
  website: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
  assignee: { select: { id: true, displayName: true } },
  createdBy: { select: { id: true, displayName: true } },
  _count: { select: { messages: true, tasks: true } },
} satisfies Prisma.TicketInclude;

export type TicketWithRefs = Prisma.TicketGetPayload<{ include: typeof ticketInclude }>;

export function toTicketRecord(row: TicketWithRefs): TicketRecord {
  return { ...row } as unknown as TicketRecord; // Dates serialize to ISO strings in JSON.
}

export const ticketMessageInclude = {
  author: { select: { id: true, displayName: true } },
} satisfies Prisma.TicketMessageInclude;

export type TicketMessageWithAuthor = Prisma.TicketMessageGetPayload<{ include: typeof ticketMessageInclude }>;

export function toTicketMessageRecord(row: TicketMessageWithAuthor): TicketMessageRecord {
  return {
    ...row,
    toEmails: parseMessageArray(row.toEmails),
    ccEmails: parseMessageArray(row.ccEmails),
  } as unknown as TicketMessageRecord; // Dates serialize to ISO strings in JSON.
}

function parseMessageArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}
