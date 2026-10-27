"use client";

/**
 * AgencyOS — monitor configuration dialog (Phase 4, task 4-b).
 *
 * Create/update the MonitorConfig for one website via
 * PUT /api/monitoring/configs/[websiteId]. Shared by the Monitoring › Websites
 * tab and the website-detail Operations tab. The SSRF guard on the server may
 * reject unsafe URLs — its 400 message is shown verbatim inside the dialog.
 * degradedAfterMs is entered as SECONDS in the UI and converted to ms.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Switch } from "@/components/ui/switch";
import {
  apiFetch,
  type MonitorConfigRecord,
} from "@/lib/types";

export interface MonitorDialogWebsite {
  id: string;
  name: string;
  productionUrl?: string | null;
  primaryDomain?: string | null;
}

/** Sensible defaults for a fresh config — the server treats absent fields the same way. */
export const MONITOR_DEFAULTS = {
  acceptedStatuses: "200-299",
  intervalMinutes: 5,
  timeoutSeconds: 10,
  failureThreshold: 3,
  recoveryThreshold: 2,
  degradedAfterMs: 3000,
};

function toIntOrUndefined(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function MonitorConfigDialog({
  open,
  onOpenChange,
  website,
  config,
  presetEnabled = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  website: MonitorDialogWebsite | null;
  config: MonitorConfigRecord | null;
  /** When enabling from the switch with no config yet, start enabled. */
  presetEnabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [url, setUrl] = useState("");
  const [acceptedStatuses, setAcceptedStatuses] = useState("");
  const [intervalMinutes, setIntervalMinutes] = useState("");
  const [timeoutSeconds, setTimeoutSeconds] = useState("");
  const [failureThreshold, setFailureThreshold] = useState("");
  const [recoveryThreshold, setRecoveryThreshold] = useState("");
  const [degradedAfterSeconds, setDegradedAfterSeconds] = useState("");

  // Re-seed local state each time the dialog opens for a website.
  // Render-time adjustment (React-endorsed alternative to a reset effect).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setServerError(null);
      setEnabled(config ? config.enabled : presetEnabled);
      setUrl(config?.url ?? "");
      setAcceptedStatuses(config?.acceptedStatuses ?? MONITOR_DEFAULTS.acceptedStatuses);
      setIntervalMinutes(String(config?.intervalMinutes ?? MONITOR_DEFAULTS.intervalMinutes));
      setTimeoutSeconds(String(config?.timeoutSeconds ?? MONITOR_DEFAULTS.timeoutSeconds));
      setFailureThreshold(String(config?.failureThreshold ?? MONITOR_DEFAULTS.failureThreshold));
      setRecoveryThreshold(String(config?.recoveryThreshold ?? MONITOR_DEFAULTS.recoveryThreshold));
      setDegradedAfterSeconds(String((config?.degradedAfterMs ?? MONITOR_DEFAULTS.degradedAfterMs) / 1000));
    }
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        enabled,
        url: url.trim() || undefined,
        acceptedStatuses: acceptedStatuses.trim() || undefined,
        intervalMinutes: toIntOrUndefined(intervalMinutes),
        timeoutSeconds: toIntOrUndefined(timeoutSeconds),
        failureThreshold: toIntOrUndefined(failureThreshold),
        recoveryThreshold: toIntOrUndefined(recoveryThreshold),
      };
      const seconds = toIntOrUndefined(degradedAfterSeconds);
      if (seconds !== undefined) body.degradedAfterMs = seconds * 1000;
      return apiFetch<MonitorConfigRecord>(
        `/api/monitoring/configs/${website?.id ?? ""}`,
        { method: "PUT", body: JSON.stringify(body) },
      );
    },
    onSuccess: (record) => {
      toast.success(
        record.enabled
          ? `Monitoring enabled for ${website?.name ?? "website"}.`
          : `Monitoring disabled for ${website?.name ?? "website"}.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["monitoring-configs"] });
      void queryClient.invalidateQueries({ queryKey: ["monitoring-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["website", website?.id] });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      // Unsafe-URL guard messages arrive as 400 — show them verbatim in-dialog.
      setServerError(error.message || "Could not save the monitoring configuration.");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto scrollbar-thin sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Monitoring configuration</DialogTitle>
          <DialogDescription>
            {website
              ? `How ${website.name} is checked: the URL, expected status codes, interval and alerting thresholds.`
              : "How this website is checked."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {serverError ? (
            <Alert variant="destructive">
              <AlertTitle>Could not save</AlertTitle>
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="monitor-enabled">Monitoring enabled</Label>
              <p className="text-xs text-muted-foreground">
                Disabled websites keep their config but are not checked.
              </p>
            </div>
            <Switch
              id="monitor-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
              aria-label="Monitoring enabled"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="monitor-url">Check URL</Label>
            <Input
              id="monitor-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="Defaults to production URL"
              inputMode="url"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              {website?.productionUrl || website?.primaryDomain
                ? `Production URL on record: ${website.productionUrl ?? website.primaryDomain}`
                : "No production URL on record — set one here."}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="monitor-statuses">Accepted status codes</Label>
            <Input
              id="monitor-statuses"
              value={acceptedStatuses}
              onChange={(event) => setAcceptedStatuses(event.target.value)}
              placeholder="e.g. 200-299,301"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Ranges and single codes, comma-separated. Anything else counts as a failure.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="monitor-interval">Interval (minutes)</Label>
              <Input
                id="monitor-interval"
                type="number"
                min={1}
                value={intervalMinutes}
                onChange={(event) => setIntervalMinutes(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="monitor-timeout">Timeout (seconds)</Label>
              <Input
                id="monitor-timeout"
                type="number"
                min={1}
                value={timeoutSeconds}
                onChange={(event) => setTimeoutSeconds(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="monitor-failure">Failure threshold</Label>
              <Input
                id="monitor-failure"
                type="number"
                min={1}
                value={failureThreshold}
                onChange={(event) => setFailureThreshold(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">Consecutive failures before DOWN.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="monitor-recovery">Recovery threshold</Label>
              <Input
                id="monitor-recovery"
                type="number"
                min={1}
                value={recoveryThreshold}
                onChange={(event) => setRecoveryThreshold(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">Consecutive successes to confirm recovery.</p>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="monitor-degraded">Degraded after (seconds)</Label>
              <Input
                id="monitor-degraded"
                type="number"
                min={0}
                value={degradedAfterSeconds}
                onChange={(event) => setDegradedAfterSeconds(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Successful checks slower than this are reported as Degraded.
              </p>
            </div>
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
          <Button
            type="button"
            onClick={() => {
              setServerError(null);
              saveMutation.mutate();
            }}
            disabled={saveMutation.isPending || !website}
          >
            {saveMutation.isPending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
            Save configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
