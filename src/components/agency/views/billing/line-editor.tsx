"use client";

/**
 * AgencyOS — shared line-item editor for the invoice and quote form dialogs.
 *
 * Inputs accept MAJOR units (pounds) and percent tax rates; conversion to
 * integer minor units / bps happens here. Totals are a LIVE PREVIEW via the
 * pure computeTotals helper — the server recomputes authoritative totals from
 * the raw line inputs on save.
 */
import { Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { computeTotals } from "@/lib/money";
import type { BillingLineRecord, LineItemInput } from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import {
  bpsToPercentInput,
  majorInputToMinor,
  minorToMajorInput,
  percentInputToBps,
} from "@/components/agency/views/billing/bits";

export interface EditorLine {
  key: string;
  description: string;
  quantity: string; // integer, >= 1
  unitPrice: string; // major units
  discount: string; // major units
  taxRate: string; // percent 0-100
}

let lineKeySeq = 0;
export function emptyEditorLine(): EditorLine {
  lineKeySeq += 1;
  return {
    key: `line-${lineKeySeq}-${Date.now()}`,
    description: "",
    quantity: "1",
    unitPrice: "",
    discount: "",
    taxRate: "0",
  };
}

export function editorLineFromRecord(line: BillingLineRecord): EditorLine {
  lineKeySeq += 1;
  return {
    key: `line-${lineKeySeq}-${line.id}`,
    description: line.description,
    quantity: String(line.quantity),
    unitPrice: minorToMajorInput(line.unitPriceMinor),
    discount: line.discountMinor > 0 ? minorToMajorInput(line.discountMinor) : "",
    taxRate: bpsToPercentInput(line.taxRateBps),
  };
}

/** Raw inputs -> server LineItemInput (integers in minor units / bps). */
export function toLineItemInput(line: EditorLine): LineItemInput {
  return {
    description: line.description.trim(),
    quantity: Math.max(1, Math.trunc(Number.parseFloat(line.quantity) || 1)),
    unitPriceMinor: majorInputToMinor(line.unitPrice),
    discountMinor: majorInputToMinor(line.discount),
    taxRateBps: percentInputToBps(line.taxRate),
  };
}

/**
 * Validates and converts the editor rows. Returns either the valid inputs or
 * the first human-readable error. Lines that are completely empty (no
 * description and no amounts) are silently dropped.
 */
export function buildLineInputs(
  lines: EditorLine[],
): { ok: true; lines: LineItemInput[] } | { ok: false; error: string } {
  const out: LineItemInput[] = [];
  for (const line of lines) {
    const hasDescription = line.description.trim().length > 0;
    const hasAmounts =
      majorInputToMinor(line.unitPrice) > 0 || majorInputToMinor(line.discount) > 0;
    if (!hasDescription && !hasAmounts) continue;
    if (!hasDescription) {
      return { ok: false, error: "Every line needs a description." };
    }
    const quantity = Math.trunc(Number.parseFloat(line.quantity));
    if (!Number.isFinite(quantity) || quantity < 1) {
      return { ok: false, error: `Quantity must be a whole number of at least 1 ("${line.description.trim()}").` };
    }
    out.push(toLineItemInput(line));
  }
  if (out.length === 0) {
    return { ok: false, error: "Add at least one line item." };
  }
  return { ok: true, lines: out };
}

export function LineEditor({
  lines,
  onChange,
  currency = "GBP",
  taxInclusive,
}: {
  lines: EditorLine[];
  onChange: (lines: EditorLine[]) => void;
  currency?: string;
  taxInclusive: boolean;
}) {
  const update = (key: string, patch: Partial<EditorLine>) => {
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };
  const remove = (key: string) => {
    const next = lines.filter((line) => line.key !== key);
    onChange(next.length > 0 ? next : [emptyEditorLine()]);
  };

  const preview = computeTotals(
    lines.map(toLineItemInput),
    taxInclusive,
  );

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {lines.map((line, index) => (
          <div
            key={line.key}
            className="rounded-lg border bg-muted/20 p-3"
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-12 sm:items-end">
              <div className="col-span-2 space-y-1 sm:col-span-5">
                <Label htmlFor={`line-desc-${index}`} className="sr-only sm:not-sr-only">
                  Description
                </Label>
                <Input
                  id={`line-desc-${index}`}
                  value={line.description}
                  onChange={(event) => update(line.key, { description: event.target.value })}
                  placeholder="e.g. Website maintenance — March"
                  aria-label={`Line ${index + 1} description`}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor={`line-qty-${index}`} className="sr-only sm:not-sr-only">
                  Qty
                </Label>
                <Input
                  id={`line-qty-${index}`}
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={line.quantity}
                  onChange={(event) => update(line.key, { quantity: event.target.value })}
                  aria-label={`Line ${index + 1} quantity`}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor={`line-price-${index}`} className="sr-only sm:not-sr-only">
                  Unit price
                </Label>
                <Input
                  id={`line-price-${index}`}
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={line.unitPrice}
                  onChange={(event) => update(line.key, { unitPrice: event.target.value })}
                  placeholder="0.00"
                  aria-label={`Line ${index + 1} unit price (${currency}, per unit)`}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor={`line-discount-${index}`} className="sr-only sm:not-sr-only">
                  Discount
                </Label>
                <Input
                  id={`line-discount-${index}`}
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={line.discount}
                  onChange={(event) => update(line.key, { discount: event.target.value })}
                  placeholder="0.00"
                  aria-label={`Line ${index + 1} discount (${currency}, total for the line)`}
                />
              </div>
              <div className="space-y-1 sm:col-span-1">
                <Label htmlFor={`line-tax-${index}`} className="sr-only sm:not-sr-only">
                  Tax %
                </Label>
                <Input
                  id={`line-tax-${index}`}
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  inputMode="decimal"
                  value={line.taxRate}
                  onChange={(event) => update(line.key, { taxRate: event.target.value })}
                  aria-label={`Line ${index + 1} tax rate percent`}
                />
              </div>
              <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-12 sm:justify-end">
                <span className="text-xs tabular-nums text-muted-foreground sm:hidden">
                  Line total:{" "}
                  <span className="font-medium text-foreground">
                    {formatCurrency(
                      computeTotals([toLineItemInput(line)], taxInclusive).totalMinor,
                      currency,
                    )}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-9 text-destructive hover:text-destructive"
                  onClick={() => remove(line.key)}
                  disabled={lines.length <= 1}
                  aria-label={`Remove line ${index + 1}`}
                >
                  <Trash2 aria-hidden />
                  Remove
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-9"
          onClick={() => onChange([...lines, emptyEditorLine()])}
        >
          <Plus aria-hidden />
          Add line
        </Button>
        <div className="min-w-48 flex-1 rounded-lg border bg-card p-3 sm:max-w-72">
          <p className="mb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Preview — totals are calculated on the server
          </p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{formatCurrency(preview.subtotalMinor, currency)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Tax</span>
              <span className="tabular-nums">{formatCurrency(preview.taxMinor, currency)}</span>
            </div>
            <div className="flex justify-between gap-4 border-t pt-1 font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(preview.totalMinor, currency)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
