"use client";

/**
 * AgencyOS — client create/edit dialog (react-hook-form + zod).
 *
 * Server contract (Task 2-a):
 * - 409 CONFLICT on duplicate businessName/email → ConfirmDialog shows the
 *   server's error.message with a "create/save anyway" action that retries
 *   the exact same request with `?force=1`.
 * - Validation issues arrive as `error.issues` ({path, message}[]) → mapped
 *   onto form fields; any other server error.message → toast + inline Alert.
 */
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm, Controller, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { AlertCircle, Loader2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, CLIENT_STATUSES, CLIENT_TYPES, label, type ClientRecord } from "@/lib/types";
import { ConfirmDialog } from "@/components/agency/shared/confirm-dialog";

const CURRENCIES = ["GBP", "EUR", "USD"] as const;

const emailField = z
  .string()
  .trim()
  .max(320, "Email must be 320 characters or fewer.")
  .refine((v) => v === "" || z.email().safeParse(v).success, "Please enter a valid email address.");

export const clientFormSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(2, "Business name must be at least 2 characters.")
    .max(160, "Business name must be 160 characters or fewer."),
  clientType: z.enum(CLIENT_TYPES),
  status: z.enum(CLIENT_STATUSES),
  primaryContactName: z.string().trim().max(160, "Contact name must be 160 characters or fewer."),
  email: emailField,
  phone: z.string().trim().max(60, "Phone must be 60 characters or fewer."),
  billingAddress: z.string().trim().max(2000, "Address must be 2000 characters or fewer."),
  country: z.string().trim().min(1, "Country is required."),
  currency: z.enum(CURRENCIES),
  timezone: z.string().trim().min(1, "Timezone is required."),
  notes: z.string().trim().max(20000, "Notes must be 20000 characters or fewer."),
});

type ClientFormValues = z.infer<typeof clientFormSchema>;

function toFormValues(client?: ClientRecord | null): ClientFormValues {
  return {
    businessName: client?.businessName ?? "",
    clientType: (client?.clientType as ClientFormValues["clientType"]) ?? "OTHER",
    status: (client?.status as ClientFormValues["status"]) ?? "PROSPECT",
    primaryContactName: client?.primaryContactName ?? "",
    email: client?.email ?? "",
    phone: client?.phone ?? "",
    billingAddress: client?.billingAddress ?? "",
    country: client?.country ?? "United Kingdom",
    currency: (client?.currency as ClientFormValues["currency"]) ?? "GBP",
    timezone: client?.timezone ?? "Europe/London",
    notes: client?.notes ?? "",
  };
}

function payloadOf(values: ClientFormValues): Record<string, unknown> {
  return {
    businessName: values.businessName.trim(),
    clientType: values.clientType,
    status: values.status,
    primaryContactName: values.primaryContactName.trim() || null,
    email: values.email.trim() || null,
    phone: values.phone.trim() || null,
    billingAddress: values.billingAddress.trim() || null,
    country: values.country.trim(),
    currency: values.currency,
    timezone: values.timezone.trim(),
    notes: values.notes.trim() || null,
  };
}

export function ClientFormDialog({
  open,
  onOpenChange,
  client,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present → edit mode (PATCH); absent → create mode (POST). */
  client?: ClientRecord | null;
}) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [forceBusy, setForceBusy] = useState(false);
  const lastPayloadRef = useRef<Record<string, unknown> | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: toFormValues(client),
  });

  async function submitPayload(rawPayload: Record<string, unknown>, force: boolean): Promise<boolean> {
    const forceQuery = force ? "?force=1" : "";
    const path = client
      ? `/api/clients/${client.id}${forceQuery}`
      : `/api/clients${forceQuery}`;
    try {
      await apiFetch<ClientRecord>(path, {
        method: client ? "PATCH" : "POST",
        body: JSON.stringify(rawPayload),
      });
      toast.success(client ? "Client updated" : "Client created");
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
      void queryClient.invalidateQueries({ queryKey: ["client"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["activity"] });
      onOpenChange(false);
      return true;
    } catch (err) {
      const e = err as Error & {
        code?: string;
        issues?: { path: string; message: string }[];
      };
      if (e.code === "CONFLICT") {
        // Duplicate — surfaced via the confirm dialog, not a toast.
        setConflictMessage(e.message);
        return false;
      }
      setServerError(e.message);
      for (const issue of e.issues ?? []) {
        setError(issue.path as FieldPath<ClientFormValues>, {
          type: "server",
          message: issue.message,
        });
      }
      toast.error(e.message);
      return false;
    }
  }

  async function onSubmit(values: ClientFormValues) {
    setServerError(null);
    const payload = payloadOf(values);
    lastPayloadRef.current = payload;
    await submitPayload(payload, false);
  }

  async function onForceConfirm() {
    setForceBusy(true);
    try {
      if (lastPayloadRef.current) {
        await submitPayload(lastPayloadRef.current, true);
      }
    } finally {
      setForceBusy(false);
      setConflictMessage(null);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[calc(100svh-4rem)] overflow-y-auto scrollbar-thin sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{client ? "Edit client" : "New client"}</DialogTitle>
            <DialogDescription>
              {client
                ? "Update the client record. Changes are logged to the activity trail."
                : "Add a business you work with. You can add contacts afterwards."}
            </DialogDescription>
          </DialogHeader>

          {serverError ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          ) : null}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="client-business-name">Business name</Label>
              <Input
                id="client-business-name"
                placeholder="e.g. The Corner Bakery"
                autoFocus
                aria-invalid={!!errors.businessName}
                {...register("businessName")}
              />
              {errors.businessName ? (
                <p className="text-xs text-destructive">{errors.businessName.message}</p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="client-type">Client type</Label>
                <Controller
                  control={control}
                  name="clientType"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="client-type" className="w-full" aria-invalid={!!errors.clientType}>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {CLIENT_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {label(t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.clientType ? (
                  <p className="text-xs text-destructive">{errors.clientType.message}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-status">Status</Label>
                <Controller
                  control={control}
                  name="status"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="client-status" className="w-full" aria-invalid={!!errors.status}>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        {CLIENT_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {label(s)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.status ? (
                  <p className="text-xs text-destructive">{errors.status.message}</p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="client-contact-name">Primary contact name</Label>
                <Input
                  id="client-contact-name"
                  placeholder="Optional"
                  aria-invalid={!!errors.primaryContactName}
                  {...register("primaryContactName")}
                />
                {errors.primaryContactName ? (
                  <p className="text-xs text-destructive">{errors.primaryContactName.message}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-email">Email</Label>
                <Input
                  id="client-email"
                  type="email"
                  placeholder="Optional"
                  aria-invalid={!!errors.email}
                  {...register("email")}
                />
                {errors.email ? (
                  <p className="text-xs text-destructive">{errors.email.message}</p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="client-phone">Phone</Label>
                <Input
                  id="client-phone"
                  type="tel"
                  placeholder="Optional"
                  aria-invalid={!!errors.phone}
                  {...register("phone")}
                />
                {errors.phone ? (
                  <p className="text-xs text-destructive">{errors.phone.message}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-currency">Currency</Label>
                <Controller
                  control={control}
                  name="currency"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="client-currency" className="w-full">
                        <SelectValue placeholder="Select currency" />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="client-country">Country</Label>
                <Input
                  id="client-country"
                  aria-invalid={!!errors.country}
                  {...register("country")}
                />
                {errors.country ? (
                  <p className="text-xs text-destructive">{errors.country.message}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-timezone">Timezone</Label>
                <Input
                  id="client-timezone"
                  aria-invalid={!!errors.timezone}
                  {...register("timezone")}
                />
                {errors.timezone ? (
                  <p className="text-xs text-destructive">{errors.timezone.message}</p>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="client-address">Billing address</Label>
              <Textarea
                id="client-address"
                rows={2}
                placeholder="Optional"
                aria-invalid={!!errors.billingAddress}
                {...register("billingAddress")}
              />
              {errors.billingAddress ? (
                <p className="text-xs text-destructive">{errors.billingAddress.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="client-notes">Notes</Label>
              <Textarea
                id="client-notes"
                rows={3}
                placeholder="Internal notes (optional)"
                aria-invalid={!!errors.notes}
                {...register("notes")}
              />
              {errors.notes ? (
                <p className="text-xs text-destructive">{errors.notes.message}</p>
              ) : null}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
                {client ? "Save changes" : "Create client"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 409 duplicate warning — retry the identical request with ?force=1 */}
      <ConfirmDialog
        open={!!conflictMessage}
        onOpenChange={(o) => {
          if (!o) setConflictMessage(null);
        }}
        title="Possible duplicate"
        description={conflictMessage ?? ""}
        confirmLabel={client ? "Save anyway" : "Create anyway"}
        loading={forceBusy}
        onConfirm={() => void onForceConfirm()}
      />
    </>
  );
}
