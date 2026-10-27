"use client";

/**
 * AgencyOS — Briefs view dispatcher (Phase 5).
 *
 * "briefs"        → filtered list (manager/founder pipeline)
 * "brief-detail"  → <BriefDetail /> (params.id)
 *
 * Client-side role gate mirrors the frozen server matrix; the API enforces
 * the same rule (briefs are manager/founder, handed briefs read-only for the
 * assigned developer).
 */
import { useAppStore, useCanAccessModule } from "@/components/agency/store";
import { PageHeader } from "@/components/agency/shared/page-header";
import { AccessDenied } from "@/components/agency/shared/access-denied";
import { BriefList } from "@/components/agency/views/briefs/brief-list";
import BriefDetail from "@/components/agency/views/briefs/brief-detail";

export default function BriefsView() {
  const view = useAppStore((s) => s.view);
  const id = useAppStore((s) => s.params.id);
  const canAccess = useCanAccessModule("briefs");

  if (!canAccess) {
    return (
      <div className="space-y-6">
        <PageHeader title="Briefs" />
        <AccessDenied module="briefs" />
      </div>
    );
  }

  if (view === "brief-detail" && id) return <BriefDetail />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Briefs"
        description="Client demo briefs — capture the business profile, prepare the founder review, then hand approved work over to development."
      />
      <BriefList />
    </div>
  );
}
