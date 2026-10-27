"use client";

/**
 * AgencyOS — Incidents view dispatcher (Phase 4, task 4-b).
 *
 * "incidents"       → filtered list
 * "incident-detail" → <IncidentDetail /> (params.id)
 */
import { useAppStore } from "@/components/agency/store";
import { PageHeader } from "@/components/agency/shared/page-header";
import { IncidentList } from "@/components/agency/views/incidents/incident-list";
import IncidentDetail from "@/components/agency/views/incidents/incident-detail";

export default function IncidentsView() {
  const view = useAppStore((s) => s.view);
  const id = useAppStore((s) => s.params.id);

  if (view === "incident-detail" && id) return <IncidentDetail />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Incidents"
        description="Outages and degradations — auto-detected by monitoring or logged manually, with the full response timeline."
      />
      <IncidentList />
    </div>
  );
}
