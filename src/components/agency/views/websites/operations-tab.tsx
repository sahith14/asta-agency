"use client";

/**
 * AgencyOS — Operations tab of the website detail view (Phase 4).
 *
 * One place for everything operational about this website, all from real
 * queries scoped by websiteId: monitoring config + health, recent checks,
 * open incidents, upcoming maintenance runs and recent deployments.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ExternalLink,
  Radar,
  Rocket,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import {
  openDeployments,
  openIncident,
  openMaintenance,
  openMonitoring,
} from "@/components/agency/store";
import { apiFetch } from "@/lib/types";
import type {
  CheckRunOutcomeRow,
  DeploymentRecord,
  HealthCheckRecord,
  IncidentRecord,
  JobRunOutcome,
  MonitorListRow,
  MaintenanceRunRecord,
} from "@/lib/types";
import { formatDateTime, timeAgo } from "@/lib/format";
import {
  CheckResultBadge,
  formatMs,
  toastJobOutcome,
} from "@/components/agency/views/monitoring/bits";
import { MonitorConfigDialog } from "@/components/agency/views/monitoring/config-dialog";
import type { WebsiteRecord } from "@/lib/types";

export function WebsiteOperationsTab({
  websiteId,
  website,
}: {
  websiteId: string;
  website: WebsiteRecord;
}) {
  const queryClient = useQueryClient();
  const [configOpen, setConfigOpen] = useState(false);

  const configQuery = useQuery({
    queryKey: ["monitoring-configs", "website", websiteId],
    queryFn: () =>
      apiFetch<{ items: MonitorListRow[] }>(
        `/api/monitoring/configs?websiteId=${websiteId}&pageSize=1`,
      ).then((r) => r.items[0] ?? null),
  });
  const checksQuery = useQuery({
    queryKey: ["monitoring-checks", "website", websiteId],
    queryFn: () =>
      apiFetch<{ items: HealthCheckRecord[] }>(
        `/api/monitoring/checks?websiteId=${websiteId}&pageSize=5`,
      ),
  });
  const incidentsQuery = useQuery({
    queryKey: ["incidents", "website", websiteId],
    queryFn: () =>
      apiFetch<{ items: IncidentRecord[] }>(
        `/api/incidents?websiteId=${websiteId}&status=OPEN&pageSize=5`,
      ),
  });
  const maintenanceQuery = useQuery({
    queryKey: ["maintenance-runs", "website", websiteId],
    queryFn: () =>
      apiFetch<{ items: MaintenanceRunRecord[] }>(
        `/api/maintenance/runs?websiteId=${websiteId}&due=upcoming&pageSize=5`,
      ),
  });
  const deploymentsQuery = useQuery({
    queryKey: ["deployments", "website", websiteId],
    queryFn: () =>
      apiFetch<{ items: DeploymentRecord[] }>(
        `/api/deployments?websiteId=${websiteId}&pageSize=5`,
      ),
  });

  const row = configQuery.data ?? null;
  const config = row?.config ?? null;
  const dialogWebsite = {
    id: website.id,
    name: website.name,
    productionUrl: website.productionUrl,
    primaryDomain: website.primaryDomain,
  };

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["monitoring-configs", "website", websiteId] });
    void queryClient.invalidateQueries({ queryKey: ["monitoring-checks", "website", websiteId] });
    void queryClient.invalidateQueries({ queryKey: ["website", websiteId] });
  }

  const checkNow = useMutation({
    mutationFn: () =>
      apiFetch<JobRunOutcome>("/api/monitoring/checks/run", {
        method: "POST",
        body: JSON.stringify({ websiteId }),
      }),
    onSuccess: (outcome) => {
      toastJobOutcome(outcome);
      refresh();
    },
    onError: (error) => {
      toast.error((error as Error).message || "Could not run the check.");
    },
  });

  return (
    <div className="space-y-4">
      {/* Monitoring */}
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Radar className="size-4 text-primary" aria-hidden />
              Monitoring
            </CardTitle>
            <CardDescription>
              Real HTTP(S) availability checks run from this server.
            </CardDescription>
          </div>
          {config ? (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => checkNow.mutate()}
                disabled={checkNow.isPending}
              >
                {checkNow.isPending ? "Checking…" : "Check now"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfigOpen(true)}>
                Configure
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={() => setConfigOpen(true)}>
              Enable monitoring
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {configQuery.isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : configQuery.isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                Could not load monitoring config.{" "}
                <button className="underline" onClick={() => void configQuery.refetch()}>
                  Retry
                </button>
              </AlertDescription>
            </Alert>
          ) : !config ? (
            <p className="text-sm text-muted-foreground">
              Monitoring is disabled for this website. Enable it to track availability
              and detect outages automatically.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <span className="flex items-center gap-2">
                <Switch
                  checked={config.enabled}
                  aria-label="Toggle monitoring"
                  onCheckedChange={(enabled) => setConfigOpen(true)}
                />
                <StatusBadge value={config.enabled ? config.currentHealth : "DISABLED"} />
              </span>
              <span className="text-muted-foreground">
                every {config.intervalMinutes} min · failover after{" "}
                {config.failureThreshold} failures
              </span>
              <span className="text-muted-foreground">
                {config.lastCheckAt ? `Last check ${timeAgo(config.lastCheckAt)}` : "Never checked"}
              </span>
              {config.lastErrorSummary ? (
                <span className="w-full truncate text-xs text-destructive" title={config.lastErrorSummary}>
                  {config.lastErrorSummary}
                </span>
              ) : null}
            </div>
          )}
          {/* Recent checks */}
          {checksQuery.data && checksQuery.data.items.length > 0 ? (
            <ul className="divide-y rounded-md border">
              {checksQuery.data.items.map((check) => (
                <li key={check.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <CheckResultBadge
                      success={check.success}
                      errorCategory={check.errorCategory}
                    />
                    <span className="text-muted-foreground">
                      {check.statusCode != null ? `HTTP ${check.statusCode}` : "—"}
                      {check.durationMs != null ? ` · ${formatMs(check.durationMs)}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground" title={formatDateTime(check.checkedAt)}>
                    {timeAgo(check.checkedAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {checksQuery.data && checksQuery.data.items.length > 0 ? (
            <button
              type="button"
              className="text-xs text-muted-foreground underline"
              onClick={() => openMonitoring("checks", { websiteId })}
            >
              View full check history
            </button>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Open incidents */}
        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="size-4 text-warning" aria-hidden />
                Open incidents
              </CardTitle>
              <CardDescription>Outages affecting this website.</CardDescription>
            </div>
            <Button size="sm" variant="ghost" onClick={() => openMonitoring("websites")}>
              All
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {incidentsQuery.isLoading ? (
              <div className="space-y-2 p-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-3/4" />
              </div>
            ) : incidentsQuery.data && incidentsQuery.data.items.length > 0 ? (
              <ul className="divide-y border-t">
                {incidentsQuery.data.items.map((incident) => (
                  <li key={incident.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted/50"
                      onClick={() => openIncident(incident.id)}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <StatusBadge value={incident.severity} />
                        <span className="truncate">{incident.title}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {timeAgo(incident.detectedAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="border-t p-4">
                <p className="text-sm text-muted-foreground">No open incidents.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming maintenance */}
        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <Wrench className="size-4 text-primary" aria-hidden />
                Upcoming maintenance
              </CardTitle>
              <CardDescription>Planned runs and recurring schedules.</CardDescription>
            </div>
            <Button size="sm" variant="ghost" onClick={() => openMaintenance("runs", { websiteId })}>
              All
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {maintenanceQuery.isLoading ? (
              <div className="space-y-2 p-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-3/4" />
              </div>
            ) : maintenanceQuery.data && maintenanceQuery.data.items.length > 0 ? (
              <ul className="divide-y border-t">
                {maintenanceQuery.data.items.map((run) => (
                  <li key={run.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted/50"
                      onClick={() => openMaintenance("runs", { runId: run.id })}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <StatusBadge value={run.status} />
                        <span className="truncate text-muted-foreground">
                          {formatDateTime(run.scheduledDate)}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {run._count?.items ?? 0} items
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="border-t p-4">
                <p className="text-sm text-muted-foreground">
                  No upcoming maintenance runs.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Deployments */}
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Rocket className="size-4 text-primary" aria-hidden />
              Recent deployments
            </CardTitle>
            <CardDescription>Deployment history for this website.</CardDescription>
          </div>
          <Button size="sm" variant="ghost" onClick={() => openDeployments({ websiteId })}>
            All
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {deploymentsQuery.isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-3/4" />
            </div>
          ) : deploymentsQuery.data && deploymentsQuery.data.items.length > 0 ? (
            <ul className="divide-y border-t">
              {deploymentsQuery.data.items.map((deployment) => (
                <li key={deployment.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <StatusBadge value={deployment.status} />
                    <span className="text-muted-foreground">{labelEnv(deployment.environment)}</span>
                    {deployment.commitSha ? (
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {deployment.commitSha.slice(0, 7)}
                      </code>
                    ) : null}
                    {deployment.buildUrl ? (
                      <a
                        href={deployment.buildUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 text-xs text-primary underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        URL <ExternalLink className="size-3" aria-hidden />
                      </a>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground" title={formatDateTime(deployment.startedAt)}>
                    {timeAgo(deployment.startedAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="border-t p-4">
              <EmptyState
                icon={Rocket}
                title="No deployments recorded"
                description="Record a deployment when you ship this website — history stays attached to it."
              />
            </div>
          )}
        </CardContent>
      </Card>

      <MonitorConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        website={dialogWebsite}
        config={config}
      />
    </div>
  );
}

function labelEnv(env: string): string {
  return env.charAt(0) + env.slice(1).toLowerCase();
}
