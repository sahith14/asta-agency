"use client";

/**
 * AgencyOS — shared create/edit invoice dialog (Phase 3, task 2-b).
 *
 * Three modes:
 * - manual create: full form with the shared LineEditor (live preview only —
 *   the server recomputes authoritative totals);
 * - "from quote": pick an ACCEPTED quote, terms/lines are copied server-side
 *   (POST { fromQuoteId });
 * - edit: DRAFT invoices only, PATCH /api/billing/invoices/{id}.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Quote } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { buildQuery } from "@/components/agency/shared/record-list-helpers";
import {
  apiFetch,
  type BillingLineRecord,
  type BillingSettingsRecord,
  type InvoiceRecord,
  type Paginated,
  type QuoteRecord,
} from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import {
  useClientsLookup,
  useProjectsLookup,
  useWebsitesLookup,
} from "@/components/agency/views/tasks/lookups";
import { useBillingSettings } from "@/components/agency/views/billing/bits";
import {
  LineEditor,
  buildLineInputs,
  emptyEditorLine,
  type EditorLine,
} from "@/components/agency/views/billing/line-editor";
import {
  addDaysInput,
  bpsToPercentInput,
  minorToMajorInput,
  todayInput,
} from "@/components/agency/views/billing/bits";

const NONE = "none";

export function InvoiceFormDialog({
  open,
  onOpenChange,
  invoice,
  lines,
  initialQuoteId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set the dialog edits this DRAFT invoice. */
  invoice?: InvoiceRecord | null;
  /** Lines for edit-mode prefill (from the invoice detail payload). */
  lines?: BillingLineRecord[];
  /** Preset the from-quote picker (quote detail → "Create invoice"). */
  initialQuoteId?: string | null;
  onSaved?: (invoice: InvoiceRecord) => void;
}) {
  const settings = useBillingSettings();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent className="max-h-[92svh] overflow-y-auto scrollbar-thin sm:max-w-2xl lg:max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {invoice ? `Edit ${invoice.displayNumber}` : "New invoice"}
            </DialogTitle>
            <DialogDescription>
              {invoice
                ? "Draft invoices can be corrected freely. Issue it when it becomes a formal record."
                : "Draft an invoice for a client. Issue it when it is ready to send."}
            </DialogDescription>
          </DialogHeader>
          {settings.isLoading ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 aria-hidden className="mr-2 size-4 animate-spin" />
              Loading defaults…
            </div>
          ) : (
            <InvoiceFormInner
              settings={settings.data ?? null}
              invoice={invoice ?? null}
              lines={lines ?? []}
              initialQuoteId={initialQuoteId ?? null}
              onOpenChange={onOpenChange}
              onSaved={onSaved}
            />
          )}
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function InvoiceFormInner({
  settings,
  invoice,
  lines,
  initialQuoteId,
  onOpenChange,
  onSaved,
}: {
  settings: BillingSettingsRecord | null;
  invoice: InvoiceRecord | null;
  lines: BillingLineRecord[];
  initialQuoteId: string | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: (invoice: InvoiceRecord) => void;
}) {
  const isEdit = Boolean(invoice);
  const isFromQuoteMode = !isEdit && Boolean(initialQuoteId);
  const queryClient = useQueryClient();

  const [serverError, setServerError] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [lineError, setLineError] = useState<string | null>(null);

  const [quoteId, setQuoteId] = useState(initialQuoteId ?? "");
  const [clientId, setClientId] = useState(invoice?.clientId ?? "");
  const [websiteId, setWebsiteId] = useState(invoice?.websiteId ?? "");
  const [projectId, setProjectId] = useState(invoice?.projectId ?? "");
  const [issueDate, setIssueDate] = useState(
    invoice?.issueDate ? invoice.issueDate.slice(0, 10) : todayInput(),
  );
  const [dueDate, setDueDate] = useState(
    invoice?.dueDate
      ? invoice.dueDate.slice(0, 10)
      : addDaysInput(settings?.defaultPaymentTermsDays ?? 14),
  );
  const [taxInclusive, setTaxInclusive] = useState(
    invoice ? invoice.taxInclusive : (settings?.taxInclusiveDefault ?? false),
  );
  const [notes, setNotes] = useState(invoice?.notes ?? settings?.defaultInvoiceNotes ?? "");
  const [terms, setTerms] = useState(invoice?.terms ?? settings?.defaultInvoiceTerms ?? "");
  const [editorLines, setEditorLines] = useState<EditorLine[]>(() => {
    if (lines.length > 0) {
      return lines.map((line) => ({
        key: `line-${line.id}`,
        description: line.description,
        quantity: String(line.quantity),
        unitPrice: minorToMajorInput(line.unitPriceMinor),
        discount: line.discountMinor > 0 ? minorToMajorInput(line.discountMinor) : "",
        taxRate: bpsToPercentInput(line.taxRateBps),
      }));
    }
    return [emptyEditorLine()];
  });

  const clients = useClientsLookup();
  const websites = useWebsitesLookup(clientId);
  const projects = useProjectsLookup(clientId);

  // Accepted quotes for the from-quote picker.
  const quotesQuery = useQuery({
    queryKey: ["billing-quotes-convertible"],
    queryFn: () =>
      apiFetch<Paginated<QuoteRecord>>(
        `/api/billing/quotes${buildQuery({ status: "ACCEPTED", pageSize: 50 })}`,
      ),
    enabled: !isEdit,
    staleTime: 30_000,
  });
  const selectedQuote = useMemo(
    () => (quotesQuery.data?.items ?? []).find((quote) => quote.id === quoteId) ?? null,
    [quotesQuery.data, quoteId],
  );

  const saveMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => {
      if (isEdit && invoice) {
        return apiFetch<InvoiceRecord>(`/api/billing/invoices/${invoice.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      }
      return apiFetch<InvoiceRecord>("/api/billing/invoices", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: (saved) => {
      toast.success(isEdit ? "Invoice updated" : "Invoice created");
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["invoice", saved.id] });
      void queryClient.invalidateQueries({ queryKey: ["billing-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["billing-quotes-convertible"] });
      void queryClient.invalidateQueries({ queryKey: ["quotes"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["billing-invoices-open"] });
      onOpenChange(false);
      onSaved?.(saved);
    },
    onError: (error: Error & { issues?: { path: string; message: string }[] }) => {
      setServerError(error.message || "Could not save the invoice.");
      if (error.issues?.some((issue) => issue.path.startsWith("lines"))) {
        setLineError("One or more line items are invalid — check quantities and amounts.");
      }
    },
  });

  function submit() {
    setServerError(null);
    setClientError(null);
    setLineError(null);

    const body: Record<string, unknown> = {
      issueDate,
      dueDate: dueDate || null,
      notes: notes.trim() || null,
      terms: terms.trim() || null,
    };

    if (isEdit) {
      body.websiteId = websiteId || null;
      body.projectId = projectId || null;
      body.taxInclusive = taxInclusive;
      const linesResult = buildLineInputs(editorLines);
      if (!linesResult.ok) {
        setLineError(linesResult.error);
        return;
      }
      body.lines = linesResult.lines;
      saveMutation.mutate(body);
      return;
    }

    if (isFromQuoteMode || quoteId) {
      if (!quoteId) {
        setServerError("Choose an accepted quote to convert.");
        return;
      }
      body.fromQuoteId = quoteId;
      saveMutation.mutate(body);
      return;
    }

    if (!clientId) {
      setClientError("Client is required.");
      return;
    }
    const linesResult = buildLineInputs(editorLines);
    if (!linesResult.ok) {
      setLineError(linesResult.error);
      return;
    }
    body.clientId = clientId;
    body.websiteId = websiteId || null;
    body.projectId = projectId || null;
    body.taxInclusive = taxInclusive;
    body.lines = linesResult.lines;
    saveMutation.mutate(body);
  }

  const clientLabel = selectedQuote?.client?.businessName;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="space-y-4"
      noValidate
    >
      {serverError ? (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}

      {/* From-quote picker */}
      {!isEdit ? (
        <div className="space-y-1.5">
          <Label htmlFor="invoice-from-quote">
            From an accepted quote <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Select
            value={quoteId || NONE}
            onValueChange={(value) => {
              const next = value === NONE ? "" : value;
              setQuoteId(next);
              setClientError(null);
              const quote = (quotesQuery.data?.items ?? []).find((q) => q.id === next);
              if (quote) {
                setClientId(quote.clientId);
                setWebsiteId(quote.websiteId ?? "");
                setProjectId(quote.projectId ?? "");
                setTaxInclusive(quote.taxInclusive);
                if (quote.terms) setTerms(quote.terms);
              }
            }}
          >
            <SelectTrigger id="invoice-from-quote" className="w-full" aria-label="Convert from accepted quote">
              <SelectValue placeholder="Blank invoice — or convert an accepted quote" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Blank invoice</SelectItem>
              {(quotesQuery.data?.items ?? []).map((quote) => (
                <SelectItem key={quote.id} value={quote.id}>
                  {quote.displayNumber} · {quote.client?.businessName ?? "Client"} ·{" "}
                  {formatCurrency(quote.totalMinor, quote.currency)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Converting copies the quote&apos;s client and line items onto the new draft invoice and
            links the two records.
          </p>
        </div>
      ) : null}

      {/* Linked quote preview */}
      {selectedQuote ? (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <Quote aria-hidden className="size-4 text-primary" />
            {selectedQuote.displayNumber} — {formatCurrency(selectedQuote.totalMinor, selectedQuote.currency)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Issued {selectedQuote.issueDate.slice(0, 10)}
            {selectedQuote.lines?.length
              ? ` · ${selectedQuote.lines.length} line item${selectedQuote.lines.length === 1 ? "" : "s"} will be copied`
              : " · line items will be copied from the quote"}
          </p>
        </div>
      ) : null}

      {/* Client / website / project */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Client</Label>
          {isFromQuoteMode || quoteId ? (
            <Input value={clientLabel ?? "…"} readOnly aria-label="Client (from quote)" />
          ) : (
            <>
              <Select
                value={clientId || NONE}
                onValueChange={(value) => {
                  setClientId(value === NONE ? "" : value);
                  setWebsiteId("");
                  setProjectId("");
                  setClientError(null);
                }}
              >
                <SelectTrigger className="w-full" aria-label="Client">
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {(clients.data ?? []).map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.businessName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {clientError ? <p className="text-xs text-destructive">{clientError}</p> : null}
            </>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Website</Label>
          <Select
            value={websiteId || NONE}
            onValueChange={(value) => setWebsiteId(value === NONE ? "" : value)}
            disabled={Boolean(quoteId) && !isEdit}
          >
            <SelectTrigger className="w-full" aria-label="Website (optional)">
              <SelectValue placeholder="No website" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No website</SelectItem>
              {(websites.data ?? []).map((website) => (
                <SelectItem key={website.id} value={website.id}>
                  {website.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!quoteId && !isEdit ? (
        <div className="space-y-1.5">
          <Label>Project</Label>
          <Select
            value={projectId || NONE}
            onValueChange={(value) => setProjectId(value === NONE ? "" : value)}
          >
            <SelectTrigger className="w-full" aria-label="Project (optional)">
              <SelectValue placeholder="No project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No project</SelectItem>
              {(projects.data ?? []).map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {/* Dates + tax mode */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="invoice-issue-date">Issue date</Label>
          <Input
            id="invoice-issue-date"
            type="date"
            value={issueDate}
            onChange={(event) => setIssueDate(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invoice-due-date">Due date</Label>
          <Input
            id="invoice-due-date"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Default: {settings?.defaultPaymentTermsDays ?? 14} days after issue.
          </p>
        </div>
      </div>

      <label
        htmlFor="invoice-tax-inclusive"
        className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border p-3.5 transition-colors hover:bg-muted/40"
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium">Tax-inclusive prices</span>
          <span className="block text-xs text-muted-foreground">
            Line unit prices already include tax (e.g. £120 at 20% = £100 net + £20 tax).
          </span>
        </span>
        <Switch
          id="invoice-tax-inclusive"
          checked={taxInclusive}
          onCheckedChange={setTaxInclusive}
          disabled={Boolean(quoteId) && !isEdit}
        />
      </label>

      {/* Lines */}
      <div className="space-y-2">
        <Label>Line items</Label>
        {quoteId && !isEdit ? (
          <p className="text-xs text-muted-foreground">
            Line items are copied from the accepted quote when the invoice is created.
          </p>
        ) : (
          <LineEditor
            lines={editorLines}
            onChange={setEditorLines}
            taxInclusive={taxInclusive}
            currency={invoice?.currency ?? "GBP"}
          />
        )}
        {lineError ? <p className="text-xs text-destructive">{lineError}</p> : null}
      </div>

      {/* Notes + terms */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="invoice-notes">Notes (shown on the invoice)</Label>
          <Textarea
            id="invoice-notes"
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="e.g. Thank you for your business."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invoice-terms">Payment terms</Label>
          <Textarea
            id="invoice-terms"
            rows={3}
            value={terms}
            onChange={(event) => setTerms(event.target.value)}
            placeholder="e.g. Payment due within 14 days by bank transfer."
          />
        </div>
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={saveMutation.isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? (
            <Loader2 aria-hidden className="size-4 animate-spin" />
          ) : (
            <FileText aria-hidden />
          )}
          {isEdit ? "Save changes" : "Create draft invoice"}
        </Button>
      </DialogFooter>
    </form>
  );
}

