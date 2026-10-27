"use client";

/**
 * AgencyOS — Maintenance view dispatcher (Phase 4, task 4-b).
 *
 * "maintenance" → tabbed home (schedules | runs). A run detail renders inline
 * when params.runId is set while the runs tab is open — mirroring how the
 * billing view layers detail views over its tabs.
 */
import { useAppStore } from "@/components/agency/store";
import { PageHeader } from "@/components/agency/shared/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MaintenanceSchedulesTab } from "@/components/agency/views/maintenance/schedules-tab";
import { MaintenanceRunsTab } from "@/components/agency/views/maintenance/runs-tab";
import { MaintenanceRunDetail } from "@/components/agency/views/maintenance/run-detail";

const MAINTENANCE_TABS = ["schedules", "runs"] as const;

export default function MaintenanceView() {
  const params = useAppStore((s) => s.params);
  const navigate = useAppStore((s) => s.navigate);
  const tab = (MAINTENANCE_TABS as readonly string[]).includes(params.tab ?? "")
    ? (params.tab as (typeof MAINTENANCE_TABS)[number])
    : "schedules";

  // Run detail renders in place of the runs list (params.runId).
  if (tab === "runs" && params.runId) {
    return (
      <div className="space-y-6">
        <MaintenanceRunDetail runId={params.runId} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Maintenance"
        description="Recurring care-plan checklists and the runs that record what was actually done."
      />

      <Tabs
        value={tab}
        onValueChange={(next) => navigate("maintenance", { tab: next })}
      >
        <TabsList className="h-auto w-full flex-wrap justify-start sm:w-auto">
          <TabsTrigger value="schedules">Schedules</TabsTrigger>
          <TabsTrigger value="runs">Runs</TabsTrigger>
        </TabsList>

        <TabsContent value="schedules" className="mt-4">
          <MaintenanceSchedulesTab />
        </TabsContent>
        <TabsContent value="runs" className="mt-4">
          <MaintenanceRunsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
