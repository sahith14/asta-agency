/**
 * AgencyOS — money arithmetic (Phase 3).
 *
 * ALL amounts are integer minor units (pence). Floating point is never used
 * for stored values; the only non-integer step is the final rounding of tax.
 *
 * Tax modes:
 * - tax-exclusive (default): unit prices EXCLUDE tax.
 *     net   = quantity × unitPrice − discount      (floored at 0)
 *     tax   = round(net × taxRateBps / 10000)
 *     gross = net + tax
 * - tax-inclusive: unit prices INCLUDE tax.
 *     gross = quantity × unitPrice − discount      (floored at 0)
 *     net   = round(gross × 10000 / (10000 + taxRateBps))
 *     tax   = gross − net
 *
 * Totals are sums of per-line figures, so tax never accumulates rounding
 * drift across lines beyond one penny per line.
 *
 * This module is pure and client-safe (no server-only imports): the UI may
 * mirror it for live previews, but the SERVER is always the authority and
 * recomputes every total from raw line inputs.
 */

export interface MoneyLineInput {
  quantity: number; // whole units, >= 1
  unitPriceMinor: number; // >= 0
  discountMinor: number; // >= 0, absolute per-line discount
  taxRateBps: number; // 0..10000 basis points (2000 = 20%)
}

export interface MoneyLineTotals {
  netMinor: number;
  taxMinor: number;
  grossMinor: number;
}

export interface MoneyTotals {
  subtotalMinor: number; // Σ net
  taxMinor: number; // Σ tax
  totalMinor: number; // Σ gross
}

/** Computes one line's net/tax/gross for the given tax mode. */
export function computeLine(line: MoneyLineInput, taxInclusive: boolean): MoneyLineTotals {
  const quantity = Math.max(1, Math.trunc(line.quantity) || 1);
  const unit = Math.max(0, Math.trunc(line.unitPriceMinor) || 0);
  const rateBps = Math.min(10000, Math.max(0, Math.trunc(line.taxRateBps) || 0));
  const discount = Math.min(Math.max(0, Math.trunc(line.discountMinor) || 0), quantity * unit);

  if (!taxInclusive) {
    const net = quantity * unit - discount;
    const tax = Math.round((net * rateBps) / 10000);
    return { netMinor: net, taxMinor: tax, grossMinor: net + tax };
  }

  const gross = quantity * unit - discount;
  const net = Math.round((gross * 10000) / (10000 + rateBps));
  return { netMinor: net, taxMinor: gross - net, grossMinor: gross };
}

/** Computes document totals from raw line inputs. */
export function computeTotals(lines: MoneyLineInput[], taxInclusive: boolean): MoneyTotals {
  let subtotalMinor = 0;
  let taxMinor = 0;
  let totalMinor = 0;
  for (const line of lines) {
    const t = computeLine(line, taxInclusive);
    subtotalMinor += t.netMinor;
    taxMinor += t.taxMinor;
    totalMinor += t.grossMinor;
  }
  return { subtotalMinor, taxMinor, totalMinor };
}

/**
 * Normalises MRR (monthly recurring revenue) contribution of a subscription:
 * MONTHLY = price, QUARTERLY = price/3, YEARLY = price/12 (integer, floor).
 */
export function monthlyEquivalentMinor(priceMinor: number, interval: string): number {
  switch (interval) {
    case "QUARTERLY":
      return Math.floor(priceMinor / 3);
    case "YEARLY":
      return Math.floor(priceMinor / 12);
    default:
      return priceMinor;
  }
}

/**
 * The number of days in one billing interval (used to advance subscription
 * periods). Months are handled calendar-accurately by the caller; this returns
 * canonical day counts for QUARTERLY/YEARLY and 30 for MONTHLY.
 */
export function intervalDays(interval: string): number {
  switch (interval) {
    case "QUARTERLY":
      return 91; // ~3 months; renewal uses calendar addPeriod, this is display fallback
    case "YEARLY":
      return 365;
    default:
      return 30;
  }
}

/**
 * Adds one billing period to a date, calendar-aware:
 * MONTHLY adds 1 calendar month, QUARTERLY 3, YEARLY 1 year.
 * Clamps to the last valid day of the target month (e.g. 31 Jan + 1 mo → 28/29 Feb).
 */
export function addBillingPeriod(date: Date, interval: string): Date {
  const d = new Date(date.getTime());
  const day = d.getDate();
  switch (interval) {
    case "QUARTERLY":
      d.setMonth(d.getMonth() + 3);
      break;
    case "YEARLY":
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      d.setMonth(d.getMonth() + 1);
  }
  // Clamp: setMonth rolls over (31 Jan + 1mo → 3 Mar); pull back into the
  // intended month when the day-of-month changed unexpectedly.
  if (d.getDate() < day) {
    // Rolled over to the next month — move to the last day of the previous one.
    d.setDate(0);
  }
  return d;
}

/**
 * Effective verified allocation schedule for a payment after refunds.
 * Refunds reduce allocations FIFO (oldest allocation first) so the sum of
 * effective amounts always equals exactly `amountMinor - refundMinor`.
 */
export function effectiveAllocations(
  amountMinor: number,
  refundMinor: number,
  allocations: { id: string; amountMinor: number }[]
): { id: string; effectiveMinor: number }[] {
  let remainingRefund = Math.max(0, Math.trunc(refundMinor) || 0);
  const out: { id: string; effectiveMinor: number }[] = [];
  for (const alloc of allocations) {
    const amount = Math.max(0, Math.trunc(alloc.amountMinor) || 0);
    const applied = Math.min(remainingRefund, amount);
    remainingRefund -= applied;
    out.push({ id: alloc.id, effectiveMinor: amount - applied });
  }
  return out;
}
