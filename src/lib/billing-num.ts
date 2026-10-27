/**
 * AgencyOS — billing document numbering (Phase 3).
 *
 * Same strategy as ticket numbering: SQLite has no sequences, so the next
 * number is max(number)+1 and creators retry on P2002 unique violations.
 * Display prefixes come from billing settings (INV- / QT- / PAY-); the stored
 * value is a bare integer so prefixes stay re-configurable without migration.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

async function nextNumber(model: "quote" | "invoice" | "payment"): Promise<number> {
  const agg = await (db[model] as typeof db.quote).aggregate({ _max: { number: true } });
  return (agg._max.number ?? 0) + 1;
}

/**
 * Runs `create` with an auto-allocated sequential `number`, retrying the
 * compute+insert cycle when a concurrent creation claims the same number.
 * `create(number)` must perform the actual insert.
 */
export async function createWithNumber<T>(
  model: "quote" | "invoice" | "payment",
  create: (number: number) => Promise<T>
): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const number = await nextNumber(model);
    try {
      return await create(number);
    } catch (err) {
      if (isUniqueViolation(err)) {
        lastError = err;
        continue; // number lost the race — recompute and try again
      }
      throw err;
    }
  }
  throw lastError ?? new Error(`Could not allocate a unique ${model} number.`);
}
