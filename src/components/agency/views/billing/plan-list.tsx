"use client";

/**
 * AgencyOS — Billing › Plans tab (service plan catalogue).
 *
 * Grid of plan cards with Edit / Deactivate–Activate / Delete actions.
 * Deactivating keeps existing subscriptions running (the copy says so).
 * Deleting is only offered when no subscription references the plan — the
 * server enforces it with a 409 whose message is shown verbatim.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleSlash, Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/agency/shared/confirm-dialog";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { buildQuery } from "@/components/agency/shared/record-list-helpers";
import {
  apiFetch,
  label,
  SERVICE_PLAN_INTERVALS,
  type Paginated,
  type ServicePlanRecord,
} from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import { intervalNoun, majorInputToMinor, minorToMajorInput } from "@/components/agency/views/billing/bits";

export function PlanList() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ServicePlanRecord | null>(null);
  const [toggling, setToggling] = useState<ServicePlanRecord | null>(null);
  const [deleting, setDeleting] = useState<ServicePlanRecord | null>(null);

  const plansQuery = useQuery({
    queryKey: ["billing-plans"],
    queryFn: () =>
      apiFetch<Paginated<ServicePlanRecord>>(`/api/billing/plans${buildQuery({ pageSize: 100 })}`),
  });

  const plans = plansQuery.data?.items ?? [];
  const activeCount = plans.filter((plan) => plan.isActive).length;

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["billing-plans"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  const toggleMutation = useMutation({
    mutationFn: (plan: ServicePlanRecord) =>
      apiFetch<ServicePlanRecord>(`/api/billing/plans/${plan.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !plan.isActive }),
      }),
    onSuccess: (plan) => {
      toast.success(plan.isActive ? "Plan activated" : "Plan deactivated", {
        description: plan.isActive
          ? undefined
          : "Existing subscriptions keep running on their agreed price.",
      });
      invalidate();
      setToggling(null);
    },
    onError: (error: Error) => toast.error(error.message || "Could not update the plan."),
  });

  const deleteMutation = useMutation({
    mutationFn: (plan: ServicePlanRecord) =>
      apiFetch(`/api/billing/plans/${plan.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Plan deleted");
      invalidate();
      setDeleting(null);
    },
    onError: (error: Error) => {
      // e.g. 409 when subscriptions exist — message verbatim.
      toast.error(error.message || "Could not delete the plan.");
      setDeleting(null);
    },
  });

  const busy = toggleMutation.isPending || deleteMutation.isPending;

  return (
    <div className="space-y-4">
      {/* Tab toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {plansQuery.isLoading
            ? "Loading plans…"
            : `${plans.length} ${plans.length === 1 ? "plan" : "plans"} · ${activeCount} active`}
        </p>
        <Button onClick={() => setCreateOpen(true)} className="min-h-9">
          <Plus aria-hidden />
          New plan
        </Button>
      </div>

      {plansQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-6">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="mt-3 h-8 w-24" />
              <Skeleton className="mt-4 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-3/4" />
            </div>
          ))}
        </div>
      ) : plansQuery.isError ? (
        <EmptyState
          icon={RefreshCw}
          title="Plans could not be loaded"
          description={(plansQuery.error as Error)?.message ?? "Something went wrong."}
          action={
            <Button variant="outline" onClick={() => void plansQuery.refetch()}>
              Try again
            </Button>
          }
        />
      ) : plans.length === 0 ? (
        <EmptyState
          icon={RefreshCw}
          title="No service plans yet"
          description="Plans are your recurring service catalogue (e.g. monthly maintenance). They prefill new subscriptions with a price and interval."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden />
              Create your first plan
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{plan.name}</CardTitle>
                  <StatusBadge value={plan.isActive ? "ACTIVE" : "INACTIVE"} />
                </div>
                <CardDescription className="line-clamp-2 min-h-10">
                  {plan.description ?? "No description."}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                <p className="text-2xl font-semibold tabular-nums">
                  {formatCurrency(plan.priceMinor, plan.currency)}
                  <span className="text-sm font-normal text-muted-foreground">
                    {" "}
                    / {intervalNoun(plan.billingInterval)}
                  </span>
                </p>
                {plan.allowanceHours ? (
                  <p className="text-xs text-muted-foreground">
                    Includes {plan.allowanceHours} h/mo
                  </p>
                ) : null}
                {plan.includedServices.length > 0 ? (
                  <ul className="space-y-1">
                    {plan.includedServices.map((service) => (
                      <li key={service} className="flex items-start gap-1.5 text-xs">
                        <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-success" />
                        <span>{service}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {plan.terms ? (
                  <p className="line-clamp-3 text-xs whitespace-pre-wrap text-muted-foreground">
                    {plan.terms}
                  </p>
                ) : null}
                <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3">
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {plan._count?.subscriptions ?? 0}{" "}
                    {(plan._count?.subscriptions ?? 0) === 1 ? "subscription" : "subscriptions"}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={`Edit ${plan.name}`}
                      onClick={() => setEditing(plan)}
                    >
                      <Pencil aria-hidden className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={plan.isActive ? `Deactivate ${plan.name}` : `Activate ${plan.name}`}
                      onClick={() => setToggling(plan)}
                      disabled={busy}
                    >
                      <CircleSlash aria-hidden className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive hover:text-destructive"
                      aria-label={`Delete ${plan.name}`}
                      onClick={() => setDeleting(plan)}
                      disabled={busy || (plan._count?.subscriptions ?? 0) > 0}
                      title={
                        (plan._count?.subscriptions ?? 0) > 0
                          ? "Plans with subscriptions cannot be deleted — deactivate instead."
                          : "Delete plan"
                      }
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / edit dialog */}
      {(createOpen || editing) && (
        <PlanFormDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setCreateOpen(false);
              setEditing(null);
            }
          }}
          plan={editing}
        />
      )}

      {/* Deactivate / activate confirm */}
      <ConfirmDialog
        open={!!toggling}
        onOpenChange={(open) => {
          if (!open) setToggling(null);
        }}
        title={toggling?.isActive ? `Deactivate ${toggling?.name}?` : `Activate ${toggling?.name}?`}
        description={
          toggling?.isActive
            ? "The plan leaves the picker for new subscriptions. Existing subscriptions keep running on their agreed price — nothing is cancelled."
            : "The plan becomes available again when creating subscriptions."
        }
        confirmLabel={toggling?.isActive ? "Deactivate" : "Activate"}
        loading={busy}
        onConfirm={() => {
          if (toggling) toggleMutation.mutate(toggling);
        }}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Delete ${deleting?.name}?`}
        description="This permanently removes the plan from the catalogue. Only plans without subscriptions can be deleted."
        confirmLabel="Delete plan"
        destructive
        loading={busy}
        onConfirm={() => {
          if (deleting) deleteMutation.mutate(deleting);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plan form dialog
// ---------------------------------------------------------------------------

function PlanFormDialog({
  open,
  onOpenChange,
  plan,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: ServicePlanRecord | null;
}) {
  const isEdit = Boolean(plan);
  const queryClient = useQueryClient();

  const [serverError, setServerError] = useState<string | null>(null);
  const [name, setName] = useState(plan?.name ?? "");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [billingInterval, setBillingInterval] = useState(plan?.billingInterval ?? "MONTHLY");
  const [price, setPrice] = useState(minorToMajorInput(plan?.priceMinor ?? 0));
  const [allowanceHours, setAllowanceHours] = useState(
    plan?.allowanceHours ? String(plan.allowanceHours) : "",
  );
  const [servicesText, setServicesText] = useState(
    (plan?.includedServices ?? []).join("\n"),
  );
  const [terms, setTerms] = useState(plan?.terms ?? "");
  const [autoRenew, setAutoRenew] = useState(plan?.autoRenew ?? true);
  const [isActive, setIsActive] = useState(plan?.isActive ?? true);

  const saveMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => {
      if (isEdit && plan) {
        return apiFetch<ServicePlanRecord>(`/api/billing/plans/${plan.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      }
      return apiFetch<ServicePlanRecord>("/api/billing/plans", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      toast.success(isEdit ? "Plan updated" : "Plan created");
      void queryClient.invalidateQueries({ queryKey: ["billing-plans"] });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      setServerError(error.message || "Could not save the plan.");
    },
  });

  function submit() {
    setServerError(null);
    if (!name.trim()) {
      setServerError("Plan name is required.");
      return;
    }
    const priceMinor = majorInputToMinor(price);
    if (priceMinor <= 0) {
      setServerError("Price must be greater than zero.");
      return;
    }
    saveMutation.mutate({
      name: name.trim(),
      description: description.trim() || null,
      billingInterval,
      priceMinor,
      allowanceHours: allowanceHours.trim() ? Math.max(0, Math.trunc(Number.parseFloat(allowanceHours))) : null,
      includedServices: servicesText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      terms: terms.trim() || null,
      autoRenew,
      isActive,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto scrollbar-thin sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${plan?.name}` : "New plan"}</DialogTitle>
          <DialogDescription>
            Plans are the catalogue behind subscriptions. Changing a plan never rewrites existing
            subscriptions — they keep their agreed price.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          className="space-y-4"
          noValidate
        >
          {serverError ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {serverError}
            </p>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="plan-name">Name</Label>
            <Input
              id="plan-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Business Care"
              autoFocus={!isEdit}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="plan-description">Description</Label>
            <Textarea
              id="plan-description"
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What this plan covers."
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="plan-price">Price</Label>
              <Input
                id="plan-price"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Billing interval</Label>
              <Select value={billingInterval} onValueChange={setBillingInterval}>
                <SelectTrigger className="w-full" aria-label="Billing interval">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_PLAN_INTERVALS.map((interval) => (
                    <SelectItem key={interval} value={interval}>
                      {label(interval)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="plan-allowance">Included hours per month (optional)</Label>
            <Input
              id="plan-allowance"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={allowanceHours}
              onChange={(event) => setAllowanceHours(event.target.value)}
              placeholder="e.g. 2"
              className="sm:w-40"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="plan-services">Included services (one per line)</Label>
            <Textarea
              id="plan-services"
              rows={4}
              value={servicesText}
              onChange={(event) => setServicesText(event.target.value)}
              placeholder={"Hosting & CDN\nWeekly backups\nUptime monitoring"}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="plan-terms">Terms (optional)</Label>
            <Textarea
              id="plan-terms"
              rows={2}
              value={terms}
              onChange={(event) => setTerms(event.target.value)}
              placeholder="e.g. Rolling monthly agreement, 30 days notice."
            />
          </div>

          <div className="divide-y rounded-lg border">
            <label
              htmlFor="plan-auto-renew"
              className="flex cursor-pointer items-center justify-between gap-4 p-3.5 transition-colors hover:bg-muted/40"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium">Default auto-renew</span>
                <span className="block text-xs text-muted-foreground">
                  Prefilled when a subscription is created from this plan.
                </span>
              </span>
              <Switch id="plan-auto-renew" checked={autoRenew} onCheckedChange={setAutoRenew} />
            </label>
            <label
              htmlFor="plan-active"
              className="flex cursor-pointer items-center justify-between gap-4 p-3.5 transition-colors hover:bg-muted/40"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium">Active</span>
                <span className="block text-xs text-muted-foreground">
                  Inactive plans are hidden from the subscription picker.
                </span>
              </span>
              <Switch id="plan-active" checked={isActive} onCheckedChange={setIsActive} />
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saveMutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
              {isEdit ? "Save changes" : "Create plan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
