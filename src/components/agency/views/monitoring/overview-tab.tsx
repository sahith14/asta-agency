"use client";

/**
 * AgencyOS — Monitoring › Overview tab (Phase 4, task 4-b).
 *
 * KPI grid (healthy/degraded/down/incidents/checks today) + "expiring soon"
 * domain & certificate lists + background-jobs card with scheduler status and
 * Run-now buttons. All figures come from GET /api/monitoring/summary — nothing
 * is simulated. Monitoring performs REAL HTTP(S) checks from this server; the
 * copy says so.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  PlayCircle,
  Radar,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { KpiCard } from "@/components/agency/shared/kpi-card";
import { navigate, openMonitoring, openWebsite } from "@/components/agency/store";
import { apiFetch, type JobRunOutcome, type MonitoringSummaryData, type Paginated } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { expiryToneClass, toastJobOutcome } from "@/components/agency/views/monitoring/bits";

export function MonitoringOverviewTab() {
  const queryClient = useQueryClient();

  const summaryQuery = useQuery({
    queryKey: ["monitoring-summary"],
    queryFn: () => apiFetch<MonitoringSummaryData>("/api/monitoring/summary"),
  });

  // Failed background jobs in the retention window (count only).
  const failedJobsQuery = useQuery({
    queryKey: ["jobs", "failed-count"],
    queryFn: () =>
      apiFetch<Paginated<{ id: string }>>("/api/jobs?status=FAILED&page=1&pageSize=1"),
    retry: false,
  });

  const runJob = useMutation({
    mutationFn: (jobKey: string) =>
      apiFetch<JobRunOutcome>("/api/jobs/run", {
        method: "POST",
        body: JSON.stringify({ jobKey }),
      }),
    onSuccess: (outcome) => {
      toastJobOutcome(outcome);
      void queryClient.invalidateQueries({ queryKey: ["monitoring-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
      void queryClient.invalidateQueries({ queryKey: ["monitoring-domains"] });
      void queryClient.invalidateQueries({ queryKey: ["monitoring-configs"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: Error) => toast.error(error.message || "The job could not be started."),
  });

  const summary = summaryQuery.data;

  if (summaryQuery.isLoading) {
    return <OverviewSkeleton />;
  }

  if (summaryQuery.isError) {
    return (
      <EmptyState
        icon={Radar}
        title="Monitoring summary could not be loaded"
        description={(summaryQuery.error as Error)?.message ?? "Something went wrong."}
        action={
          <Button variant="outline" onClick={() => void summaryQuery.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  if (!summary) return null;

  return (
    <div className="space-y-4">
      {/* KPI grid — each card opens the matching filtered list */}
      <section
        aria-label="Monitoring metrics"
        className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-6"
      >
        <KpiCard
          title="Healthy"
          value={summary.healthy}
          icon={CheckCircle2}
          tone="success"
          hint={`${summary.websitesMonitored} monitored · ${summary.disabled} disabled`}
          onClick={() => openMonitoring("websites", { health: "HEALTHY" })}
        />
        <KpiCard
          title="Degraded"
          value={summary.degraded}
          icon={Activity}
          tone={summary.degraded > 0 ? "warning" : "default"}
          hint="slow or below-threshold failures"
          onClick={() => openMonitoring("websites", { health: "DEGRADED" })}
        />
        <KpiCard
          title="Down"
          value={summary.down}
          icon={XCircle}
          tone={summary.down > 0 ? "danger" : "default"}
          hint={`${summary.unknown} never checked`}
          onClick={() => openMonitoring("websites", { health: "DOWN" })}
        />
        <KpiCard
          title="Active incidents"
          value={summary.activeIncidents}
          icon={AlertTriangle}
          tone={summary.activeIncidents > 0 ? "danger" : "default"}
          hint={
            summary.activeIncidents > 0
              ? `${summary.openIncidentsBySeverity.sev1 + summary.openIncidentsBySeverity.sev2} SEV1/SEV2`
              : "no open incidents"
          }
          onClick={() => navigate("incidents", { status: "OPEN" })}
        />
        <KpiCard
          title="Checks today"
          value={summary.checksToday}
          icon={RefreshCw}
          hint="scheduled + manual"
        />
        <KpiCard
          title="Failed checks today"
          value={summary.failuresToday}
          icon={XCircle}
          tone={summary.failuresToday > 0 ? "warning" : "default"}
          onClick={() => openMonitoring("checks", { result: "FAILED" })}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Expiring soon: domains + certificates */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock aria-hidden className="size-4 text-muted-foreground" />
                Expiring soon
              </CardTitle>
              <CardDescription>Domain renewals and certificates within 30 days.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => openMonitoring("domains")}>
              Open domains
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <ExpiringList
              emptyText="No domains expiring in the next 30 days."
              rows={summary.domainsExpiringSoon.map((domain) => ({
                key: domain.id,
                primary: domain.domainName,
                secondary: domain.websiteName,
                badge: domain.renewalSource === "RDAP" ? "RDAP-verified" : "Manual",
                right: (
                  <span className={cn("text-xs tabular-nums", expiryToneClass(domain.daysUntilRenewal))}>
                    {domain.daysUntilRenewal !== null && domain.daysUntilRenewal !== undefined
                      ? domain.daysUntilRenewal <= 0
                        ? "expired"
                        : `in ${domain.daysUntilRenewal} d`
                      : "—"}
                  </span>
                ),
                onClick: () => openWebsite(domain.websiteId),
              }))}
            />
            <ExpiringList
              emptyText="No certificates expiring in the next 30 days."
              rows={summary.certsExpiringSoon.map((cert) => ({
                key: cert.id,
                primary: cert.domainName,
                secondary: cert.websiteName,
                badge: "TLS",
                right: (
                  <span className={cn("text-xs tabular-nums", expiryToneClass(cert.daysUntilExpiry))}>
                    {cert.daysUntilExpiry <= 0 ? "expired" : `in ${cert.daysUntilExpiry} d`}
                  </span>
                ),
                onClick: () => openMonitoring("domains"),
              }))}
            />
          </CardContent>
        </Card>

        {/* Background jobs + scheduler */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2 text-base">
                <ServerCog aria-hidden className="size-4 text-muted-foreground" />
                Background jobs
              </CardTitle>
              <CardDescription>
                In-process scheduler: runs every minute while the server is up. Multi-instance
                deployments should call POST /api/jobs/run from external cron.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => openMonitoring("jobs")}>
              Open jobs
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {summary.schedulerRunning ? (
                <Badge className="border-success/30 bg-success/10 text-success hover:bg-success/10">
                  <span aria-hidden className="size-1.5 rounded-full bg-success" />
                  Scheduler running (in-process, every minute)
                </Badge>
              ) : (
                <Badge className="border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/10">
                  <span aria-hidden className="size-1.5 rounded-full bg-destructive" />
                  Scheduler not running — run jobs manually
                </Badge>
              )}
            </div>

            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div className="space-y-0.5">
                <dt className="text-xs text-muted-foreground">Last health job</dt>
                <dd>
                  {summary.lastHealthJobRun ? (
                    <span title={summary.lastHealthJobRun}>{timeAgo(summary.lastHealthJobRun)}</span>
                  ) : (
                    <span className="text-muted-foreground">never</span>
                  )}
                </dd>
              </div>
              <div className="space-y-0.5">
                <dt className="text-xs text-muted-foreground">Last domain/SSL job</dt>
                <dd>
                  {summary.lastDomainJobRun ? (
                    <span title={summary.lastDomainJobRun}>{timeAgo(summary.lastDomainJobRun)}</span>
                  ) : (
                    <span className="text-muted-foreground">never</span>
                  )}
                </dd>
              </div>
              <div className="space-y-0.5">
                <dt className="text-xs text-muted-foreground">Failed jobs recorded</dt>
                <dd>
                  {failedJobsQuery.isLoading ? (
                    <Skeleton className="h-4 w-10" />
                  ) : failedJobsQuery.isError ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span
                      className={cn(
                        "tabular-nums",
                        (failedJobsQuery.data?.total ?? 0) > 0 ? "font-medium text-destructive" : "",
                      )}
                    >
                      {failedJobsQuery.data?.total ?? 0}
                    </span>
                  )}
                </dd>
              </div>
            </dl>

            <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row">
              <Button
                variant="outline"
                onClick={() => runJob.mutate("WEBSITE_HEALTH_CHECKS")}
                disabled={runJob.isPending}
                className="min-h-9"
              >
                <PlayCircle aria-hidden />
                Run health checks now
              </Button>
              <Button
                variant="outline"
                onClick={() => runJob.mutate("DOMAIN_SSL_CHECKS")}
                disabled={runJob.isPending}
                className="min-h-9"
              >
                <ShieldCheck aria-hidden />
                Run domain/SSL checks now
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Monitoring performs real HTTP(S) checks from this server — results reflect what the server
        can actually reach, and unsafe (private/internal) URLs are rejected by the guard.
      </p>
    </div>
  );
}

/** Compact expiring-soon rows shared by the domains and certs lists. */
function ExpiringList({
  rows,
  emptyText,
}: {
  rows: {
    key: string;
    primary: string;
    secondary: string;
    badge: string;
    right: React.ReactNode;
    onClick?: () => void;
  }[];
  emptyText: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }
  return (
    <ul className="scrollbar-thin max-h-48 space-y-1.5 overflow-y-auto pr-1">
      {rows.map((row) => (
        <li key={row.key}>
          <button
            type="button"
            onClick={row.onClick}
            disabled={!row.onClick}
            className={cn(
              "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
              row.onClick && "hover:bg-muted/50",
            )}
          >
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{row.primary}</span>
                <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px]">
                  {row.badge}
                </Badge>
              </span>
              <span className="block truncate text-xs text-muted-foreground">{row.secondary}</span>
            </span>
            {row.right}
          </button>
        </li>
      ))}
    </ul>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-4" aria-busy aria-label="Loading monitoring overview">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="rounded-lg border bg-card p-4">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="mt-3 h-7 w-10" />
          </div>
        ))}
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}
