"use client";

/**
 * AgencyOS — shared billing UI bits (Phase 3, task 2-b).
 *
 * MoneyText / TotalsBlock / LineTotalsTable: display helpers that ALWAYS go
 * through formatCurrency (never hand-formatted money).
 * printDocument / buildDocumentHtml: self-contained print window for quotes
 * and invoices (no PDF library, no external assets).
 * useBillingSettings / useBillingSummary: shared billing queries.
 */
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  apiFetch,
  label,
  type BillingLineRecord,
  type BillingSettingsRecord,
  type BillingSummaryData,
} from "@/lib/types";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { computeLine } from "@/lib/money";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Money display + input conversion helpers
// ---------------------------------------------------------------------------

/** A formatted amount — minor units in, formatted currency out. */
export function MoneyText({
  minor,
  currency = "GBP",
  className,
}: {
  minor: number | null | undefined;
  currency?: string;
  className?: string;
}) {
  return (
    <span className={cn("tabular-nums", className)}>{formatCurrency(minor, currency)}</span>
  );
}

/** Major-unit (pounds) string -> integer minor units (e.g. "29.5" -> 2950). */
export function majorInputToMinor(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed * 100));
}

/** Integer minor units -> major-unit string for <Input> values ("" when absent). */
export function minorToMajorInput(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return "";
  return (minor / 100).toFixed(2);
}

/** Percent string (0-100) -> basis points (e.g. "20" -> 2000). */
export function percentInputToBps(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(10000, Math.max(0, Math.round(parsed * 100)));
}

/** Basis points -> percent string for <Input> values ("2000" -> "20"). */
export function bpsToPercentInput(bps: number | null | undefined): string {
  if (!bps) return "0";
  const percent = bps / 100;
  return Number.isInteger(percent) ? String(percent) : percent.toFixed(2);
}

/** "month" / "quarter" / "year" noun for "£29.00 / month" rows. */
export function intervalNoun(interval: string): string {
  if (interval === "QUARTERLY") return "quarter";
  if (interval === "YEARLY") return "year";
  if (interval === "MONTHLY") return "month";
  return label(interval).toLowerCase();
}

// ---------------------------------------------------------------------------
// Date input helpers (dates are sent as "YYYY-MM-DD"; the server tolerates ISO)
// ---------------------------------------------------------------------------

export function todayInput(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDaysInput(days: number): string {
  const now = new Date();
  now.setDate(now.getDate() + Math.max(0, days));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// ---------------------------------------------------------------------------
// Document header (invoice / quote detail share this pattern)
// ---------------------------------------------------------------------------

export function DocumentHeader({
  title,
  onBack,
  badges,
  meta,
  actions,
}: {
  title: string;
  onBack: () => void;
  badges?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Go back"
          className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-md border bg-card outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring sm:size-9"
        >
          <ArrowLeft aria-hidden className="size-4" />
        </button>
        <div className="min-w-0 space-y-1.5">
          <h2 className="min-w-0 text-xl font-semibold break-words tracking-tight sm:text-2xl">
            {title}
          </h2>
          {badges ? <div className="flex flex-wrap items-center gap-2">{badges}</div> : null}
          {meta ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              {meta}
            </div>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Totals block (Subtotal / Tax / Total + optional Paid / Pending / Outstanding)
// ---------------------------------------------------------------------------

export function TotalsBlock({
  totals,
  currency,
  paidMinor,
  pendingMinor,
  outstandingMinor,
  className,
}: {
  totals: { subtotalMinor: number; taxMinor: number; totalMinor: number };
  currency: string;
  paidMinor?: number;
  pendingMinor?: number;
  outstandingMinor?: number;
  className?: string;
}) {
  const hasBalance =
    paidMinor !== undefined || pendingMinor !== undefined || outstandingMinor !== undefined;
  return (
    <div className={cn("space-y-1.5 text-sm", className)}>
      <div className="flex items-center justify-between gap-6">
        <span className="text-muted-foreground">Subtotal</span>
        <MoneyText minor={totals.subtotalMinor} currency={currency} />
      </div>
      <div className="flex items-center justify-between gap-6">
        <span className="text-muted-foreground">Tax</span>
        <MoneyText minor={totals.taxMinor} currency={currency} />
      </div>
      <div className="flex items-center justify-between gap-6 border-t pt-1.5">
        <span className="font-medium">Total</span>
        <span className="text-base font-semibold tabular-nums">
          {formatCurrency(totals.totalMinor, currency)}
        </span>
      </div>
      {hasBalance ? (
        <div className="space-y-1.5 border-t pt-2">
          {paidMinor !== undefined ? (
            <div className="flex items-center justify-between gap-6">
              <span className="text-muted-foreground">Paid</span>
              <MoneyText minor={paidMinor} currency={currency} className="font-medium text-success" />
            </div>
          ) : null}
          {pendingMinor !== undefined && pendingMinor > 0 ? (
            <div className="flex items-center justify-between gap-6">
              <span className="inline-flex items-baseline gap-1.5 text-muted-foreground">
                Pending
                <span className="text-[11px] font-normal">
                  (pending payments do not reduce the balance)
                </span>
              </span>
              <MoneyText minor={pendingMinor} currency={currency} />
            </div>
          ) : null}
          {outstandingMinor !== undefined ? (
            <div className="flex items-center justify-between gap-6">
              <span className="font-medium">Outstanding</span>
              <span
                className={cn(
                  "text-base font-semibold tabular-nums",
                  outstandingMinor > 0 && "text-destructive",
                )}
              >
                {formatCurrency(outstandingMinor, currency)}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Line items table for stored documents (BillingLineRecord[])
// ---------------------------------------------------------------------------

export function LineTotalsTable({
  lines,
  currency,
  taxInclusive,
}: {
  lines: BillingLineRecord[];
  currency: string;
  taxInclusive?: boolean;
}) {
  const subtotal = lines.reduce((sum, line) => sum + line.netMinor, 0);
  const tax = lines.reduce((sum, line) => sum + line.taxMinor, 0);
  const total = lines.reduce((sum, line) => sum + line.grossMinor, 0);

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="min-w-48">Description</TableHead>
            <TableHead className="w-16 text-right">Qty</TableHead>
            <TableHead className="w-28 text-right">Unit price</TableHead>
            <TableHead className="w-24 text-right">Discount</TableHead>
            <TableHead className="w-20 text-right">Tax rate</TableHead>
            <TableHead className="w-28 text-right">Net</TableHead>
            <TableHead className="w-24 text-right">Tax</TableHead>
            <TableHead className="w-28 text-right">Gross</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell className="max-w-80 font-medium whitespace-pre-wrap">
                {line.description}
              </TableCell>
              <TableCell className="text-right tabular-nums">{line.quantity}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(line.unitPriceMinor, currency)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {line.discountMinor > 0 ? formatCurrency(line.discountMinor, currency) : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {line.taxRateBps > 0
                  ? `${(line.taxRateBps / 100).toFixed(line.taxRateBps % 100 === 0 ? 0 : 2)}%`
                  : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(line.netMinor, currency)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(line.taxMinor, currency)}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatCurrency(line.grossMinor, currency)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={5} className="text-right text-muted-foreground">
              {taxInclusive ? "Prices include tax" : "Totals"}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCurrency(subtotal, currency)}
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatCurrency(tax, currency)}</TableCell>
            <TableCell className="text-right font-semibold tabular-nums">
              {formatCurrency(total, currency)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Print (self-contained HTML window — no PDF library, no external assets)
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Opens a print-friendly window with a self-contained HTML document and calls
 * window.print(). `html` is the page BODY content (data is escaped by the
 * builder helpers before being passed in).
 */
export function printDocument(title: string, html: string): void {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) {
    toast.error("Pop-up blocked — allow pop-ups for this site to print.");
    return;
  }
  win.document.write(
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1c1917; margin: 0; padding: 40px 48px; font-size: 13px; line-height: 1.5; }
  .doc-header { display: flex; justify-content: space-between; gap: 32px; border-bottom: 2px solid #1c1917; padding-bottom: 16px; margin-bottom: 20px; }
  .business h1 { font-size: 18px; margin: 0 0 4px; }
  .business p { margin: 0; color: #57534e; white-space: pre-line; }
  .doc-meta { text-align: right; }
  .doc-meta h2 { font-size: 22px; letter-spacing: 2px; text-transform: uppercase; margin: 0 0 8px; }
  .doc-meta table { border-collapse: collapse; margin-left: auto; }
  .doc-meta td { padding: 1px 0 1px 16px; font-size: 12px; color: #44403c; }
  .doc-meta td.k { color: #78716c; text-align: right; }
  .parties { display: flex; gap: 32px; margin-bottom: 20px; }
  .parties > div { flex: 1; border: 1px solid #d6d3d1; border-radius: 6px; padding: 10px 12px; }
  .parties h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #78716c; margin: 0 0 6px; }
  .parties p { margin: 0; white-space: pre-line; }
  table.items { width: 100%; border-collapse: collapse; margin: 8px 0 4px; }
  table.items th { border-bottom: 1px solid #1c1917; text-align: right; padding: 6px 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #57534e; }
  table.items th:first-child, table.items td:first-child { text-align: left; }
  table.items td { border-bottom: 1px solid #e7e5e4; padding: 6px 8px; text-align: right; white-space: pre-line; }
  table.items td.num { font-variant-numeric: tabular-nums; }
  .totals-right { display: flex; justify-content: flex-end; }
  .totals-right table { border-collapse: collapse; min-width: 260px; margin: 10px 0 16px; }
  .totals-right td { padding: 3px 0 3px 24px; text-align: right; }
  .totals-right td.k { color: #78716c; }
  .totals-right td.grand { font-weight: 700; font-size: 15px; border-top: 1px solid #1c1917; }
  .notes { margin-top: 12px; padding-top: 10px; border-top: 1px solid #d6d3d1; }
  .notes h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #78716c; margin: 0 0 4px; }
  .notes p { margin: 0 0 10px; white-space: pre-line; color: #44403c; }
  .footer { margin-top: 32px; padding-top: 10px; border-top: 1px solid #d6d3d1; color: #a8a29e; font-size: 11px; }
  @media print { body { padding: 16px 24px; } }
</style>
</head>
<body>
${html}
<div class="footer">Generated by AgencyOS — ${escapeHtml(formatDateTime(new Date().toISOString()))}</div>
</body>
</html>`,
  );
  win.document.close();
  win.focus();
  win.print();
}

export interface PrintDocumentParams {
  heading: string; // "INVOICE" / "QUOTE"
  displayNumber: string;
  business: { name: string; address: string; email: string; phone: string; vatNumber: string };
  metaRows: [string, string][]; // e.g. Issue date / Due date
  clientBlock: string; // multi-line plain text (escaped internally)
  clientHeading?: string;
  referenceBlock?: { heading: string; text: string } | null;
  lines: BillingLineRecord[];
  totals: { subtotalMinor: number; taxMinor: number; totalMinor: number };
  currency: string;
  taxInclusive?: boolean;
  notes?: string | null;
  terms?: string | null;
  balanceNote?: string | null; // e.g. "Paid £… · Outstanding £…"
}

/** Builds the print BODY for a quote or invoice from plain data. */
export function buildDocumentHtml(params: PrintDocumentParams): string {
  const { business } = params;
  const currency = params.currency || "GBP";
  const money = (minor: number) => formatCurrency(minor, currency);

  const businessLines = [
    business.name,
    business.address,
    [business.email, business.phone].filter(Boolean).join(" · "),
    business.vatNumber ? `VAT: ${business.vatNumber}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const metaRowsHtml = params.metaRows
    .map(
      ([k, v]) => `<tr><td class="k">${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`,
    )
    .join("");

  const rowsHtml = params.lines
    .map((line) => {
      const computed = computeLine(
        {
          quantity: line.quantity,
          unitPriceMinor: line.unitPriceMinor,
          discountMinor: line.discountMinor,
          taxRateBps: line.taxRateBps,
        },
        Boolean(params.taxInclusive),
      );
      const cells = [
        `<td>${escapeHtml(line.description)}</td>`,
        `<td class="num">${line.quantity}</td>`,
        `<td class="num">${money(line.unitPriceMinor)}</td>`,
        `<td class="num">${line.discountMinor > 0 ? money(line.discountMinor) : "—"}</td>`,
        `<td class="num">${
          line.taxRateBps > 0
            ? `${(line.taxRateBps / 100).toFixed(line.taxRateBps % 100 === 0 ? 0 : 2)}%`
            : "—"
        }</td>`,
        `<td class="num">${money(computed.netMinor)}</td>`,
        `<td class="num">${money(computed.taxMinor)}</td>`,
        `<td class="num">${money(computed.grossMinor)}</td>`,
      ].join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  const balanceRow = params.balanceNote
    ? `<tr><td class="k">Balance</td><td>${escapeHtml(params.balanceNote)}</td></tr>`
    : "";

  const referenceHtml = params.referenceBlock
    ? `<div><h3>${escapeHtml(params.referenceBlock.heading)}</h3><p>${escapeHtml(
        params.referenceBlock.text,
      )}</p></div>`
    : "";

  return `
<div class="doc-header">
  <div class="business"><h1>${escapeHtml(business.name || "Agency")}</h1><p>${escapeHtml(
    businessLines,
  )}</p></div>
  <div class="doc-meta">
    <h2>${escapeHtml(params.heading)}</h2>
    <table><tr><td class="k">Number</td><td>${escapeHtml(
      params.displayNumber,
    )}</td></tr>${metaRowsHtml}${balanceRow}</table>
  </div>
</div>
<div class="parties">
  <div>
    <h3>${escapeHtml(params.clientHeading ?? "Bill to")}</h3>
    <p>${escapeHtml(params.clientBlock)}</p>
  </div>
  ${referenceHtml}
</div>
<table class="items">
  <thead>
    <tr>
      <th>Description</th><th>Qty</th><th>Unit price</th><th>Discount</th><th>Tax rate</th><th>Net</th><th>Tax</th><th>Gross</th>
    </tr>
  </thead>
  <tbody>${rowsHtml}</tbody>
</table>
<div class="totals-right">
  <table>
    <tr><td class="k">Subtotal</td><td>${money(params.totals.subtotalMinor)}</td></tr>
    <tr><td class="k">Tax</td><td>${money(params.totals.taxMinor)}</td></tr>
    <tr><td class="grand">Total</td><td class="grand">${money(params.totals.totalMinor)}</td></tr>
  </table>
</div>
${params.notes ? `<div class="notes"><h3>Notes</h3><p>${escapeHtml(params.notes)}</p></div>` : ""}
${params.terms ? `<div class="notes"><h3>Terms</h3><p>${escapeHtml(params.terms)}</p></div>` : ""}
`;
}

// ---------------------------------------------------------------------------
// Shared billing queries
// ---------------------------------------------------------------------------

export function useBillingSettings() {
  return useQuery({
    queryKey: ["billing-settings"],
    queryFn: () => apiFetch<BillingSettingsRecord>("/api/billing/settings"),
    staleTime: 30_000,
  });
}

export function useBillingSummary() {
  return useQuery({
    queryKey: ["billing-summary"],
    queryFn: () => apiFetch<BillingSummaryData>("/api/billing/summary"),
  });
}

// ---------------------------------------------------------------------------
// Shared skeleton rows
// ---------------------------------------------------------------------------

export function BillingListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy aria-label="Loading">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-xl border bg-card p-4">
          <Skeleton className="h-5 w-20" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-16" />
        </div>
      ))}
    </div>
  );
}

export function BillingDetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy aria-label="Loading document">
      <div className="flex items-start gap-3">
        <Skeleton className="size-9 rounded-md" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-2/5" />
          <Skeleton className="h-4 w-1/3" />
        </div>
        <Skeleton className="h-9 w-44" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <div className="space-y-4">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export { formatDate };
