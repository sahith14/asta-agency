/**
 * AgencyOS — billing API validation helpers (Phase 3, server-only).
 *
 * Shared zod schemas/params for the billing routes: strict CSV status filters,
 * tolerant date inputs (via parse-date), currency inputs and the frozen line
 * item shape. Money totals are recomputed server-side — these schemas only
 * gate the raw inputs.
 */
import { z } from "zod";
import { BadRequestError } from "@/lib/api";
import { toDateOrNull } from "@/lib/parse-date";
import { PAYMENT_METHODS, SERVICE_PLAN_INTERVALS } from "@/lib/types";

/** CSV/list query param, strictly validated — unknown token → 400 (tickets convention). */
export function parseEnumListParam(
  raw: string | null | undefined,
  allowed: readonly string[],
  label: string
): string[] | null {
  if (!raw) return null;
  const tokens = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (tokens.length === 0) return null;
  for (const token of tokens) {
    if (!allowed.includes(token)) {
      throw new BadRequestError(`Invalid ${label} "${token}". Allowed: ${allowed.join(", ")}.`);
    }
  }
  return tokens;
}

/** Tolerant date input: absent → undefined (untouched), ""/invalid → null, else Date. */
export const dateInput = z
  .unknown()
  .optional()
  .transform((v) => (v === undefined ? undefined : toDateOrNull(v)));

/** Optional date input that must parse when provided (""/null → null = cleared). */
export const requiredDateInput = z.unknown().transform((v) => toDateOrNull(v));

/** 3-letter currency code, uppercased ("gbp" → "GBP"). */
export const currencyInput = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .refine((s) => /^[A-Z]{3}$/.test(s), "Currency must be a 3-letter code (e.g. GBP).");

/** One invoice/quote line — raw inputs only; totals are recomputed server-side. */
export const lineItemSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, "Line description is required.")
    .max(300, "Line description must be at most 300 characters."),
  quantity: z.number().int("Quantity must be a whole number.").min(1, "Quantity must be at least 1."),
  unitPriceMinor: z.number().int("Price must be an integer number of pence.").min(0, "Price cannot be negative."),
  discountMinor: z.number().int("Discount must be an integer number of pence.").min(0, "Discount cannot be negative.").default(0),
  taxRateBps: z
    .number()
    .int("Tax rate must be an integer number of basis points.")
    .min(0, "Tax rate cannot be negative.")
    .max(10000, "Tax rate cannot exceed 10000 basis points (100%).")
    .default(0),
});

export const linesSchema = z.array(lineItemSchema).min(1, "Add at least one line.").max(100);

export const billingIntervalSchema = z.enum(SERVICE_PLAN_INTERVALS);
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);

/** Amounts: integer minor units with explicit bounds. */
export const minorAmount = (max = 2_000_000_000) =>
  z.number().int("Amount must be an integer number of pence.").min(0).max(max);
export const positiveMinorAmount = (max = 2_000_000_000) =>
  z.number().int("Amount must be an integer number of pence.").gt(0, "Amount must be greater than zero.").max(max);

/** Adds `days` to a date (used for terms/expiry defaults). */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}
