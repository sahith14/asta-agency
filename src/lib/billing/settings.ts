/**
 * AgencyOS — billing settings (Phase 3).
 *
 * Stored under the existing Setting model, key "billing", as JSON. Everything
 * is owner-configurable; NOTHING about VAT registration or tax rates is
 * hardcoded (UK agency, but legal/tax configuration is confirmed, not
 * assumed — the UI never presents tax treatment as advice).
 *
 * A short in-process cache keeps list endpoints cheap; `PUT /api/billing/
 * settings` clears it via clearBillingSettingsCache().
 */
import "server-only";
import { db } from "@/lib/db";

export const BILLING_SETTINGS_KEY = "billing";

export interface BillingSettings {
  // Business identity (printed on quotes/invoices)
  businessName: string;
  businessAddress: string;
  businessEmail: string;
  businessPhone: string;
  vatNumber: string; // free text; empty = none registered/declared
  // Numbering
  invoicePrefix: string;
  quotePrefix: string;
  paymentRefPrefix: string;
  // Tax defaults (per-line taxRateBps still overrides per line)
  defaultTaxRateBps: number; // basis points; 0 = no tax by default
  taxInclusiveDefault: boolean;
  // Commercial defaults
  defaultPaymentTermsDays: number;
  defaultQuoteExpiryDays: number;
  defaultInvoiceTerms: string;
  defaultQuoteTerms: string;
  defaultInvoiceNotes: string;
}

export const DEFAULT_BILLING_SETTINGS: BillingSettings = {
  businessName: "",
  businessAddress: "",
  businessEmail: "",
  businessPhone: "",
  vatNumber: "",
  invoicePrefix: "INV-",
  quotePrefix: "QT-",
  paymentRefPrefix: "PAY-",
  defaultTaxRateBps: 0,
  taxInclusiveDefault: false,
  defaultPaymentTermsDays: 14,
  defaultQuoteExpiryDays: 30,
  defaultInvoiceTerms: "",
  defaultQuoteTerms: "",
  defaultInvoiceNotes: "",
};

interface CacheEntry {
  value: BillingSettings;
  loadedAt: number;
}

const CACHE_TTL_MS = 5_000;

const globalCache = globalThis as unknown as {
  __agencyosBillingSettings?: CacheEntry;
};

/** Reads stored settings merged over defaults (tolerant of partial JSON). */
export async function getBillingSettings(): Promise<BillingSettings> {
  const cached = globalCache.__agencyosBillingSettings;
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached.value;

  let stored: Partial<BillingSettings> = {};
  const row = await db.setting.findUnique({ where: { key: BILLING_SETTINGS_KEY } });
  if (row?.value) {
    try {
      const parsed: unknown = JSON.parse(row.value);
      if (parsed && typeof parsed === "object") stored = parsed as Partial<BillingSettings>;
    } catch {
      // Corrupt value: fall back to defaults rather than failing requests.
    }
  }

  const merged: BillingSettings = { ...DEFAULT_BILLING_SETTINGS, ...stored };
  globalCache.__agencyosBillingSettings = { value: merged, loadedAt: Date.now() };
  return merged;
}

export async function saveBillingSettings(patch: Partial<BillingSettings>): Promise<BillingSettings> {
  const current = await getBillingSettings();
  const next: BillingSettings = { ...current, ...patch };
  await db.setting.upsert({
    where: { key: BILLING_SETTINGS_KEY },
    create: { key: BILLING_SETTINGS_KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
  clearBillingSettingsCache();
  return next;
}

export function clearBillingSettingsCache(): void {
  globalCache.__agencyosBillingSettings = undefined;
}

/** "INV-" + 7 → "INV-0007" (falls back to the bare number without a prefix). */
export function displayNumber(prefix: string, number: number): string {
  return `${prefix}${String(number).padStart(4, "0")}`;
}
