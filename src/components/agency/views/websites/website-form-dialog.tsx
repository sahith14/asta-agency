"use client";

/**
 * AgencyOS — Website create/edit dialog (used by the Websites list, the
 * website detail header and the Technical tab's "Edit technical details").
 * Create → POST /api/websites; edit → PATCH /api/websites/{id} (the API's
 * PATCH treats every present key as authoritative, so we send the full form).
 */
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  apiFetch,
  label,
  MAINTENANCE_COVERAGES,
  WEBSITE_ENVIRONMENTS,
  WEBSITE_LIFECYCLE,
  WEBSITE_TYPES,
  type ClientRecord,
  type WebsiteRecord,
} from "@/lib/types";

const UNSET = "__unset";

const websiteFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  clientId: z.string().min(1, "Client is required."),
  primaryDomain: z.string(),
  lifecycleStatus: z.string(),
  environment: z.string(),
  websiteType: z.string(),
  framework: z.string(),
  repositoryUrl: z
    .string()
    .refine(
      (v) => v.trim() === "" || /^https:\/\//i.test(v.trim()),
      "Repository URL must start with https:// (or be left empty)."
    ),
  hostingProvider: z.string(),
  productionUrl: z.string(),
  stagingUrl: z.string(),
  deploymentProjectRef: z.string(),
  domainRenewalDate: z.string(),
  sslExpiryDate: z.string(),
  launchDate: z.string(),
  maintenanceCoverage: z.string(),
  technicalNotes: z.string(),
});

type WebsiteFormValues = z.infer<typeof websiteFormSchema>;
export type { WebsiteFormValues };

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function emptyValues(seedClientId?: string): WebsiteFormValues {
  return {
    name: "",
    clientId: seedClientId ?? "",
    primaryDomain: "",
    lifecycleStatus: "PLANNED",
    environment: "PRODUCTION",
    websiteType: "",
    framework: "",
    repositoryUrl: "",
    hostingProvider: "",
    productionUrl: "",
    stagingUrl: "",
    deploymentProjectRef: "",
    domainRenewalDate: "",
    sslExpiryDate: "",
    launchDate: "",
    maintenanceCoverage: "NONE",
    technicalNotes: "",
  };
}

function valuesFromWebsite(w: WebsiteRecord): WebsiteFormValues {
  return {
    name: w.name,
    clientId: w.clientId,
    primaryDomain: w.primaryDomain ?? "",
    lifecycleStatus: w.lifecycleStatus,
    environment: w.environment,
    websiteType: w.websiteType ?? "",
    framework: w.framework ?? "",
    repositoryUrl: w.repositoryUrl ?? "",
    hostingProvider: w.hostingProvider ?? "",
    productionUrl: w.productionUrl ?? "",
    stagingUrl: w.stagingUrl ?? "",
    deploymentProjectRef: w.deploymentProjectRef ?? "",
    domainRenewalDate: toDateInput(w.domainRenewalDate),
    sslExpiryDate: toDateInput(w.sslExpiryDate),
    launchDate: toDateInput(w.launchDate),
    maintenanceCoverage: w.maintenanceCoverage,
    technicalNotes: w.technicalNotes ?? "",
  };
}

/** "" → null so the server clears optional fields (its documented semantics). */
function buildPayload(values: WebsiteFormValues) {
  return {
    name: values.name.trim(),
    clientId: values.clientId,
    primaryDomain: values.primaryDomain.trim() || null,
    lifecycleStatus: values.lifecycleStatus,
    environment: values.environment,
    websiteType: values.websiteType || null,
    framework: values.framework.trim() || null,
    repositoryUrl: values.repositoryUrl.trim() || null,
    hostingProvider: values.hostingProvider.trim() || null,
    productionUrl: values.productionUrl.trim() || null,
    stagingUrl: values.stagingUrl.trim() || null,
    deploymentProjectRef: values.deploymentProjectRef.trim() || null,
    domainRenewalDate: values.domainRenewalDate || null,
    sslExpiryDate: values.sslExpiryDate || null,
    launchDate: values.launchDate || null,
    maintenanceCoverage: values.maintenanceCoverage,
    technicalNotes: values.technicalNotes.trim() || null,
  };
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

export function WebsiteFormDialog({
  open,
  onOpenChange,
  website,
  clients,
  clientsLoading,
  seedClientId,
  initialFocusField,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  website?: WebsiteRecord | null;
  clients: ClientRecord[];
  clientsLoading?: boolean;
  /** Pre-selected client when opened via the params.create convention. */
  seedClientId?: string;
  /** Field to focus when the dialog opens (e.g. from the Technical tab). */
  initialFocusField?: keyof WebsiteFormValues;
  onSaved?: () => void;
}) {
  const isEdit = Boolean(website);
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<WebsiteFormValues>({
    resolver: zodResolver(websiteFormSchema),
    defaultValues: website ? valuesFromWebsite(website) : emptyValues(),
  });
  const { register, handleSubmit, control, reset, setFocus, formState } = form;
  const { errors } = formState;

  // Re-seed the form every time the dialog opens (create vs edit vs retarget).
  useEffect(() => {
    if (!open) return;
    reset(website ? valuesFromWebsite(website) : emptyValues(seedClientId));
    if (initialFocusField) {
      const timer = setTimeout(() => {
        setFocus(initialFocusField, { shouldSelect: true });
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [open, website, seedClientId, initialFocusField, reset, setFocus]);

  async function onSubmit(values: WebsiteFormValues) {
    setServerError(null);
    try {
      const body = JSON.stringify(buildPayload(values));
      if (isEdit && website) {
        await apiFetch<WebsiteRecord>(`/api/websites/${website.id}`, {
          method: "PATCH",
          body,
        });
      } else {
        await apiFetch<WebsiteRecord>("/api/websites", { method: "POST", body });
      }
      await queryClient.invalidateQueries({ queryKey: ["websites"] });
      if (isEdit && website) {
        await queryClient.invalidateQueries({ queryKey: ["website", website.id] });
      }
      await queryClient.invalidateQueries({ queryKey: ["client", values.clientId] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(isEdit ? "Website updated." : "Website created.");
      onOpenChange(false);
      onSaved?.();
    } catch (error) {
      const err = error as Error & { code?: string };
      // 409 duplicate domain / 400 validation — surface the server's copy.
      toast.error(err.message);
      setServerError(err.message);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setServerError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto scrollbar-thin sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit website" : "New website"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the website record. Clearing a field clears it on the server too."
              : "Add a client website. Only name and client are required."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {serverError ? (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="website-name">Name</Label>
              <Input
                id="website-name"
                placeholder="e.g. Rose & Crown website"
                aria-invalid={!!errors.name}
                {...register("name")}
              />
              <FieldError message={errors.name?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="website-client">Client</Label>
              <Controller
                control={control}
                name="clientId"
                render={({ field }) => (
                  <Select
                    value={field.value || undefined}
                    onValueChange={field.onChange}
                    disabled={isEdit}
                  >
                    <SelectTrigger id="website-client" aria-invalid={!!errors.clientId}>
                      <SelectValue
                        placeholder={clientsLoading ? "Loading clients…" : "Select a client"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.length === 0 ? (
                        <p className="px-3 py-2 text-sm text-muted-foreground">
                          No clients found. Create a client first.
                        </p>
                      ) : (
                        clients.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.businessName}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError message={errors.clientId?.message} />
              {isEdit ? (
                <p className="text-xs text-muted-foreground">
                  Client cannot be changed after creation.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="website-domain">Primary domain</Label>
              <Input
                id="website-domain"
                placeholder="e.g. example.co.uk"
                {...register("primaryDomain")}
              />
            </div>

            <div className="space-y-2">
              <Label>Lifecycle status</Label>
              <Controller
                control={control}
                name="lifecycleStatus"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEBSITE_LIFECYCLE.map((value) => (
                        <SelectItem key={value} value={value}>
                          {label(value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label>Environment</Label>
              <Controller
                control={control}
                name="environment"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEBSITE_ENVIRONMENTS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {label(value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label>Website type</Label>
              <Controller
                control={control}
                name="websiteType"
                render={({ field }) => (
                  <Select
                    value={field.value || UNSET}
                    onValueChange={(v) => field.onChange(v === UNSET ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Not set" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNSET}>Not set</SelectItem>
                      {WEBSITE_TYPES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {label(value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label>Maintenance coverage</Label>
              <Controller
                control={control}
                name="maintenanceCoverage"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MAINTENANCE_COVERAGES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {label(value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="website-framework">Framework</Label>
              <Input id="website-framework" placeholder="e.g. Next.js" {...register("framework")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website-repo">Repository URL</Label>
              <Input
                id="website-repo"
                placeholder="https://github.com/…"
                aria-invalid={!!errors.repositoryUrl}
                {...register("repositoryUrl")}
              />
              <FieldError message={errors.repositoryUrl?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website-hosting">Hosting provider</Label>
              <Input
                id="website-hosting"
                placeholder="e.g. Vercel"
                {...register("hostingProvider")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website-deploy-ref">Deployment project ref</Label>
              <Input
                id="website-deploy-ref"
                placeholder="e.g. team/project"
                {...register("deploymentProjectRef")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website-production-url">Production URL</Label>
              <Input
                id="website-production-url"
                placeholder="https://example.co.uk"
                {...register("productionUrl")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website-staging-url">Staging URL</Label>
              <Input
                id="website-staging-url"
                placeholder="https://staging.example.co.uk"
                {...register("stagingUrl")}
              />
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="website-domain-renewal">Domain renewal date</Label>
              <Input id="website-domain-renewal" type="date" {...register("domainRenewalDate")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website-ssl">SSL expiry date</Label>
              <Input id="website-ssl" type="date" {...register("sslExpiryDate")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website-launch">Launch date</Label>
              <Input id="website-launch" type="date" {...register("launchDate")} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="website-notes">Technical notes</Label>
            <Textarea
              id="website-notes"
              rows={4}
              placeholder="DNS setup, deployment quirks, renewal checklist…"
              {...register("technicalNotes")}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={formState.isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={formState.isSubmitting}>
              {formState.isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
              {isEdit ? "Save changes" : "Create website"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
