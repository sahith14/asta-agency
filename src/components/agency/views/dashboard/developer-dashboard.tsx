"use client";

/**
 * AgencyOS — Web Developer dashboard (Phase 5, spec §7).
 * Assigned tasks, deadlines, blocked work, maintenance due, releases
 * awaiting approval, open incidents — all real records.
 */
import { navigate, openIncident, openMaintenance } from "@/components/agency/store";
import { KpiCard } from "@/components/agency/shared/kpi-card";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { displayTaskNumber } from "@/components/agency/views/tasks/task-board";
import { type DashboardData } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { AlarmClock, CalendarClock, ListTodo, Rocket, ShieldAlert, TriangleAlert, Wrench } from "lucide-react";

export function DeveloperDashboard({ data }: { data: NonNullable<DashboardData["developer"]> }) {
  const k = data.kpis;

  const kpis = [
    { title: "My open tasks", icon: ListTodo, value: k.assignedOpenTasks, onClick: () => navigate("tasks") },
    { title: "In progress", icon: Rocket, value: k.inProgress, onClick: () => navigate("tasks", { status: "IN_PROGRESS" }) },
    { title: "Blocked", icon: TriangleAlert, value: k.blocked, tone: k.blocked > 0 ? ("warning" as const) : ("default" as const), onClick: () => navigate("tasks", { status: "BLOCKED" }) },
    { title: "Due this week", icon: CalendarClock, value: k.dueThisWeek, onClick: () => navigate("tasks", { due: "week" }) },
    { title: "Overdue", icon: AlarmClock, value: k.overdue, tone: k.overdue > 0 ? ("danger" as const) : ("default" as const), onClick: () => navigate("tasks", { due: "overdue" }) },
    { title: "Maintenance due", icon: Wrench, value: k.maintenanceDue, tone: k.maintenanceDue > 0 ? ("warning" as const) : ("default" as const), onClick: () => openMaintenance("runs") },
    { title: "Awaiting approval", icon: ShieldAlert, value: k.releasesAwaitingApproval, onClick: () => navigate("tasks", { status: "APPROVAL_REQUIRED" }) },
    { title: "My incidents", icon: TriangleAlert, value: k.assignedOpenIncidents, tone: k.assignedOpenIncidents > 0 ? ("danger" as const) : ("default" as const), onClick: () => navigate("incidents") },
  ];

  return (
    <div className="space-y-6">
      <section aria-label="Developer KPIs" className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        {kpis.map((def) => (
          <KpiCard key={def.title} title={def.title} value={def.value} icon={def.icon} tone={def.tone ?? "default"} onClick={def.onClick} />
        ))}
      </section>

      <section aria-label="Developer queues" className="grid gap-4 lg:grid-cols-2">
        {/* My tasks */}
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">My tasks by due date</h3>
            <span className="text-xs text-muted-foreground">{data.myTasksTop.length}</span>
          </div>
          {data.myTasksTop.length === 0 ? (
            <EmptyState title="No open tasks" description="Tasks assigned to you appear here." className="border-0" />
          ) : (
            <ul className="max-h-72 divide-y overflow-y-auto scrollbar-thin">
              {data.myTasksTop.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => navigate("tasks", { taskId: t.id })} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-accent/40">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {t.displayNumber ? `${t.displayNumber} · ` : ""}
                        {t.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t.clientName ?? "—"} · {t.dueAt ? `due ${formatDateTime(t.dueAt)}` : "no due date"}
                      </span>
                    </span>
                    <StatusBadge value={t.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Blocked */}
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Blocked work</h3>
            <span className="text-xs text-muted-foreground">{data.blockedTasks.length}</span>
          </div>
          {data.blockedTasks.length === 0 ? (
            <EmptyState title="Nothing blocked" className="border-0" />
          ) : (
            <ul className="max-h-72 divide-y overflow-y-auto scrollbar-thin">
              {data.blockedTasks.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => navigate("tasks", { taskId: t.id })} className="block w-full px-4 py-2.5 text-left hover:bg-accent/40">
                    <span className="block truncate text-sm font-medium">
                      {t.displayNumber ? `${t.displayNumber} · ` : ""}
                      {t.title}
                    </span>
                    {t.escalationReason ? (
                      <span className="block truncate text-xs text-destructive">Escalated: {t.escalationReason}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t.clientName ?? "—"}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Maintenance due */}
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Maintenance due</h3>
            <span className="text-xs text-muted-foreground">{data.maintenanceDue.length}</span>
          </div>
          {data.maintenanceDue.length === 0 ? (
            <EmptyState title="No maintenance due" description="Assigned runs within 7 days appear here." className="border-0" />
          ) : (
            <ul className="max-h-72 divide-y overflow-y-auto scrollbar-thin">
              {data.maintenanceDue.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => openMaintenance("runs")} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-accent/40">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{r.websiteName}</span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(r.scheduledDate)}</span>
                    </span>
                    <StatusBadge value={r.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Releases awaiting approval */}
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Releases awaiting approval</h3>
            <span className="text-xs text-muted-foreground">{data.releasesAwaitingApproval.length}</span>
          </div>
          {data.releasesAwaitingApproval.length === 0 ? (
            <EmptyState title="Nothing awaiting approval" className="border-0" />
          ) : (
            <ul className="max-h-72 divide-y overflow-y-auto scrollbar-thin">
              {data.releasesAwaitingApproval.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => navigate("tasks", { taskId: t.id })} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-accent/40">
                    <span className="min-w-0 truncate text-sm font-medium">
                      {t.displayNumber ? `${t.displayNumber} · ` : ""}
                      {t.title}
                    </span>
                    <StatusBadge value={t.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Open incidents */}
      <section aria-label="Open incidents">
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Open incidents assigned to me</h3>
            <span className="text-xs text-muted-foreground">{data.openIncidents.length}</span>
          </div>
          {data.openIncidents.length === 0 ? (
            <EmptyState title="No open incidents" className="border-0" />
          ) : (
            <ul className="max-h-72 divide-y overflow-y-auto scrollbar-thin">
              {data.openIncidents.map((i) => (
                <li key={i.id}>
                  <button type="button" onClick={() => openIncident(i.id)} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-accent/40">
                    <span className="min-w-0 truncate text-sm font-medium">
                      {i.displayNumber} · {i.title}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <StatusBadge value={i.severity} />
                      <StatusBadge value={i.status} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
