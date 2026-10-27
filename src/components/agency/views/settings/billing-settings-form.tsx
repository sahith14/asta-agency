"use client";

/**
 * AgencyOS — Settings › Billing tab (Phase 3, task 2-b).
 * Business details shown on printed documents, number prefixes, default tax
 * rate / tax mode, payment terms and default invoice/quote terms & notes.
 * Tax treatment is the owner's responsibility — neutral wording only.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, RotateCcw, Save, Scale } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { apiFetch, type BillingSettingsRecord } from "@/lib/types";
import { bpsToPercentInput, percentInputToBps } from "@/components/agency/views/billing/bits";

const billingSettingsSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(2, "Business name must be at least 2 characters.")
    .max(120, "Business name must be at most 120 characters."),
  businessAddress: z.string().max(500, "Address must be 500 characters or fewer."),
  businessEmail: z.string().max(200).refine(
    (value) => value === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value),
    "Enter a valid email address.",
  ),
  businessPhone: z.string().max(60),
  vatNumber: z.string().max(60),
  invoicePrefix: z
    .string()
    .trim()
    .max(10, "Prefix must be 10 characters or fewer."),
  quotePrefix: z
    .string()
    .trim()
    .max(10, "Prefix must be 10 characters or fewer."),
  paymentRefPrefix: z
    .string()
    .trim()
    .max(10, "Prefix must be 10 characters or fewer."),
  defaultTaxRatePercent: z
    .string()
    .refine((value) => {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100;
    }, "Tax rate must be between 0 and 100."),
  taxInclusiveDefault: z.boolean(),
  defaultPaymentTermsDays: z
    .string()
    .refine((value) => {
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) && parsed >= 0 && parsed <= 365;
    }, "Payment terms must be 0–365 days."),
  defaultQuoteExpiryDays: z
    .string()
    .refine((value) => {
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) && parsed >= 1 && parsed <= 365;
    }, "Quote validity must be 1–365 days."),
  defaultInvoiceTerms: z.string().max(2000),
  defaultQuoteTerms: z.string().max(2000),
  defaultInvoiceNotes: z.string().max(2000),
});

type BillingSettingsValues = z.infer<typeof billingSettingsSchema>;

export function BillingSettingsForm() {
  const settingsQuery = useQuery({
    queryKey: ["billing-settings"],
    queryFn: () => apiFetch<BillingSettingsRecord>("/api/billing/settings"),
    retry: false,
  });

  if (settingsQuery.isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (settingsQuery.isError || !settingsQuery.data) {
    return (
      <EmptyState
        title="Billing settings could not be loaded"
        description={(settingsQuery.error as Error | undefined)?.message ?? "Something went wrong."}
        action={
          <Button variant="outline" onClick={() => settingsQuery.refetch()}>
            <RotateCcw aria-hidden />
            Try again
          </Button>
        }
      />
    );
  }

  return <BillingSettingsFormInner settings={settingsQuery.data} />;
}

function BillingSettingsFormInner({ settings }: { settings: BillingSettingsRecord }) {
  const queryClient = useQueryClient();

  const form = useForm<BillingSettingsValues>({
    resolver: zodResolver(billingSettingsSchema),
    defaultValues: {
      businessName: settings.businessName,
      businessAddress: settings.businessAddress,
      businessEmail: settings.businessEmail,
      businessPhone: settings.businessPhone,
      vatNumber: settings.vatNumber,
      invoicePrefix: settings.invoicePrefix,
      quotePrefix: settings.quotePrefix,
      paymentRefPrefix: settings.paymentRefPrefix,
      defaultTaxRatePercent: bpsToPercentInput(settings.defaultTaxRateBps),
      taxInclusiveDefault: settings.taxInclusiveDefault,
      defaultPaymentTermsDays: String(settings.defaultPaymentTermsDays),
      defaultQuoteExpiryDays: String(settings.defaultQuoteExpiryDays),
      defaultInvoiceTerms: settings.defaultInvoiceTerms,
      defaultQuoteTerms: settings.defaultQuoteTerms,
      defaultInvoiceNotes: settings.defaultInvoiceNotes,
    },
  });

  const saveMutation = useMutation({
    mutationFn: (values: BillingSettingsValues) =>
      apiFetch<BillingSettingsRecord>("/api/billing/settings", {
        method: "PUT",
        body: JSON.stringify({
          businessName: values.businessName.trim(),
          businessAddress: values.businessAddress.trim(),
          businessEmail: values.businessEmail.trim(),
          businessPhone: values.businessPhone.trim(),
          vatNumber: values.vatNumber.trim(),
          invoicePrefix: values.invoicePrefix.trim() || "INV-",
          quotePrefix: values.quotePrefix.trim() || "QT-",
          paymentRefPrefix: values.paymentRefPrefix.trim() || "PAY-",
          defaultTaxRateBps: percentInputToBps(values.defaultTaxRatePercent),
          taxInclusiveDefault: values.taxInclusiveDefault,
          defaultPaymentTermsDays: Math.max(0, Math.trunc(Number.parseInt(values.defaultPaymentTermsDays, 10) || 0)),
          defaultQuoteExpiryDays: Math.max(1, Math.trunc(Number.parseInt(values.defaultQuoteExpiryDays, 10) || 30)),
          defaultInvoiceTerms: values.defaultInvoiceTerms.trim(),
          defaultQuoteTerms: values.defaultQuoteTerms.trim(),
          defaultInvoiceNotes: values.defaultInvoiceNotes.trim(),
        }),
      }),
    onSuccess: () => {
      toast.success("Billing settings saved");
      void queryClient.invalidateQueries({ queryKey: ["billing-settings"] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not save billing settings."),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Billing settings</CardTitle>
          <CardDescription>
            Business details shown on printed invoices and quotes, number prefixes and the
            defaults used by new billing documents.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
            className="space-y-5"
            noValidate
          >
            {/* Business details */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="billing-business-name">Business name</Label>
                <Input
                  id="billing-business-name"
                  aria-invalid={!!form.formState.errors.businessName}
                  {...form.register("businessName")}
                />
                {form.formState.errors.businessName ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.businessName.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="billing-business-address">Business address</Label>
                <Textarea
                  id="billing-business-address"
                  rows={3}
                  {...form.register("businessAddress")}
                  placeholder={"12 High Street\nBristol BS1 1AA"}
                />
                <p className="text-xs text-muted-foreground">
                  Printed at the top of every invoice and quote.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="billing-business-email">Business email</Label>
                <Input
                  id="billing-business-email"
                  type="email"
                  aria-invalid={!!form.formState.errors.businessEmail}
                  {...form.register("businessEmail")}
                />
                {form.formState.errors.businessEmail ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.businessEmail.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="billing-business-phone">Business phone</Label>
                <Input id="billing-business-phone" {...form.register("businessPhone")} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="billing-vat-number">VAT number (optional)</Label>
                <Input
                  id="billing-vat-number"
                  {...form.register("vatNumber")}
                  placeholder="e.g. GB123456789"
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty if not registered — AgencyOS does not assume a VAT status.
                </p>
              </div>
            </div>

            <Separator />

            {/* Numbering */}
            <div className="space-y-1">
              <p className="text-sm font-medium">Document numbering</p>
              <p className="mb-2 text-xs text-muted-foreground">
                Prefixes are combined with a zero-padded number (e.g. INV-0001).
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="billing-invoice-prefix">Invoice prefix</Label>
                  <Input id="billing-invoice-prefix" {...form.register("invoicePrefix")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="billing-quote-prefix">Quote prefix</Label>
                  <Input id="billing-quote-prefix" {...form.register("quotePrefix")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="billing-payment-prefix">Payment prefix</Label>
                  <Input id="billing-payment-prefix" {...form.register("paymentRefPrefix")} />
                </div>
              </div>
            </div>

            <Separator />

            {/* Tax + terms defaults */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="billing-tax-rate">Default tax rate %</Label>
                <Input
                  id="billing-tax-rate"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  aria-invalid={!!form.formState.errors.defaultTaxRatePercent}
                  {...form.register("defaultTaxRatePercent")}
                />
                {form.formState.errors.defaultTaxRatePercent ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.defaultTaxRatePercent.message}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Prefilled on new documents; editable per line item.
                  </p>
                )}
              </div>
              <div className="flex items-end">
                <Controller
                  control={form.control}
                  name="taxInclusiveDefault"
                  render={({ field }) => (
                    <label
                      htmlFor="billing-tax-inclusive-default"
                      className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-lg border p-3.5 transition-colors hover:bg-muted/40"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">Tax-inclusive by default</span>
                        <span className="block text-xs text-muted-foreground">
                          New invoices and quotes treat line prices as including tax.
                        </span>
                      </span>
                      <Switch
                        id="billing-tax-inclusive-default"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </label>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="billing-payment-terms">Payment terms (days)</Label>
                <Input
                  id="billing-payment-terms"
                  type="number"
                  min={0}
                  max={365}
                  aria-invalid={!!form.formState.errors.defaultPaymentTermsDays}
                  {...form.register("defaultPaymentTermsDays")}
                />
                {form.formState.errors.defaultPaymentTermsDays ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.defaultPaymentTermsDays.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="billing-quote-expiry">Quote validity (days)</Label>
                <Input
                  id="billing-quote-expiry"
                  type="number"
                  min={1}
                  max={365}
                  aria-invalid={!!form.formState.errors.defaultQuoteExpiryDays}
                  {...form.register("defaultQuoteExpiryDays")}
                />
                {form.formState.errors.defaultQuoteExpiryDays ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.defaultQuoteExpiryDays.message}
                  </p>
                ) : null}
              </div>
            </div>

            <Separator />

            {/* Default text blocks */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="billing-invoice-terms">Default invoice terms</Label>
                <Textarea
                  id="billing-invoice-terms"
                  rows={3}
                  {...form.register("defaultInvoiceTerms")}
                  placeholder="e.g. Payment due within 14 days by bank transfer."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="billing-quote-terms">Default quote terms</Label>
                <Textarea
                  id="billing-quote-terms"
                  rows={3}
                  {...form.register("defaultQuoteTerms")}
                  placeholder="e.g. Valid for 30 days. 50% deposit on acceptance."
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="billing-invoice-notes">Default invoice notes</Label>
                <Textarea
                  id="billing-invoice-notes"
                  rows={2}
                  {...form.register("defaultInvoiceNotes")}
                  placeholder="e.g. Thank you for your business."
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? (
                  <Loader2 aria-hidden className="size-4 animate-spin" />
                ) : (
                  <Save aria-hidden />
                )}
                Save changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-warning/40 bg-warning/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale aria-hidden className="size-4 text-warning-foreground" />
            A note on tax
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-warning-foreground">
            Tax rates and treatment are your responsibility to configure correctly — figures shown
            are not accounting advice.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
