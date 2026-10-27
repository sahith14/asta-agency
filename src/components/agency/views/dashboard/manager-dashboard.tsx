"use client";

/**
 * AgencyOS — Client Manager dashboard (Phase 5, spec §7).
 * Real records only: leads, follow-ups, meetings, briefs. Every card links
 * to its filtered module view.
 */
import { useAppStore, openClient, openBrief, openMeetings } from "@/components/agency/store";
import { KpiCard } from "@/components/agency/shared/kpi-card";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { label, type DashboardData } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { CalendarDays, ClipboardList, UserPlus, Users, UserCheck, ListChecks } from "lucide-react";

export function ManagerDashboard({ data }: { data: NonNullable<DashboardData["manager"]> }) {
  const navigate = useAppStore((s) => s.navigate);
  const k = data.kpis;

  const kpis = [
    { title: "New enquiries (30d)", icon: UserPlus, value: k.newEnquiries30d, onClick: () => navigate("clients", { status: "PROSPECT" }) },
    { title: "Assigned leads", icon: Users, value: k.assignedLeads, onClick: () => navigate("clients", { status: "PROSPECT" }) },
    { title: "Follow-ups due", icon: ListChecks, value: k.followUpsDue, tone: k.followUpsDue > 0 ? ("warning" as const) : ("default" as const) },
    { title: "Upcoming meetings", icon: CalendarDays, value: k.upcomingMeetings, onClick: () => openMeetings() },
    { title: "Incomplete briefs", icon: ClipboardList, value: k.incompleteBriefs, onClick: () => navigate("briefs") },
    { title: "Briefs awaiting review", icon: UserCheck, value: k.briefsAwaitingReview, onClick: () => navigate("briefs", { status: "READY_FOR_REVIEW" }) },
  ];

  return (
    <div className="space-y-6">
      <section aria-label="Pipeline KPIs" className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-6">
        {kpis.map((def) => (
          <KpiCard key={def.title} title={def.title} value={def.value} icon={def.icon} tone={def.tone ?? "default"} onClick={def.onClick} />
        ))}
      </section>

      <section aria-label="Manager queues" className="grid gap-4 lg:grid-cols-2">
        {/* Follow-ups due */}
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Follow-ups due</h3>
            <span className="text-xs text-muted-foreground">{data.followUpsDue.length}</span>
          </div>
          {data.followUpsDue.length === 0 ? (
            <EmptyState title="No follow-ups due" description="Leads with a due follow-up will appear here." className="border-0" />
          ) : (
            <ul className="max-h-72 divide-y overflow-y-auto scrollbar-thin">
              {data.followUpsDue.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => openClient(c.id)} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-accent/40">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{c.businessName}</span>
                      <span className="text-xs text-muted-foreground">
                        {c.followUpAt ? `Due ${formatDateTime(c.followUpAt)}` : "No date set"}
                      </span>
                    </span>
                    <StatusBadge value={c.outreachStatus} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Upcoming meetings */}
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Upcoming meetings</h3>
            <span className="text-xs text-muted-foreground">{data.upcomingMeetings.length}</span>
          </div>
          {data.upcomingMeetings.length === 0 ? (
            <EmptyState title="No upcoming meetings" description="Booked meetings appear here." className="border-0" />
          ) : (
            <ul className="max-h-72 divide-y overflow-y-auto scrollbar-thin">
              {data.upcomingMeetings.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => openMeetings()} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-accent/40">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{m.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {m.clientName} · {formatDateTime(m.scheduledAt)} ({m.timezone})
                      </span>
                    </span>
                    <StatusBadge value={m.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Briefs needing work */}
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Briefs needing work</h3>
            <span className="text-xs text-muted-foreground">{data.briefsNeedingWork.length}</span>
          </div>
          {data.briefsNeedingWork.length === 0 ? (
            <EmptyState title="No briefs need work" description="Drafts and briefs with requested changes appear here." className="border-0" />
          ) : (
            <ul className="max-h-72 divide-y overflow-y-auto scrollbar-thin">
              {data.briefsNeedingWork.map((b) => (
                <li key={b.id}>
                  <button type="button" onClick={() => openBrief(b.id)} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-accent/40">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {b.displayNumber} · {b.clientName ?? "—"}
                      </span>
                      {b.missingInformation ? (
                        <span className="block truncate text-xs text-muted-foreground">Missing: {b.missingInformation}</span>
                      ) : null}
                    </span>
                    <StatusBadge value={b.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent meeting outcomes */}
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Recent meeting outcomes</h3>
            <span className="text-xs text-muted-foreground">{data.recentMeetingOutcomes.length}</span>
          </div>
          {data.recentMeetingOutcomes.length === 0 ? (
            <EmptyState title="No outcomes yet" description="Completed meetings with recorded decisions appear here." className="border-0" />
          ) : (
            <ul className="max-h-72 divide-y overflow-y-auto scrollbar-thin">
              {data.recentMeetingOutcomes.map((m) => (
                <li key={m.id} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-medium">{m.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{m.clientName}</span>
                  </div>
                  {m.outcome ? (
                    <p className="mt-0.5 line-clamp-2 border-l-2 pl-2 text-xs text-muted-foreground">{m.outcome}</p>
                  ) : (
                    <p className="mt-0.5 text-xs italic text-muted-foreground">No outcome recorded — {label("OPEN")}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

export function ManagerDashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-56" />
        ))}
      </div>
    </div>
  );
}
