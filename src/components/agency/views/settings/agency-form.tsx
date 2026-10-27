"use client";

/**
 * AgencyOS — Settings › Agency tab (task 4-c).
 * Agency details + default currency/timezone + notification preferences.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, RotateCcw, Save } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { apiFetch, type SettingsData } from "@/lib/types";

const CURRENCIES = ["GBP", "EUR", "USD"] as const;
const TIMEZONES = ["Europe/London", "Europe/Dublin", "Europe/Paris", "UTC"] as const;

const agencySchema = z.object({
  agencyName: z
    .string()
    .trim()
    .min(2, "Agency name must be 2-80 characters.")
    .max(80, "Agency name must be 2-80 characters."),
  defaultCurrency: z.enum(CURRENCIES),
  timezone: z.enum(TIMEZONES),
  notifyRenewals: z.boolean(),
  notifyOverdueTasks: z.boolean(),
  notifyNewEnquiries: z.boolean(),
});

type AgencyFormValues = z.infer<typeof agencySchema>;

export function AgencyForm() {
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiFetch<SettingsData>("/api/settings"),
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
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (settingsQuery.isError || !settingsQuery.data) {
    return (
      <EmptyState
        title="Settings could not be loaded"
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

  return <AgencyFormInner settings={settingsQuery.data} />;
}

function AgencyFormInner({ settings }: { settings: SettingsData }) {
  const queryClient = useQueryClient();

  const form = useForm<AgencyFormValues>({
    resolver: zodResolver(agencySchema),
    defaultValues: {
      agencyName: settings.agencyName,
      defaultCurrency: (CURRENCIES as readonly string[]).includes(settings.defaultCurrency)
        ? (settings.defaultCurrency as AgencyFormValues["defaultCurrency"])
        : "GBP",
      timezone: (TIMEZONES as readonly string[]).includes(settings.timezone)
        ? (settings.timezone as AgencyFormValues["timezone"])
        : "Europe/London",
      notifyRenewals: settings.notifyRenewals,
      notifyOverdueTasks: settings.notifyOverdueTasks,
      notifyNewEnquiries: settings.notifyNewEnquiries,
    },
  });

  const saveMutation = useMutation({
    mutationFn: (values: AgencyFormValues) =>
      apiFetch<SettingsData>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({
          ...values,
          agencyName: values.agencyName.trim(),
        }),
      }),
    onSuccess: (data) => {
      toast.success("Settings saved");
      queryClient.setQueryData(["settings"], data);
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not save settings."),
  });

  const switches: { name: keyof AgencyFormValues; title: string; description: string }[] = [
    {
      name: "notifyRenewals",
      title: "Renewal reminders",
      description: "Flag upcoming domain renewals and SSL expiries in dashboard notifications.",
    },
    {
      name: "notifyOverdueTasks",
      title: "Overdue task alerts",
      description: "Surface overdue tasks in the dashboard priority queue and notification bell.",
    },
    {
      name: "notifyNewEnquiries",
      title: "New enquiry alerts",
      description: "Highlight newly created prospect clients so enquiries are not missed.",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agency details</CardTitle>
        <CardDescription>
          How AgencyOS labels your agency and the defaults it uses for new records.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
          className="space-y-5"
          noValidate
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="settings-agency-name">Agency name</Label>
              <Input
                id="settings-agency-name"
                aria-invalid={!!form.formState.errors.agencyName}
                {...form.register("agencyName")}
              />
              {form.formState.errors.agencyName ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.agencyName.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label>Default currency</Label>
              <Controller
                control={form.control}
                name="defaultCurrency"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full" aria-label="Default currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((currency) => (
                        <SelectItem key={currency} value={currency}>
                          {currency}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-xs text-muted-foreground">
                Used for new client records (existing records keep their own currency).
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Timezone</Label>
              <Controller
                control={form.control}
                name="timezone"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full" aria-label="Timezone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((timezone) => (
                        <SelectItem key={timezone} value={timezone}>
                          {timezone}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-xs text-muted-foreground">
                Reference timezone for due dates and renewal reminders.
              </p>
            </div>
          </div>

          <Separator />

          <div className="space-y-1">
            <p className="text-sm font-medium">Notification preferences</p>
            <p className="mb-2 text-xs text-muted-foreground">
              Controls what appears in in-app notifications (Phase 1 has no email sending).
            </p>
            <div className="divide-y rounded-lg border">
              {switches.map((item) => (
                <Controller
                  key={item.name}
                  control={form.control}
                  name={item.name}
                  render={({ field }) => (
                    <label
                      htmlFor={`settings-${item.name}`}
                      className="flex cursor-pointer items-center justify-between gap-4 p-3.5 transition-colors hover:bg-muted/40"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{item.title}</span>
                        <span className="block text-xs text-muted-foreground">{item.description}</span>
                      </span>
                      <Switch
                        id={`settings-${item.name}`}
                        checked={field.value as boolean}
                        onCheckedChange={field.onChange}
                      />
                    </label>
                  )}
                />
              ))}
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
  );
}
