"use client";

/**
 * AgencyOS — shared create/edit subscription dialog (Phase 3, task 2-b).
 * Create → POST /api/billing/subscriptions; edit → PATCH (the server logs
 * plan/price changes as subscription events).
 *
 * Choosing a plan prefills price / interval (locked until "Custom price" is
 * toggled). nextRenewalDate auto-hints from startDate + interval but stays
 * editable.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Loader2, RefreshCw } from "lucide-react";
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
  label,
  SERVICE_PLAN_INTERVALS,
  type Paginated,
  type ServicePlanRecord,
  type SubscriptionRecord,
} from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import { addBillingPeriod } from "@/lib/money";
import { useClientsLookup, useWebsitesLookup } from "@/components/agency/views/tasks/lookups";
import {
  bpsToPercentInput,
  majorInputToMinor,
  minorToMajorInput,
  percentInputToBps,
} from "@/components/agency/views/billing/bits";

const NONE = "none";

export function SubscriptionFormDialog({
  open,
  onOpenChange,
  subscription,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set the dialog edits this subscription. */
  subscription?: SubscriptionRecord | null;
  onSaved?: (subscription: SubscriptionRecord) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent className="max-h-[92svh] overflow-y-auto scrollbar-thin sm:max-w-xl lg:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {subscription ? `Edit subscription` : "New subscription"}
            </DialogTitle>
            <DialogDescription>
              {subscription
                ? "Commercial changes (plan, price, interval) are logged as events on the subscription — historical invoices are untouched."
                : "Set up a recurring agreement. Renewal invoices are generated automatically when auto-invoicing is on."}
            </DialogDescription>
          </DialogHeader>
          <SubscriptionFormInner
            subscription={subscription ?? null}
            onOpenChange={onOpenChange}
            onSaved={onSaved}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function SubscriptionFormInner({
  subscription,
  onOpenChange,
  onSaved,
}: {
  subscription: SubscriptionRecord | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: (subscription: SubscriptionRecord) => void;
}) {
  const isEdit = Boolean(subscription);
  const queryClient = useQueryClient();
  const clients = useClientsLookup();

  const [serverError, setServerError] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);

  const plansQuery = useQuery({
    queryKey: ["billing-plans"],
    queryFn: () =>
      apiFetch<Paginated<ServicePlanRecord>>(`/api/billing/plans${buildQuery({ pageSize: 100 })}`),
    staleTime: 60_000,
  });
  const plans = plansQuery.data?.items ?? [];

  const [clientId, setClientId] = useState(subscription?.clientId ?? "");
  const [websiteId, setWebsiteId] = useState(subscription?.websiteId ?? "");
  const [planId, setPlanId] = useState(subscription?.planId ?? "");
  const [customPrice, setCustomPrice] = useState(
    isEdit ? !subscription?.planId : false,
  );
  const [agreedPrice, setAgreedPrice] = useState(
    minorToMajorInput(subscription?.agreedPriceMinor ?? 0),
  );
  const [interval, setInterval] = useState(subscription?.billingInterval ?? "MONTHLY");
  const [startDate, setStartDate] = useState(
    subscription ? subscription.startDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
  );
  const [nextRenewalDate, setNextRenewalDate] = useState(
    subscription?.nextRenewalDate ? subscription.nextRenewalDate.slice(0, 10) : "",
  );
  const [taxRatePercent, setTaxRatePercent] = useState(
    bpsToPercentInput(subscription?.taxRateBps ?? 0),
  );
  const [autoInvoice, setAutoInvoice] = useState(subscription?.autoInvoice ?? true);
  const [autoRenew, setAutoRenew] = useState(subscription?.autoRenew ?? true);
  const [internalNotes, setInternalNotes] = useState(subscription?.internalNotes ?? "");

  const websites = useWebsitesLookup(clientId);

  const selectedPlan = plans.find((plan) => plan.id === planId) ?? null;

  /** Plan selected (and not custom) → price + interval locked to the plan. */
  const priceLocked = Boolean(selectedPlan) && !customPrice;

  function applyPlan(id: string) {
    setPlanId(id === NONE ? "" : id);
    const plan = plans.find((p) => p.id === id);
    if (plan) {
      setAgreedPrice(minorToMajorInput(plan.priceMinor));
      setInterval(plan.billingInterval);
      setCustomPrice(false);
    }
  }

  /** Auto-hint next renewal = startDate + interval (still editable). */
  function bumpRenewalHint(nextStart: string, nextInterval: string) {
    if (!nextStart) return;
    const start = new Date(`${nextStart}T00:00:00`);
    if (Number.isNaN(start.getTime())) return;
    const next = addBillingPeriod(start, nextInterval);
    const pad = (n: number) => String(n).padStart(2, "0");
    setNextRenewalDate(
      `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`,
    );
  }

  const saveMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => {
      if (isEdit && subscription) {
        return apiFetch<SubscriptionRecord>(`/api/billing/subscriptions/${subscription.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      }
      return apiFetch<SubscriptionRecord>("/api/billing/subscriptions", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: (saved) => {
      toast.success(isEdit ? "Subscription updated" : "Subscription created");
      void queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      void queryClient.invalidateQueries({ queryKey: ["subscription", saved.id] });
      void queryClient.invalidateQueries({ queryKey: ["billing-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onOpenChange(false);
      onSaved?.(saved);
    },
    onError: (error: Error) => {
      setServerError(error.message || "Could not save the subscription.");
    },
  });

  function submit() {
    setServerError(null);
    setClientError(null);
    setPriceError(null);

    if (!isEdit && !clientId) {
      setClientError("Client is required.");
      return;
    }
    const priceMinor = majorInputToMinor(agreedPrice);
    if (priceMinor <= 0) {
      setPriceError("Agreed price must be greater than zero.");
      return;
    }

    const body: Record<string, unknown> = {
      agreedPriceMinor: priceMinor,
      billingInterval: interval,
      taxRateBps: percentInputToBps(taxRatePercent),
      nextRenewalDate: nextRenewalDate || null,
      internalNotes: internalNotes.trim() || null,
    };

    if (isEdit) {
      body.websiteId = websiteId || null;
      body.planId = planId || null;
      body.autoInvoice = autoInvoice;
      body.autoRenew = autoRenew;
    } else {
      body.clientId = clientId;
      body.websiteId = websiteId || null;
      body.planId = planId || null;
      body.planName = selectedPlan?.name ?? null;
      body.currency = selectedPlan?.currency ?? "GBP";
      body.startDate = startDate;
      body.autoInvoice = autoInvoice;
      body.autoRenew = autoRenew;
    }
    saveMutation.mutate(body);
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
              value={subscription?.client?.businessName ?? "Client"}
              readOnly
              aria-label="Client (fixed)"
            />
          ) : (
            <>
              <Select
                value={clientId || NONE}
                onValueChange={(value) => {
                  setClientId(value === NONE ? "" : value);
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

      {/* Plan */}
      <div className="space-y-1.5">
        <Label>Plan</Label>
        <Select
          value={planId || NONE}
          onValueChange={applyPlan}
          disabled={plansQuery.isLoading}
        >
          <SelectTrigger className="w-full" aria-label="Plan (optional)">
            <SelectValue placeholder={plansQuery.isLoading ? "Loading plans…" : "No plan — custom agreement"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No plan — custom agreement</SelectItem>
            {plans.map((plan) => (
              <SelectItem key={plan.id} value={plan.id}>
                {plan.name} · {formatCurrency(plan.priceMinor, plan.currency)} /{" "}
                {label(plan.billingInterval).toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          The agreed price is stored on the subscription — later plan catalogue changes never
          rewrite existing subscriptions.
        </p>
      </div>

      {/* Price / interval */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="subscription-price">Agreed price</Label>
          <Input
            id="subscription-price"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={priceLocked && selectedPlan ? minorToMajorInput(selectedPlan.priceMinor) : agreedPrice}
            onChange={(event) => setAgreedPrice(event.target.value)}
            disabled={priceLocked}
            aria-label="Agreed price per billing period"
          />
          {priceError ? <p className="text-xs text-destructive">{priceError}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label>Billing interval</Label>
          <Select
            value={interval}
            onValueChange={(value) => {
              setInterval(value);
              if (!isEdit) bumpRenewalHint(startDate, value);
            }}
            disabled={priceLocked}
          >
            <SelectTrigger className="w-full" aria-label="Billing interval">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SERVICE_PLAN_INTERVALS.map((item) => (
                <SelectItem key={item} value={item}>
                  {label(item)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!isEdit ? (
        <label
          htmlFor="subscription-custom-price"
          className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border p-3.5 transition-colors hover:bg-muted/40"
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium">Custom price</span>
            <span className="block text-xs text-muted-foreground">
              Override the plan price and interval for this agreement.
            </span>
          </span>
          <Switch
            id="subscription-custom-price"
            checked={customPrice}
            onCheckedChange={(checked) => {
              setCustomPrice(checked);
              if (checked && selectedPlan) {
                // keep the plan price as the starting point for editing
                setAgreedPrice(minorToMajorInput(selectedPlan.priceMinor));
              }
            }}
            disabled={!selectedPlan}
          />
        </label>
      ) : null}

      {/* Dates */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="subscription-start">Start date</Label>
          <Input
            id="subscription-start"
            type="date"
            value={startDate}
            disabled={isEdit}
            onChange={(event) => {
              setStartDate(event.target.value);
              if (!isEdit) bumpRenewalHint(event.target.value, interval);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="subscription-renewal">Next renewal</Label>
          <Input
            id="subscription-renewal"
            type="date"
            value={nextRenewalDate}
            onChange={(event) => setNextRenewalDate(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Auto-hinted as start date + one interval — still editable.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="subscription-tax">Tax rate %</Label>
        <Input
          id="subscription-tax"
          type="number"
          min={0}
          max={100}
          step="0.01"
          inputMode="decimal"
          value={taxRatePercent}
          onChange={(event) => setTaxRatePercent(event.target.value)}
          className="sm:w-40"
          aria-label="Tax rate percent applied to renewal invoices"
        />
      </div>

      {/* Switches */}
      <div className="divide-y rounded-lg border">
        <label
          htmlFor="subscription-auto-invoice"
          className="flex cursor-pointer items-center justify-between gap-4 p-3.5 transition-colors hover:bg-muted/40"
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium">Auto-invoice renewals</span>
            <span className="block text-xs text-muted-foreground">
              A renewal invoice is created automatically when the renewal date arrives.
            </span>
          </span>
          <Switch
            id="subscription-auto-invoice"
            checked={autoInvoice}
            onCheckedChange={setAutoInvoice}
          />
        </label>
        <label
          htmlFor="subscription-auto-renew"
          className="flex cursor-pointer items-center justify-between gap-4 p-3.5 transition-colors hover:bg-muted/40"
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium">Auto-renew</span>
            <span className="block text-xs text-muted-foreground">
              The agreement rolls into the next period after each renewal.
            </span>
          </span>
          <Switch id="subscription-auto-renew" checked={autoRenew} onCheckedChange={setAutoRenew} />
        </label>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="subscription-notes">Internal notes</Label>
        <Textarea
          id="subscription-notes"
          rows={3}
          value={internalNotes}
          onChange={(event) => setInternalNotes(event.target.value)}
          placeholder="Only visible to your team — e.g. agreed on a call, 3 months discount."
        />
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
          ) : isEdit ? (
            <CalendarClock aria-hidden />
          ) : (
            <RefreshCw aria-hidden />
          )}
          {isEdit ? "Save changes" : "Create subscription"}
        </Button>
      </DialogFooter>
    </form>
  );
}
