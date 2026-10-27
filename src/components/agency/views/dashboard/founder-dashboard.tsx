"use client";

/**
 * AgencyOS — Overview dashboard.
 *
 * Data: useQuery(["dashboard"]) — the SAME queryKey the topbar notifications
 * popover uses (shared cache, staleTime 30s per the Task 3 contract).
 *
 * Every KPI opens a filtered list (spec). Support/Billing KPIs render the
 * honest "Not yet configured" state instead of fake numbers. Quick actions
 * use the params.create=1 convention consumed by 4-b/4-c list views.
 */
import { format } from "date-fns";
import { enGB } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlarmClock,
  Bell,
  CalendarClock,
  CircleAlert,
  FolderKanban,
  Globe,
  Hammer,
  LifeBuoy,
  Plus,
  ReceiptText,
  RefreshCw,
  Repeat,
  Settings,
  UserCheck,
  Users,
  Wallet,
  type LucideIcon,
  UserPlus,
  CalendarDays,
  ClipboardList,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ACTIVE_PROJECT_STATUSES, type DashboardData } from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import { useAppStore, openMeetings } from "@/components/agency/store";
import { KpiCard } from "@/components/agency/shared/kpi-card";
import { PriorityQueueCard } from "@/components/agency/views/dashboard/priority-queue-card";
import { DeadlinesCard } from "@/components/agency/views/dashboard/deadlines-card";
import { RecentActivityCard } from "@/components/agency/views/dashboard/recent-activity-card";
import { BillingRenewalsCard } from "@/components/agency/views/billing/renewals-card";
import { OperationsAlertsCard } from "@/components/agency/views/dashboard/operations-alerts-card";
import {
  QuickActionsCard,
  QuickActionsMenu,
} from "@/components/agency/views/dashboard/quick-actions";

interface KpiDef {
  title: string;
  icon: LucideIcon;
  value?: React.ReactNode;
  hint?: string;
  tone?: "default" | "success" | "warning" | "danger";
  onClick?: () => void;
  unavailable?: string;
}

function greetingFor(hour: number): "morning" | "afternoon" | "evening" {
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function WelcomeBanner() {
  const navigate = useAppStore((s) => s.navigate);
  return (
    <div className="rounded-xl border border-primary/25 bg-primary/5 p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <h3 className="text-base font-semibold tracking-tight">Welcome to AgencyOS</h3>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            Your workspace is empty. Create your first client, or load a clearly-labelled
            sample dataset from Settings to explore the system.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button onClick={() => navigate("clients", { create: "1" })}>
            <Plus aria-hidden />
            New client
          </Button>
          <Button variant="outline" onClick={() => navigate("settings")}>
            <Settings aria-hidden />
            Open Settings
          </Button>
        </div>
      </div>
    </div>
  );
}

export function KpiSkeletonGrid() {
  return (
    <section aria-busy aria-label="Loading metrics" className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-card p-4">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="mt-3 h-7 w-12" />
        </div>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
/**
 * AgencyOS — Founder (OWNER) dashboard: the full operations overview plus the
 * Phase 5 pipeline KPIs. STAFF (legacy role) sees the same shell with honest
 * empty queues (server returns zeros for non-founder roles).
 */
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface FounderDashboardProps {
  data?: DashboardData;
  errorState?: boolean;
  onRetry?: () => void;
}

export function FounderDashboard({ data, errorState, onRetry }: FounderDashboardProps) {
  const user = useAppStore((s) => s.user);
  const navigate = useAppStore((s) => s.navigate);
  const isLoading = false;
  const isError = errorState === true;
  const refetch = onRetry ?? (() => {});
  const safeData: DashboardData = data ?? {
    role: "STAFF",
    kpis: {
      totalClients: 0, activeClients: 0, liveWebsites: 0, websitesInDevelopment: 0,
      activeProjects: 0, overdueTasks: 0, tasksDueToday: 0, openTickets: 0,
      upcomingRenewals: 0, outstandingInvoices: null, recurringRevenue: null,
    },
    priorityQueue: [], upcomingDeadlines: [], recentActivity: [],
  };
  void user;
  const kpis = safeData?.kpis;
  const bareInstall =
    !!kpis && kpis.totalClients === 0 && kpis.activeProjects === 0 && kpis.liveWebsites === 0;

  const kpiDefs: KpiDef[] = kpis
    ? [
        {
          title: "Total clients",
          icon: Users,
          value: kpis.totalClients,
          onClick: () => navigate("clients"),
        },
        {
          title: "Active clients",
          icon: UserCheck,
          value: kpis.activeClients,
          onClick: () => navigate("clients", { status: "ACTIVE" }),
        },
        {
          title: "Live websites",
          icon: Globe,
          value: kpis.liveWebsites,
          onClick: () => navigate("websites", { status: "LIVE" }),
        },
        {
          title: "In development",
          icon: Hammer,
          value: kpis.websitesInDevelopment,
          onClick: () => navigate("websites", { status: "IN_DEVELOPMENT" }),
        },
        {
          title: "Active projects",
          icon: FolderKanban,
          value: kpis.activeProjects,
          onClick: () =>
            navigate("projects", { status: ACTIVE_PROJECT_STATUSES.join(",") }),
        },
        {
          title: "Overdue tasks",
          icon: AlarmClock,
          value: kpis.overdueTasks,
          tone: kpis.overdueTasks > 0 ? "danger" : "default",
          onClick: () => navigate("tasks", { due: "overdue" }),
        },
        {
          title: "Due today",
          icon: CalendarClock,
          value: kpis.tasksDueToday,
          onClick: () => navigate("tasks", { due: "today" }),
        },
        {
          title: "Upcoming renewals",
          icon: RefreshCw,
          value: kpis.upcomingRenewals,
          hint: "within 30 days",
          onClick: () => navigate("websites"),
        },
        {
          title: "Open support tickets",
          icon: LifeBuoy,
          value: kpis.openTickets,
          hint: "support module",
          onClick: () => navigate("support"),
        },
        {
          title: "Outstanding invoices",
          icon: ReceiptText,
          value: formatCurrency(kpis.outstandingInvoices ?? 0),
          tone: (kpis.outstandingInvoices ?? 0) > 0 ? "danger" : "default",
          hint: "unpaid issued invoices",
          onClick: () => navigate("billing", { tab: "invoices" }),
        },
        {
          title: "Recurring revenue",
          icon: Repeat,
          value: formatCurrency(kpis.recurringRevenue ?? 0),
          hint: "MRR · active subscriptions",
          onClick: () => navigate("billing", { tab: "subscriptions" }),
        },
        {
          title: "Overdue invoices",
          icon: CircleAlert,
          value: kpis.billing?.overdueInvoices ?? 0,
          tone: (kpis.billing?.overdueInvoices ?? 0) > 0 ? "danger" : "default",
          onClick: () => navigate("billing", { tab: "invoices", status: "OVERDUE" }),
        },
        {
          title: "Payments received",
          icon: Wallet,
          value: formatCurrency(kpis.billing?.paymentsReceivedMinor ?? 0),
          tone: "success",
          hint: "verified, net of refunds",
          onClick: () => navigate("billing", { tab: "payments" }),
        },
      ]
    : [];

  // Phase 4 — operations KPIs (rendered only when the server block succeeded)
  const ops = kpis?.operations;
  const opsKpiDefs: KpiDef[] = ops
    ? [
        {
          title: "Healthy sites",
          icon: Activity,
          value: ops.healthyWebsites,
          tone: "success",
          hint: "monitored, passing",
          onClick: () => navigate("monitoring", { tab: "websites", health: "HEALTHY" }),
        },
        {
          title: "Sites down",
          icon: CircleAlert,
          value: ops.downWebsites,
          tone: ops.downWebsites > 0 ? "danger" : "default",
          hint: `${ops.degradedWebsites} degraded`,
          onClick: () => navigate("monitoring", { tab: "websites", health: "DOWN" }),
        },
        {
          title: "Active incidents",
          icon: Bell,
          value: ops.activeIncidents,
          tone: ops.incidentsBySeverity.sev1 + ops.incidentsBySeverity.sev2 > 0 ? "danger" : "default",
          hint:
            ops.activeIncidents > 0
              ? `${ops.incidentsBySeverity.sev1 + ops.incidentsBySeverity.sev2} SEV1/SEV2`
              : "no open incidents",
          onClick: () => navigate("incidents", { status: "OPEN" }),
        },
      ]
    : [];

  // Phase 5 — founder pipeline KPIs (rendered only when the server block ran)
  const p5KpiDefs: KpiDef[] = kpis
    ? [
        ...(kpis.newLeads30d !== undefined
          ? [{
              title: "New leads (30d)",
              icon: UserPlus,
              value: kpis.newLeads30d,
              hint: "prospects added",
              onClick: () => navigate("clients", { status: "PROSPECT" }),
            }]
          : []),
        ...(kpis.qualifiedLeads !== undefined
          ? [{
              title: "Qualified leads",
              icon: UserCheck,
              value: kpis.qualifiedLeads,
              onClick: () => navigate("clients", { status: "PROSPECT" }),
            }]
          : []),
        ...(kpis.upcomingMeetings !== undefined
          ? [{
              title: "Upcoming meetings",
              icon: CalendarDays,
              value: kpis.upcomingMeetings,
              onClick: () => openMeetings(),
            }]
          : []),
        ...(kpis.briefsAwaitingReview !== undefined
          ? [{
              title: "Briefs to review",
              icon: ClipboardList,
              value: kpis.briefsAwaitingReview,
              tone: kpis.briefsAwaitingReview > 0 ? ("warning" as const) : ("default" as const),
              onClick: () => navigate("briefs", { status: "READY_FOR_REVIEW" }),
            }]
          : []),
        ...(kpis.releasesAwaitingApproval !== undefined
          ? [{
              title: "Releases to approve",
              icon: ShieldCheck,
              value: kpis.releasesAwaitingApproval,
              tone: kpis.releasesAwaitingApproval > 0 ? ("warning" as const) : ("default" as const),
              onClick: () => navigate("tasks", { status: "APPROVAL_REQUIRED" }),
            }]
          : []),
        ...(kpis.maintenanceCompleted30d !== undefined
          ? [{
              title: "Maintenance done (30d)",
              icon: Wrench,
              value: kpis.maintenanceCompleted30d,
              onClick: () => navigate("maintenance", { tab: "runs" }),
            }]
          : []),
      ]
    : [];

  const allKpiDefs = [...kpiDefs, ...opsKpiDefs, ...p5KpiDefs];

  const now = new Date();

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h2 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
            Good {greetingFor(now.getHours())}, {user?.displayName ?? "there"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {format(now, "EEEE, d MMMM yyyy", { locale: enGB })}
          </p>
        </div>
        <QuickActionsMenu />
      </div>

      {isError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load the dashboard</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>Check your connection and try again.</span>
            <Button size="sm" variant="outline" onClick={() => void refetch()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {isLoading || !kpis ? (
        <KpiSkeletonGrid />
      ) : (
        <>
          {bareInstall ? <WelcomeBanner /> : null}

          {/* KPI grid — every card opens a filtered list */}
          <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-6">
            {allKpiDefs.map((def) => (
              <KpiCard
                key={def.title}
                title={def.title}
                value={def.value ?? 0}
                icon={def.icon}
                hint={def.hint}
                tone={def.tone}
                unavailable={def.unavailable}
                onClick={def.onClick}
              />
            ))}
          </section>

          {/* Priority queue + deadlines + billing renewals + operations alerts */}
          <section aria-label="Attention" className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <PriorityQueueCard items={safeData.priorityQueue} />
            </div>
            <DeadlinesCard items={safeData.upcomingDeadlines} />
            {safeData.billingRenewals ? (
              <div className="lg:col-span-3">
                <BillingRenewalsCard items={safeData.billingRenewals} />
              </div>
            ) : null}
            {safeData.operations ? (
              <div className="lg:col-span-3">
                <OperationsAlertsCard ops={safeData.operations} />
              </div>
            ) : null}
          </section>

          {/* Recent activity + quick actions */}
          <section aria-label="Recent activity and quick actions" className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <RecentActivityCard items={safeData.recentActivity} />
            </div>
            <QuickActionsCard isEmpty={bareInstall} />
          </section>
        </>
      )}
    </div>
  );
}
