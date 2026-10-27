"use client";

/**
 * AgencyOS — dashboard dispatcher (Phase 5).
 * data.role picks the dashboard: employees get their role-specific view built
 * from their scoped dashboard block; the founder gets the full operations
 * overview plus the Phase 5 pipeline KPIs.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch, type DashboardData } from "@/lib/types";
import { useAppStore } from "@/components/agency/store";
import { FounderDashboard, KpiSkeletonGrid } from "@/components/agency/views/dashboard/founder-dashboard";
import { ManagerDashboard, ManagerDashboardSkeleton } from "@/components/agency/views/dashboard/manager-dashboard";
import { DeveloperDashboard } from "@/components/agency/views/dashboard/developer-dashboard";
import { FinanceDashboard } from "@/components/agency/views/dashboard/finance-dashboard";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardView() {
  // Shared with NotificationsPopover — do not change the queryKey.
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiFetch<DashboardData>("/api/dashboard"),
    staleTime: 30_000,
  });

  if (isError) {
    return <FounderDashboard errorState onRetry={() => void refetch()} />;
  }

  if (isLoading || !data) {
    return <KpiSkeletonGrid />;
  }

  switch (data.role) {
    case "CLIENT_MANAGER":
      return data.manager ? (
        <ManagerDashboard data={data.manager} />
      ) : (
        <ManagerDashboardSkeleton />
      );
    case "WEB_DEVELOPER":
      return data.developer ? (
        <DeveloperDashboard data={data.developer} />
      ) : (
        <Skeleton className="h-64" />
      );
    case "SUPPORT_FINANCE":
      return data.finance ? (
        <FinanceDashboard data={data.finance} />
      ) : (
        <Skeleton className="h-64" />
      );
    default:
      // OWNER (founder) + legacy STAFF shell
      return <FounderDashboard data={data} />;
  }
}
