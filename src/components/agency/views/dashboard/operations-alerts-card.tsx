"use client";

/**
 * AgencyOS — Operations alerts card (Phase 4).
 *
 * Renders ONLY real records from DashboardData.operations (server-computed,
 * failure-isolated). Visual prioritisation: down websites and SEV1/SEV2
 * incidents are destructive; everything else stays muted so not every
 * warning looks like an emergency.
 */
import { useAppStore, openIncident, openMaintenance, openMonitoring, openWebsite } from "@/components/agency/store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { formatDate, timeAgo } from "@/lib/format";
import { label } from "@/lib/types";
import type { OperationsDashboardData } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AlertTriangle, Clock, Rocket, XOctagon } from "lucide-react";

export function OperationsAlertsCard({ ops }: { ops: OperationsDashboardData }) {
  const navigate = useAppStore((s) => s.navigate);
  const hasAnything =
    ops.downWebsitesTop.length > 0 ||
    ops.activeIncidentsTop.length > 0 ||
    ops.failedJobsTop.length > 0 ||
    ops.maintenanceDueTop.length > 0;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">Operations</CardTitle>
          <CardDescription>
            Live website health, incidents, maintenance and background jobs.
          </CardDescription>
        </div>
        <button
          type="button"
          className="text-xs text-muted-foreground underline"
          onClick={() => navigate("monitoring")}
        >
          Monitoring overview
        </button>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasAnything ? (
          <p className="text-sm text-muted-foreground">
            All clear — no down websites, open incidents, failed jobs or maintenance due
            right now.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {ops.downWebsitesTop.length > 0 ? (
              <OpsSection
                icon={<XOctagon aria-hidden className="size-4 text-destructive" />}
                title={`Down websites (${ops.downWebsitesTop.length})`}
                onSeeAll={() => openMonitoring("websites", { health: "DOWN" })}
              >
                {ops.downWebsitesTop.map((w) => (
                  <li key={w.id}>
                    <button
                      type="button"
                      className="w-full rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-left text-sm hover:bg-destructive/10"
                      onClick={() => openWebsite(w.id)}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium text-destructive">{w.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {w.since ? timeAgo(w.since) : ""}
                        </span>
                      </span>
                      {w.lastError ? (
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground" title={w.lastError}>
                          {w.lastError}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </OpsSection>
            ) : null}

            {ops.activeIncidentsTop.length > 0 ? (
              <OpsSection
                icon={<AlertTriangle aria-hidden className="size-4 text-warning" />}
                title={`Active incidents (${ops.activeIncidentsTop.length})`}
                onSeeAll={() => navigate("incidents", { status: "OPEN" })}
              >
                {ops.activeIncidentsTop.map((incident) => {
                  const critical = incident.severity === "SEV1" || incident.severity === "SEV2";
                  return (
                    <li key={incident.id}>
                      <button
                        type="button"
                        className={cn(
                          "w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-muted/50",
                          critical ? "border-destructive/30 bg-destructive/5" : "border",
                        )}
                        onClick={() => openIncident(incident.id)}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-2">
                            <StatusBadge value={incident.severity} />
                            <span className={cn("truncate", critical && "font-medium")}>{incident.title}</span>
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {timeAgo(incident.detectedAt)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </OpsSection>
            ) : null}

            {ops.failedJobsTop.length > 0 ? (
              <OpsSection
                icon={<Rocket aria-hidden className="size-4 text-muted-foreground" />}
                title={`Failed background jobs (${ops.failedJobsTop.length})`}
                onSeeAll={() => openMonitoring("jobs")}
              >
                {ops.failedJobsTop.map((job) => (
                  <li key={job.id}>
                    <button
                      type="button"
                      className="w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-muted/50"
                      onClick={() => openMonitoring("jobs")}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{label(job.jobKey)}</span>
                        <StatusBadge value={job.status} />
                      </span>
                      {job.lastError ? (
                        <span className="mt-0.5 block truncate text-xs text-destructive" title={job.lastError}>
                          {job.lastError}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </OpsSection>
            ) : null}

            {ops.maintenanceDueTop.length > 0 ? (
              <OpsSection
                icon={<Clock aria-hidden className="size-4 text-muted-foreground" />}
                title={`Maintenance due soon (${ops.maintenanceDueTop.length})`}
                onSeeAll={() => openMaintenance("runs", { due: "upcoming" })}
              >
                {ops.maintenanceDueTop.map((run) => (
                  <li key={run.id}>
                    <button
                      type="button"
                      className="w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-muted/50"
                      onClick={() => openMaintenance("runs", { runId: run.id })}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate">{run.websiteName}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatDate(run.scheduledDate)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </OpsSection>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OpsSection({
  icon,
  title,
  onSeeAll,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  onSeeAll: () => void;
  children: React.ReactNode;
}) {
  return (
    <section>
      <header className="mb-1.5 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-medium">
          {icon}
          {title}
        </h3>
        <button type="button" className="text-xs text-muted-foreground underline" onClick={onSeeAll}>
          See all
        </button>
      </header>
      <ul className="space-y-1.5">{children}</ul>
    </section>
  );
}
