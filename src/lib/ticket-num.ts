/**
 * AgencyOS — Ticket numbering (Task 2-c).
 *
 * SQLite has no sequences, so the next ticket number is computed as
 * max(number) + 1 inside a transaction. Because two concurrent creations can
 * race between compute and insert (unique constraint on Ticket.number), the
 * helper `createTicketWithNumber` retries the whole compute+insert cycle on a
 * P2002 unique violation (up to 3 attempts) instead of surfacing a 409.
 */
import "server-only";
import { Prisma, type Ticket } from "@prisma/client";
import { db } from "@/lib/db";

export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** Next free ticket number (max + 1). Retries the aggregate on P2002 races. */
export async function nextTicketNumber(): Promise<number> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const agg = await tx.ticket.aggregate({ _max: { number: true } });
        return (agg._max.number ?? 0) + 1;
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        lastError = err;
        continue; // re-run: another writer just reserved the number we computed
      }
      throw err;
    }
  }
  throw lastError ?? new Error("Could not allocate a ticket number.");
}

/**
 * Creates a ticket with an auto-allocated sequential number, retrying the
 * compute+insert cycle when a concurrent creation claims the same number.
 */
export async function createTicketWithNumber(data: Omit<Prisma.TicketCreateInput, "number">): Promise<Ticket> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const number = await nextTicketNumber();
    try {
      return await db.ticket.create({ data: { ...data, number } });
    } catch (err) {
      if (isUniqueViolation(err)) {
        lastError = err;
        continue; // number lost the race — recompute and try again
      }
      throw err;
    }
  }
  throw lastError ?? new Error("Could not create ticket with a unique number.");
}
