"use client";

/**
 * AgencyOS — Deployments view (Phase 4, task 4-b).
 * Single-list view: filters, record deployment dialog and expandable detail
 * rows all live in deployment-list.tsx.
 */
import { PageHeader } from "@/components/agency/shared/page-header";
import { DeploymentList } from "@/components/agency/views/deployments/deployment-list";

export default function DeploymentsView() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Deployments"
        description="Who shipped what, where, and whether it actually worked — recorded manually, updated as it progresses."
      />
      <DeploymentList />
    </div>
  );
}
