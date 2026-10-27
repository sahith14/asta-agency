"use client";

/**
 * AgencyOS — Monitoring view dispatcher (Phase 4, task 4-b).
 *
 * "monitoring" → tabbed home (overview | websites | checks | domains | jobs).
 * Mirrors the Billing dispatcher: tab changes update the store params via
 * navigate("monitoring", { tab }) so deep links from dashboard KPIs and the
 * website Operations tab land on the right tab with filter params seeded.
 */
import { useAppStore } from "@/components/agency/store";
import { PageHeader } from "@/components/agency/shared/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MonitoringOverviewTab } from "@/components/agency/views/monitoring/overview-tab";
import { MonitoringWebsitesTab } from "@/components/agency/views/monitoring/websites-tab";
import { MonitoringChecksTab } from "@/components/agency/views/monitoring/checks-tab";
import { MonitoringDomainsTab } from "@/components/agency/views/monitoring/domains-tab";
import { MonitoringJobsTab } from "@/components/agency/views/monitoring/jobs-tab";

const MONITORING_TABS = ["overview", "websites", "checks", "domains", "jobs"] as const;

export default function MonitoringView() {
  const params = useAppStore((s) => s.params);
  const navigate = useAppStore((s) => s.navigate);
  const tab = (MONITORING_TABS as readonly string[]).includes(params.tab ?? "")
    ? (params.tab as (typeof MONITORING_TABS)[number])
    : "overview";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monitoring"
        description="Website health, domains, certificates and background jobs. Monitoring performs real HTTP(S) checks from this server."
      />

      <Tabs
        value={tab}
        onValueChange={(next) => navigate("monitoring", { tab: next })}
      >
        <TabsList className="h-auto w-full flex-wrap justify-start sm:w-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="websites">Websites</TabsTrigger>
          <TabsTrigger value="checks">Checks</TabsTrigger>
          <TabsTrigger value="domains">Domains</TabsTrigger>
          <TabsTrigger value="jobs">Jobs</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <MonitoringOverviewTab />
        </TabsContent>
        <TabsContent value="websites" className="mt-4">
          <MonitoringWebsitesTab />
        </TabsContent>
        <TabsContent value="checks" className="mt-4">
          <MonitoringChecksTab />
        </TabsContent>
        <TabsContent value="domains" className="mt-4">
          <MonitoringDomainsTab />
        </TabsContent>
        <TabsContent value="jobs" className="mt-4">
          <MonitoringJobsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
