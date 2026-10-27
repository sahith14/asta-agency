"use client";

/**
 * AgencyOS — shared create/edit quote dialog (Phase 3, task 2-b).
 * Create → POST /api/billing/quotes; edit (DRAFT only) → PATCH.
 * Uses the shared LineEditor; the server recomputes authoritative totals.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2 } from "lucide-react";
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
import { apiFetch, type BillingLineRecord, type BillingSettingsRecord, type QuoteRecord } from "@/lib/types";
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

export function QuoteFormDialog({
  open,
  onOpenChange,
  quote,
  lines,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set the dialog edits this DRAFT quote. */
  quote?: QuoteRecord | null;
  /** Lines for edit-mode prefill (from the quote detail payload). */
  lines?: BillingLineRecord[];
  onSaved?: (quote: QuoteRecord) => void;
}) {
  const settings = useBillingSettings();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent className="max-h-[92svh] overflow-y-auto scrollbar-thin sm:max-w-2xl lg:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{quote ? `Edit ${quote.displayNumber}` : "New quote"}</DialogTitle>
            <DialogDescription>
              {quote
                ? "Draft quotes are freely editable. Mark the quote as sent once you have delivered it to the client."
                : "Draft a quote for a client. It becomes a frozen commercial record when the client accepts it."}
            </DialogDescription>
          </DialogHeader>
          {settings.isLoading ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 aria-hidden className="mr-2 size-4 animate-spin" />
              Loading defaults…
            </div>
          ) : (
            <QuoteFormInner
              settings={settings.data ?? null}
              quote={quote ?? null}
              lines={lines ?? []}
              onOpenChange={onOpenChange}
              onSaved={onSaved}
            />
          )}
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function QuoteFormInner({
  settings,
  quote,
  lines,
  onOpenChange,
  onSaved,
}: {
  settings: BillingSettingsRecord | null;
  quote: QuoteRecord | null;
  lines: BillingLineRecord[];
  onOpenChange: (open: boolean) => void;
  onSaved?: (quote: QuoteRecord) => void;
}) {
  const isEdit = Boolean(quote);
  const queryClient = useQueryClient();

  const [serverError, setServerError] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [lineError, setLineError] = useState<string | null>(null);

  const [clientId, setClientId] = useState(quote?.clientId ?? "");
  const [websiteId, setWebsiteId] = useState(quote?.websiteId ?? "");
  const [projectId, setProjectId] = useState(quote?.projectId ?? "");
  const [issueDate, setIssueDate] = useState(
    quote?.issueDate ? quote.issueDate.slice(0, 10) : todayInput(),
  );
  const [expiryDate, setExpiryDate] = useState(
    quote?.expiryDate
      ? quote.expiryDate.slice(0, 10)
      : addDaysInput(settings?.defaultQuoteExpiryDays ?? 30),
  );
  const [taxInclusive, setTaxInclusive] = useState(
    quote ? quote.taxInclusive : (settings?.taxInclusiveDefault ?? false),
  );
  const [scope, setScope] = useState(quote?.scope ?? "");
  const [terms, setTerms] = useState(quote?.terms ?? settings?.defaultQuoteTerms ?? "");
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

  const saveMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => {
      if (isEdit && quote) {
        return apiFetch<QuoteRecord>(`/api/billing/quotes/${quote.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      }
      return apiFetch<QuoteRecord>("/api/billing/quotes", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: (saved) => {
      toast.success(isEdit ? "Quote updated" : "Quote created");
      void queryClient.invalidateQueries({ queryKey: ["quotes"] });
      void queryClient.invalidateQueries({ queryKey: ["quote", saved.id] });
      void queryClient.invalidateQueries({ queryKey: ["billing-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["billing-quotes-convertible"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onOpenChange(false);
      onSaved?.(saved);
    },
    onError: (error: Error) => {
      setServerError(error.message || "Could not save the quote.");
    },
  });

  function submit() {
    setServerError(null);
    setClientError(null);
    setLineError(null);

    if (!clientId) {
      setClientError("Client is required.");
      return;
    }
    const linesResult = buildLineInputs(editorLines);
    if (!linesResult.ok) {
      setLineError(linesResult.error);
      return;
    }

    saveMutation.mutate({
      clientId,
      websiteId: websiteId || null,
      projectId: projectId || null,
      issueDate,
      expiryDate: expiryDate || null,
      taxInclusive,
      scope: scope.trim() || null,
      terms: terms.trim() || null,
      lines: linesResult.lines,
    });
  }

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

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Client</Label>
          {isEdit ? (
            <Input
              value={quote?.client?.businessName ?? "Client"}
              readOnly
              aria-label="Client (fixed)"
            />
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
            disabled={isEdit}
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

      <div className="space-y-1.5">
        <Label>Project</Label>
        <Select
          value={projectId || NONE}
          onValueChange={(value) => setProjectId(value === NONE ? "" : value)}
          disabled={isEdit}
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

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="quote-issue-date">Issue date</Label>
          <Input
            id="quote-issue-date"
            type="date"
            value={issueDate}
            onChange={(event) => setIssueDate(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="quote-expiry-date">Valid until</Label>
          <Input
            id="quote-expiry-date"
            type="date"
            value={expiryDate}
            onChange={(event) => setExpiryDate(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Default: {settings?.defaultQuoteExpiryDays ?? 30} days. Past-expiry sent quotes are
            expired automatically by the billing tasks.
          </p>
        </div>
      </div>

      <label
        htmlFor="quote-tax-inclusive"
        className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border p-3.5 transition-colors hover:bg-muted/40"
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium">Tax-inclusive prices</span>
          <span className="block text-xs text-muted-foreground">
            Line unit prices already include tax.
          </span>
        </span>
        <Switch
          id="quote-tax-inclusive"
          checked={taxInclusive}
          onCheckedChange={setTaxInclusive}
          disabled={isEdit}
        />
      </label>

      <div className="space-y-2">
        <Label>Line items</Label>
        <LineEditor
          lines={editorLines}
          onChange={setEditorLines}
          taxInclusive={taxInclusive}
          currency={quote?.currency ?? "GBP"}
        />
        {lineError ? <p className="text-xs text-destructive">{lineError}</p> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="quote-scope">Scope of work</Label>
          <Textarea
            id="quote-scope"
            rows={4}
            value={scope}
            onChange={(event) => setScope(event.target.value)}
            placeholder="What is included — deliverables, pages, milestones…"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="quote-terms">Terms</Label>
          <Textarea
            id="quote-terms"
            rows={4}
            value={terms}
            onChange={(event) => setTerms(event.target.value)}
            placeholder="Validity, payment schedule, revisions policy…"
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
          {isEdit ? "Save changes" : "Create draft quote"}
        </Button>
      </DialogFooter>
    </form>
  );
}
