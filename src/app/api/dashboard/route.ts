/**
 * AgencyOS — Dashboard API (GET /api/dashboard).
 *
 * Every KPI is computed from real queries. Modules that are not implemented
 * yet report `null` — never fake numbers.
 * Phase 3: billing metrics are added additively (outstanding amount, MRR,
 * billing KPI sub-object, upcoming subscription renewals). If any billing
 * query throws (e.g. mid-deploy), the billing block falls back to nulls/[ ]
 * so the dashboard never 500s — Phase 1/2 fields are always served.
 */
import { db } from "@/lib/db";
import { jsonOk, withAuth } from "@/lib/api";
import type { ActivityRecord, BillingRenewalItem, DashboardData } from "@/lib/types";
import { ACTIVE_PROJECT_STATUSES, OPEN_INCIDENT_STATUSES, OPEN_TASK_STATUSES, OPEN_TICKET_STATUSES } from "@/lib/types";
import { getDashboardBilling } from "@/lib/billing/summary";
import { isFounder, asRole, clientScopeWhere } from "@/lib/rbac";

// ---------------------------------------------------------------------------
// Phase 5 — role-specific blocks (additive, failure-isolated per role).
// ---------------------------------------------------------------------------
import { UNPAID_INVOICE_STATUSES } from "@/lib/types";
import type { ManagerDashboardData, DeveloperDashboardData, FinanceDashboardData } from "@/lib/types";

const DAY_MS_5 = 24 * 60 * 60 * 1000;

/** Manager block — assigned leads, follow-ups, meetings, briefs. */
async function getManagerDashboard(userId: string): Promise<ManagerDashboardData | null> {
  try {
    const scope = await clientScopeWhere({ id: userId, role: "CLIENT_MANAGER", email: "", displayName: "", status: "ACTIVE" });
    const clientWhere = scope ?? { id: { in: [] } };
    const now = new Date();
    const in30 = new Date(now.getTime() - 30 * DAY_MS_5);

    const [
      newEnquiries30d,
      assignedLeads,
      followUpRows,
      upcomingMeetingRows,
      incompleteBriefs,
      briefsAwaitingReview,
      qualifiedLeads,
      briefRows,
      outcomeRows,
    ] = await Promise.all([
      db.client.count({ where: { AND: [clientWhere, { status: "PROSPECT", createdAt: { gte: in30 } }] } }),
      db.client.count({ where: { AND: [clientWhere, { status: "PROSPECT", assignedManagerId: userId }] } }),
      db.client.findMany({
        where: {
          AND: [
            clientWhere,
            { outreachStatus: { not: "OPTED_OUT" }, status: "PROSPECT" },
            { OR: [{ followUpAt: { lte: now } }, { followUpAt: null, outreachStatus: "FOLLOW_UP" }] },
          ],
        },
        orderBy: { followUpAt: "asc" },
        take: 6,
        select: { id: true, businessName: true, followUpAt: true, outreachStatus: true, status: true },
      }),
      db.meeting.findMany({
        where: { status: "SCHEDULED", scheduledAt: { gte: now }, client: clientWhere },
        orderBy: { scheduledAt: "asc" },
        take: 6,
        select: { id: true, title: true, scheduledAt: true, timezone: true, status: true, client: { select: { businessName: true } } },
      }),
      db.brief.count({ where: { ownerUserId: userId, status: { in: ["DRAFT", "NEEDS_INFORMATION"] } } }),
      db.brief.count({ where: { status: "READY_FOR_REVIEW", client: clientWhere } }),
      db.client.count({ where: { AND: [clientWhere, { qualifiedAt: { not: null } }] } }),
      db.brief.findMany({
        where: { OR: [{ ownerUserId: userId }, { client: clientWhere }], status: { in: ["DRAFT", "NEEDS_INFORMATION", "CHANGES_REQUESTED"] } },
        orderBy: { updatedAt: "desc" },
        take: 6,
        select: { id: true, number: true, status: true, missingInformation: true, client: { select: { businessName: true } } },
      }),
      db.meeting.findMany({
        where: { status: "COMPLETED", client: clientWhere },
        orderBy: { scheduledAt: "desc" },
        take: 5,
        select: { id: true, title: true, outcome: true, scheduledAt: true, client: { select: { businessName: true } } },
      }),
    ]);

    return {
      kpis: {
        newEnquiries30d,
        assignedLeads,
        followUpsDue: followUpRows.length,
        upcomingMeetings: upcomingMeetingRows.length,
        incompleteBriefs,
        briefsAwaitingReview,
        qualifiedLeads,
      },
      followUpsDue: followUpRows.map((c) => ({
        id: c.id,
        businessName: c.businessName,
        followUpAt: c.followUpAt ? c.followUpAt.toISOString() : null,
        outreachStatus: c.outreachStatus,
        status: c.status,
      })),
      upcomingMeetings: upcomingMeetingRows.map((m) => ({
        id: m.id,
        title: m.title,
        scheduledAt: m.scheduledAt.toISOString(),
        timezone: m.timezone,
        clientName: m.client.businessName,
        status: m.status,
      })),
      briefsNeedingWork: briefRows.map((b) => ({
        id: b.id,
        displayNumber: `BRF-${String(b.number).padStart(4, "0")}`,
        clientName: b.client?.businessName ?? null,
        status: b.status,
        missingInformation: b.missingInformation,
      })),
      recentMeetingOutcomes: outcomeRows.map((m) => ({
        id: m.id,
        title: m.title,
        clientName: m.client.businessName,
        outcome: m.outcome,
        scheduledAt: m.scheduledAt.toISOString(),
      })),
    };
  } catch (err) {
    console.error("[dashboard] Manager block unavailable:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Developer block — assigned tasks, maintenance, approvals, incidents. */
async function getDeveloperDashboard(userId: string): Promise<DeveloperDashboardData | null> {
  try {
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * DAY_MS_5);
    const openStatuses = [...OPEN_TASK_STATUSES];
    const openIncidents = [...OPEN_INCIDENT_STATUSES];
    const myTaskWhere = { assigneeId: userId, status: { in: openStatuses } };

    const [
      assignedOpenTasks,
      inProgress,
      blocked,
      dueThisWeek,
      overdue,
      maintenanceDueRows,
      releasesAwaiting,
      assignedIncidents,
      myTasksTop,
      blockedRows,
      releaseRows,
      incidentRows,
    ] = await Promise.all([
      db.task.count({ where: myTaskWhere }),
      db.task.count({ where: { ...myTaskWhere, status: "IN_PROGRESS" } }),
      db.task.count({ where: { ...myTaskWhere, status: "BLOCKED" } }),
      db.task.count({ where: { ...myTaskWhere, dueAt: { gte: now, lte: in7 } } }),
      db.task.count({ where: { ...myTaskWhere, dueAt: { lt: now } } }),
      db.maintenanceRun.findMany({
        where: { assignedToId: userId, status: "PLANNED", scheduledDate: { lte: in7 } },
        orderBy: { scheduledDate: "asc" },
        take: 5,
        include: { website: { select: { name: true } } },
      }),
      db.task.count({ where: { assigneeId: userId, status: "APPROVAL_REQUIRED" } }),
      db.incident.count({ where: { assignedToId: userId, status: { in: openIncidents } } }),
      db.task.findMany({
        where: myTaskWhere,
        orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
        take: 8,
        include: { client: { select: { businessName: true } } },
      }),
      db.task.findMany({
        where: { ...myTaskWhere, status: "BLOCKED" },
        take: 5,
        include: { client: { select: { businessName: true } } },
      }),
      db.task.findMany({
        where: { assigneeId: userId, status: { in: ["APPROVAL_REQUIRED", "APPROVED"] } },
        take: 5,
        include: { client: { select: { businessName: true } } },
      }),
      db.incident.findMany({
        where: { assignedToId: userId, status: { in: openIncidents } },
        orderBy: { detectedAt: "desc" },
        take: 5,
      }),
    ]);

    return {
      kpis: {
        assignedOpenTasks,
        inProgress,
        blocked,
        dueThisWeek,
        overdue,
        maintenanceDue: maintenanceDueRows.length,
        releasesAwaitingApproval: releasesAwaiting,
        assignedOpenIncidents: assignedIncidents,
      },
      myTasksTop: myTasksTop.map((t) => ({
        id: t.id,
        displayNumber: t.taskNumber != null ? `T-${String(t.taskNumber).padStart(4, "0")}` : null,
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueAt: t.dueAt ? t.dueAt.toISOString() : null,
        clientName: t.client?.businessName ?? null,
      })),
      blockedTasks: blockedRows.map((t) => ({
        id: t.id,
        displayNumber: t.taskNumber != null ? `T-${String(t.taskNumber).padStart(4, "0")}` : null,
        title: t.title,
        escalationReason: t.escalationReason,
        clientName: t.client?.businessName ?? null,
      })),
      maintenanceDue: maintenanceDueRows.map((r) => ({
        id: r.id,
        websiteName: r.website.name,
        scheduledDate: r.scheduledDate.toISOString(),
        status: r.status,
      })),
      releasesAwaitingApproval: releaseRows.map((t) => ({
        id: t.id,
        displayNumber: t.taskNumber != null ? `T-${String(t.taskNumber).padStart(4, "0")}` : null,
        title: t.title,
        status: t.status,
        clientName: t.client?.businessName ?? null,
      })),
      openIncidents: incidentRows.map((i) => ({
        id: i.id,
        displayNumber: `INC-${String(i.number).padStart(4, "0")}`,
        title: i.title,
        severity: i.severity,
        status: i.status,
      })),
    };
  } catch (err) {
    console.error("[dashboard] Developer block unavailable:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Finance block — support queues + reconciliation (real DB records only). */
async function getFinanceDashboard(userId: string): Promise<FinanceDashboardData | null> {
  void userId;
  try {
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * DAY_MS_5);
    const openTickets = [...OPEN_TICKET_STATUSES];

    const [
      openTicketCount,
      awaitingResponseRows,
      failedPayments,
      overdueInvoiceCount,
      overdueRows,
      upcomingRenewalsCount,
      priorityGroups,
      failedRows,
      pendingRows,
    ] = await Promise.all([
      db.ticket.count({ where: { status: { in: openTickets } } }),
      db.ticket.findMany({
        where: { status: { in: openTickets }, firstResponseAt: null },
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
        take: 5,
        include: { client: { select: { businessName: true } } },
      }),
      db.payment.count({ where: { status: "FAILED" } }),
      db.invoice.count({ where: { status: "OVERDUE" } }),
      db.invoice.findMany({
        where: { status: { in: ["OVERDUE", "PARTIALLY_PAID", "ISSUED"] }, OR: [{ dueDate: { lt: now } }, { status: "OVERDUE" }] },
        orderBy: { dueDate: "asc" },
        take: 5,
        include: { client: { select: { businessName: true } } },
      }),
      db.subscription.count({ where: { status: { in: ["ACTIVE", "PAST_DUE"] }, nextRenewalDate: { lte: in30 } } }),
      db.ticket.groupBy({ by: ["priority"], where: { status: { in: openTickets } }, _count: { _all: true } }),
      db.payment.findMany({
        where: { status: "FAILED" },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { client: { select: { businessName: true } }, allocations: { include: { invoice: { select: { number: true } } } } },
      }),
      db.payment.findMany({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
        take: 5,
        include: { client: { select: { businessName: true } }, allocations: { include: { invoice: { select: { number: true } } } } },
      }),
    ]);

    // Outstanding amount: sum of invoice outstanding for unpaid issued invoices.
    const unpaidInvoices = await db.invoice.findMany({
      where: { status: { in: [...UNPAID_INVOICE_STATUSES] } },
      select: { totalMinor: true, paidMinor: true },
    });
    const outstandingMinor = unpaidInvoices.reduce((acc, inv) => acc + Math.max(0, inv.totalMinor - inv.paidMinor), 0);

    // SLA breached precisely: open + target set + no response + elapsed > target.
    const slaTickets = await db.ticket.findMany({
      where: { status: { in: openTickets }, firstResponseAt: null, slaTargetMinutes: { not: null } },
      select: { createdAt: true, slaTargetMinutes: true },
    });
    const slaBreached = slaTickets.filter((t) => t.createdAt.getTime() + (t.slaTargetMinutes ?? 0) * 60_000 < now.getTime()).length;

    const byPriority = new Map(priorityGroups.map((g) => [g.priority, g._count._all]));

    return {
      kpis: {
        openTickets: openTicketCount,
        ticketsAwaitingResponse: awaitingResponseRows.length,
        slaBreached,
        failedPayments,
        overdueInvoices: overdueInvoiceCount,
        outstandingMinor,
        reconciliationQueue: pendingRows.length,
        upcomingRenewals30d: upcomingRenewalsCount,
      },
      ticketsByPriority: {
        critical: byPriority.get("CRITICAL") ?? 0,
        high: byPriority.get("HIGH") ?? 0,
        normal: byPriority.get("NORMAL") ?? 0,
        low: byPriority.get("LOW") ?? 0,
      },
      ticketsAwaitingResponseTop: awaitingResponseRows.map((t) => ({
        id: t.id,
        displayNumber: `TKT-${String(t.number).padStart(4, "0")}`,
        subject: t.subject,
        priority: t.priority,
        awaitingReply: t.awaitingReply,
        createdAt: t.createdAt.toISOString(),
        clientName: t.client.businessName,
      })),
      reconciliationQueueTop: pendingRows.map((p) => ({
        id: p.id,
        displayRef: `PAY-${String(p.reference).padStart(4, "0")}`,
        invoiceNumber: p.allocations[0]?.invoice ? `INV-${String(p.allocations[0].invoice.number).padStart(4, "0")}` : null,
        clientName: p.client?.businessName ?? "—",
        amountMinor: p.amountMinor,
        currency: p.currency,
        method: p.method,
        createdAt: p.createdAt.toISOString(),
      })),
      failedPaymentsTop: failedRows.map((p) => ({
        id: p.id,
        invoiceNumber: p.allocations[0]?.invoice ? `INV-${String(p.allocations[0].invoice.number).padStart(4, "0")}` : null,
        clientName: p.client?.businessName ?? "—",
        amountMinor: p.amountMinor,
        currency: p.currency,
        createdAt: p.createdAt.toISOString(),
      })),
      overdueInvoicesTop: overdueRows.map((inv) => ({
        id: inv.id,
        displayNumber: `INV-${String(inv.number).padStart(4, "0")}`,
        clientName: inv.client?.businessName ?? "—",
        outstandingMinor: Math.max(0, inv.totalMinor - inv.paidMinor),
        currency: inv.currency,
        dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
      })),
      upcomingRenewals: [], // populated below via billing lib when available
    };
  } catch (err) {
    console.error("[dashboard] Finance block unavailable:", err instanceof Error ? err.message : err);
    return null;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

function shortDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** " for The Corner Bakery" style suffix used in human-readable details. */
function taskContext(task: {
  client?: { businessName: string } | null;
  website?: { name: string } | null;
  project?: { name: string } | null;
}): string {
  const name =
    task.client?.businessName ?? task.website?.name ?? task.project?.name ?? null;
  return name ? ` for ${name}` : "";
}

const taskRefs = {
  client: { select: { id: true, businessName: true } },
  website: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
};

export const GET = withAuth(async (_req, user) => {
  const now = new Date();

  // ------------------------------------------------------------------
  // Phase 5 — employees receive ONLY their role block. The founder-only
  // aggregates below (financial KPIs, cross-client queues) are never
  // computed or serialised for employee sessions — hiding UI would not be
  // sufficient; the payload itself is scoped by role.
  // ------------------------------------------------------------------
  if (!isFounder(user)) {
    const employeeRole = asRole(user.role);
    const emptyKpis = {
      totalClients: 0,
      activeClients: 0,
      liveWebsites: 0,
      websitesInDevelopment: 0,
      activeProjects: 0,
      overdueTasks: 0,
      tasksDueToday: 0,
      openTickets: 0,
      upcomingRenewals: 0,
      outstandingInvoices: null,
      recurringRevenue: null,
    };
    if (employeeRole === "CLIENT_MANAGER") {
      const manager = await getManagerDashboard(user.id);
      return jsonOk<DashboardData>({
        role: user.role,
        kpis: emptyKpis,
        priorityQueue: [],
        upcomingDeadlines: [],
        recentActivity: [],
        ...(manager ? { manager } : {}),
      });
    }
    if (employeeRole === "WEB_DEVELOPER") {
      const developer = await getDeveloperDashboard(user.id);
      return jsonOk<DashboardData>({
        role: user.role,
        kpis: emptyKpis,
        priorityQueue: [],
        upcomingDeadlines: [],
        recentActivity: [],
        ...(developer ? { developer } : {}),
      });
    }
    if (employeeRole === "SUPPORT_FINANCE") {
      const finance = await getFinanceDashboard(user.id);
      // Finance may see the subscription renewal list (billing module read).
      if (finance) {
        try {
          const billing = await getDashboardBilling();
          finance.upcomingRenewals = (billing.billingRenewals ?? []).slice(0, 5);
        } catch (err) {
          console.error("[dashboard] Finance renewals unavailable:", err instanceof Error ? err.message : err);
        }
      }
      return jsonOk<DashboardData>({
        role: user.role,
        kpis: emptyKpis,
        priorityQueue: [],
        upcomingDeadlines: [],
        recentActivity: [],
        ...(finance ? { finance } : {}),
      });
    }
    // Legacy STAFF / unknown roles: overview shell only.
    return jsonOk<DashboardData>({
      role: user.role,
      kpis: emptyKpis,
      priorityQueue: [],
      upcomingDeadlines: [],
      recentActivity: [],
    });
  }

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + DAY_MS);
  const in7 = addDays(now, 7);
  const in30 = addDays(now, 30);
  const in60 = addDays(now, 60);
  const openStatuses = [...OPEN_TASK_STATUSES];
  const activeProjectStatuses = [...ACTIVE_PROJECT_STATUSES];

  const [
    totalClients,
    activeClients,
    liveWebsites,
    websitesInDevelopment,
    activeProjects,
    overdueTasks,
    tasksDueToday,
    openTickets,
    renewalWebsiteIds,
    renewalDomainRows,
    overdueTaskRows,
    todayTaskRows,
    dueProjectRows,
    domainRenewalWebsites,
    sslExpiryWebsites,
    dueMilestoneRows,
    deadlineTaskRows,
    deadlineProjectRows,
    deadlineMilestoneRows,
    deadlineDomainRows,
    deadlineWebsiteRenewals,
    activityRows,
  ] = await Promise.all([
    // KPIs
    db.client.count({ where: { archivedAt: null } }),
    db.client.count({ where: { archivedAt: null, status: "ACTIVE" } }),
    db.website.count({ where: { archivedAt: null, lifecycleStatus: "LIVE" } }),
    db.website.count({ where: { archivedAt: null, lifecycleStatus: "IN_DEVELOPMENT" } }),
    db.project.count({ where: { status: { in: activeProjectStatuses } } }),
    db.task.count({ where: { status: { in: openStatuses }, dueAt: { lt: now } } }),
    db.task.count({
      where: { status: { in: openStatuses }, dueAt: { gte: startOfToday, lt: endOfToday } },
    }),
    // Support module (Phase 2): real open-ticket count.
    db.ticket.count({ where: { status: { in: [...OPEN_TICKET_STATUSES] } } }),
    // Upcoming renewals (next 30 days): websites with own renewal/SSL dates…
    db.website.findMany({
      where: {
        archivedAt: null,
        OR: [
          { domainRenewalDate: { gte: now, lte: in30 } },
          { sslExpiryDate: { gte: now, lte: in30 } },
        ],
      },
      select: { id: true },
    }),
    // …plus Domain rows renewing within 30 days on live websites (deduped below).
    db.domain.findMany({
      where: { renewalDate: { gte: now, lte: in30 }, website: { archivedAt: null } },
      select: { websiteId: true },
    }),
    // Priority queue sources
    db.task.findMany({
      where: { status: { in: openStatuses }, dueAt: { lt: now } },
      include: taskRefs,
      orderBy: { dueAt: "asc" },
    }),
    db.task.findMany({
      where: { status: { in: openStatuses }, dueAt: { gte: startOfToday, lt: endOfToday } },
      include: taskRefs,
      orderBy: { dueAt: "asc" },
    }),
    db.project.findMany({
      where: { status: { in: activeProjectStatuses }, dueDate: { gte: now, lte: in7 } },
      include: { client: { select: { id: true, businessName: true } } },
      orderBy: { dueDate: "asc" },
    }),
    db.website.findMany({
      where: { archivedAt: null, domainRenewalDate: { gte: now, lte: in30 } },
      include: { client: { select: { id: true, businessName: true } } },
      orderBy: { domainRenewalDate: "asc" },
    }),
    db.website.findMany({
      where: { archivedAt: null, sslExpiryDate: { gte: now, lte: in30 } },
      include: { client: { select: { id: true, businessName: true } } },
      orderBy: { sslExpiryDate: "asc" },
    }),
    db.milestone.findMany({
      where: {
        completedAt: null,
        dueDate: { gte: now, lte: in7 },
        project: { status: { in: activeProjectStatuses } },
      },
      include: { project: { select: { id: true, name: true, client: { select: { businessName: true } } } } },
      orderBy: { dueDate: "asc" },
    }),
    // Upcoming deadlines (today onwards)
    db.task.findMany({
      where: { status: { in: openStatuses }, dueAt: { gte: startOfToday } },
      orderBy: { dueAt: "asc" },
      take: 8,
      select: { id: true, title: true, dueAt: true },
    }),
    db.project.findMany({
      where: { status: { in: activeProjectStatuses }, dueDate: { gte: startOfToday } },
      orderBy: { dueDate: "asc" },
      take: 8,
      select: { id: true, name: true, dueDate: true },
    }),
    db.milestone.findMany({
      where: {
        completedAt: null,
        dueDate: { gte: startOfToday, lte: in60 },
        project: { status: { in: activeProjectStatuses } },
      },
      orderBy: { dueDate: "asc" },
      take: 8,
      select: { id: true, title: true, dueDate: true, projectId: true, project: { select: { name: true } } },
    }),
    db.domain.findMany({
      where: { renewalDate: { gte: startOfToday, lte: in60 }, website: { archivedAt: null } },
      orderBy: { renewalDate: "asc" },
      take: 8,
      select: { id: true, domainName: true, renewalDate: true, websiteId: true },
    }),
    db.website.findMany({
      where: { archivedAt: null, domainRenewalDate: { gte: startOfToday, lte: in60 } },
      orderBy: { domainRenewalDate: "asc" },
      take: 8,
      select: { id: true, name: true, domainRenewalDate: true },
    }),
    // Recent activity
    db.activity.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
  ]);

  const renewalWebsiteIdSet = new Set<string>([
    ...renewalWebsiteIds.map((w) => w.id),
    ...renewalDomainRows.map((d) => d.websiteId),
  ]);

  // ------------------------------------------------------------------
  // Priority queue
  // ------------------------------------------------------------------
  type QueueEntry = DashboardData["priorityQueue"][number];
  const queue: (QueueEntry & { ts: number })[] = [];

  for (const t of overdueTaskRows) {
    const due = t.dueAt ?? now;
    queue.push({
      id: t.id,
      kind: "TASK_OVERDUE",
      title: t.title,
      detail: `“${t.title}”${taskContext(t)} is overdue (was due ${shortDate(new Date(due))}).`,
      entityType: "TASK",
      entityId: t.id,
      severity: t.priority === "CRITICAL" || t.priority === "HIGH" ? "CRITICAL" : "NORMAL",
      ts: due.getTime(),
    });
  }
  for (const t of todayTaskRows) {
    queue.push({
      id: t.id,
      kind: "TASK_TODAY",
      title: t.title,
      detail: `“${t.title}”${taskContext(t)} is due today.`,
      entityType: "TASK",
      entityId: t.id,
      severity: "NORMAL",
      ts: (t.dueAt ?? now).getTime(),
    });
  }
  for (const p of dueProjectRows) {
    const due = p.dueDate ?? now;
    queue.push({
      id: p.id,
      kind: "PROJECT_DUE",
      title: p.name,
      detail: `Project “${p.name}”${p.client ? ` for ${p.client.businessName}` : ""} is due on ${shortDate(new Date(due))}.`,
      entityType: "PROJECT",
      entityId: p.id,
      severity: "HIGH",
      ts: due.getTime(),
    });
  }
  for (const w of domainRenewalWebsites) {
    const due = w.domainRenewalDate ?? now;
    queue.push({
      id: w.id,
      kind: "DOMAIN_RENEWAL",
      title: `${w.name} — domain renewal`,
      detail: `Domain for ${w.name}${w.client ? ` (${w.client.businessName})` : ""} renews on ${shortDate(new Date(due))}.`,
      entityType: "WEBSITE",
      entityId: w.id,
      severity: "NORMAL",
      ts: due.getTime(),
    });
  }
  for (const w of sslExpiryWebsites) {
    const due = w.sslExpiryDate ?? now;
    queue.push({
      id: w.id,
      kind: "SSL_EXPIRY",
      title: `${w.name} — SSL certificate expiry`,
      detail: `SSL certificate for ${w.name}${w.client ? ` (${w.client.businessName})` : ""} expires on ${shortDate(new Date(due))}.`,
      entityType: "WEBSITE",
      entityId: w.id,
      severity: "NORMAL",
      ts: due.getTime(),
    });
  }
  for (const m of dueMilestoneRows) {
    const due = m.dueDate ?? now;
    queue.push({
      id: m.id,
      kind: "MILESTONE_DUE",
      title: m.title,
      detail: `Milestone “${m.title}” on ${m.project.name}${m.project.client ? ` (${m.project.client.businessName})` : ""} is due on ${shortDate(new Date(due))}.`,
      entityType: "PROJECT",
      entityId: m.projectId, // milestones navigate to their project
      severity: "NORMAL",
      ts: due.getTime(),
    });
  }

  const severityRank: Record<string, number> = { CRITICAL: 0, HIGH: 1, NORMAL: 2 };
  queue.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || a.ts - b.ts);
  const priorityQueue: QueueEntry[] = queue
    .slice(0, 12)
    .map((e) => ({
      id: e.id,
      kind: e.kind,
      title: e.title,
      detail: e.detail,
      entityType: e.entityType,
      entityId: e.entityId,
      severity: e.severity,
    }));

  // ------------------------------------------------------------------
  // Upcoming deadlines (next 8, sorted by date)
  // ------------------------------------------------------------------
  type DeadlineEntry = DashboardData["upcomingDeadlines"][number];
  const deadlines: (DeadlineEntry & { ts: number })[] = [];

  for (const t of deadlineTaskRows) {
    if (!t.dueAt) continue;
    deadlines.push({
      id: t.id,
      kind: "TASK",
      title: t.title,
      date: new Date(t.dueAt).toISOString(),
      entityType: "TASK",
      entityId: t.id,
      ts: new Date(t.dueAt).getTime(),
    });
  }
  for (const p of deadlineProjectRows) {
    if (!p.dueDate) continue;
    deadlines.push({
      id: p.id,
      kind: "PROJECT",
      title: `${p.name} — project due`,
      date: new Date(p.dueDate).toISOString(),
      entityType: "PROJECT",
      entityId: p.id,
      ts: new Date(p.dueDate).getTime(),
    });
  }
  for (const m of deadlineMilestoneRows) {
    if (!m.dueDate) continue;
    deadlines.push({
      id: m.id,
      kind: "MILESTONE",
      title: `${m.title} — milestone on ${m.project.name}`,
      date: new Date(m.dueDate).toISOString(),
      entityType: "PROJECT", // milestones navigate to their project
      entityId: m.projectId,
      ts: new Date(m.dueDate).getTime(),
    });
  }
  for (const d of deadlineDomainRows) {
    if (!d.renewalDate) continue;
    deadlines.push({
      id: d.id,
      kind: "DOMAIN",
      title: `${d.domainName} — domain renewal`,
      date: new Date(d.renewalDate).toISOString(),
      entityType: "WEBSITE", // domains navigate to their website
      entityId: d.websiteId,
      ts: new Date(d.renewalDate).getTime(),
    });
  }
  for (const w of deadlineWebsiteRenewals) {
    if (!w.domainRenewalDate) continue;
    deadlines.push({
      id: w.id,
      kind: "DOMAIN",
      title: `${w.name} — domain renewal`,
      date: new Date(w.domainRenewalDate).toISOString(),
      entityType: "WEBSITE",
      entityId: w.id,
      ts: new Date(w.domainRenewalDate).getTime(),
    });
  }

  deadlines.sort((a, b) => a.ts - b.ts);
  const upcomingDeadlines: DeadlineEntry[] = deadlines
    .slice(0, 8)
    .map((d) => ({
      id: d.id,
      kind: d.kind,
      title: d.title,
      date: d.date,
      entityType: d.entityType,
      entityId: d.entityId,
    }));

  // ------------------------------------------------------------------
  // Recent activity (latest 10, all kinds)
  // ------------------------------------------------------------------
  const recentActivity: ActivityRecord[] = activityRows.map((a) => ({
    id: a.id,
    kind: a.kind,
    action: a.action,
    entityType: a.entityType,
    entityId: a.entityId,
    entityLabel: a.entityLabel,
    summary: a.summary,
    actorId: a.actorId,
    actorName: a.actorName,
    metadata: a.metadata,
    clientId: a.clientId,
    websiteId: a.websiteId,
    projectId: a.projectId,
    createdAt: a.createdAt.toISOString(),
  }));

  // ------------------------------------------------------------------
  // Phase 3 — billing (additive, failure-isolated)
  // ------------------------------------------------------------------
  let outstandingInvoices: number | null = null;
  let recurringRevenue: number | null = null;
  let billingKpis: NonNullable<DashboardData["kpis"]["billing"]> | undefined;
  let billingRenewals: BillingRenewalItem[] | undefined;
  try {
    const billing = await getDashboardBilling();
    outstandingInvoices = billing.outstandingInvoices;
    recurringRevenue = billing.recurringRevenue;
    billingKpis = billing.kpis;
    billingRenewals = billing.billingRenewals;
  } catch (err) {
    // Billing metrics must never take the whole dashboard down.
    console.error("[dashboard] Billing metrics unavailable:", err instanceof Error ? err.message : err);
  }

  // ------------------------------------------------------------------
  // Phase 4 — operations (additive, failure-isolated — same pattern as billing)
  // ------------------------------------------------------------------
  let operationsKpis: NonNullable<DashboardData["kpis"]["operations"]> | undefined;
  let operationsData: DashboardData["operations"] | undefined;
  try {
    const opsIn7 = addDays(now, 7);
    const opsIn30 = addDays(now, 30);
    const dayAgo = new Date(now.getTime() - DAY_MS);
    const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
    const openIncidentStatuses = [...OPEN_INCIDENT_STATUSES];

    const [
      opsHealthGroups,
      opsActiveIncidents,
      opsSeverityGroups,
      opsExpiringDomainRows,
      opsMaintenanceDueCount,
      opsMaintenanceDueRows,
      opsFailedJobCount,
      opsFailedJobRows,
      opsDeploymentFailureCount,
      opsDownConfigs,
      opsOpenIncidentRows,
    ] = await Promise.all([
      db.monitorConfig.groupBy({ by: ["currentHealth"], where: { enabled: true }, _count: { _all: true } }),
      db.incident.count({ where: { status: { in: openIncidentStatuses } } }),
      db.incident.groupBy({ by: ["severity"], where: { status: { in: openIncidentStatuses } }, _count: { _all: true } }),
      // Effective renewal date = RDAP observation ?? manually maintained date.
      db.domain.findMany({
        where: {
          OR: [
            { certNotAfter: { lte: opsIn30 } },
            { rdapExpiryDate: { lte: opsIn30 } },
            { rdapExpiryDate: null, renewalDate: { lte: opsIn30 } },
          ],
        },
        select: { id: true, rdapExpiryDate: true, renewalDate: true, certNotAfter: true },
      }),
      // PLANNED runs due within 7 days — overdue PLANNED runs are still due.
      db.maintenanceRun.count({ where: { status: "PLANNED", scheduledDate: { lte: opsIn7 } } }),
      db.maintenanceRun.findMany({
        where: { status: "PLANNED", scheduledDate: { lte: opsIn7 } },
        include: { website: { select: { name: true } } },
        orderBy: { scheduledDate: "asc" },
        take: 5,
      }),
      db.backgroundJobRun.count({ where: { status: { in: ["FAILED", "PARTIAL"] }, startedAt: { gte: dayAgo } } }),
      db.backgroundJobRun.findMany({
        where: { status: { in: ["FAILED", "PARTIAL"] }, startedAt: { gte: dayAgo } },
        orderBy: { startedAt: "desc" },
        take: 5,
      }),
      db.deployment.count({ where: { status: "FAILED", startedAt: { gte: weekAgo } } }),
      db.monitorConfig.findMany({
        where: { enabled: true, currentHealth: "DOWN" },
        include: { website: { select: { name: true, client: { select: { businessName: true } } } } },
        orderBy: { lastFailureAt: "asc" }, // longest-down first
        take: 5,
      }),
      db.incident.findMany({
        where: { status: { in: openIncidentStatuses } },
        orderBy: { detectedAt: "desc" },
        take: 50, // severity-ranked + sliced in JS (SQLite has no enum rank)
      }),
    ]);

    const opsByHealth = new Map(opsHealthGroups.map((g) => [g.currentHealth, g._count._all]));
    const opsBySeverity = new Map(opsSeverityGroups.map((g) => [g.severity, g._count._all]));
    const opsDomainsExpiring = opsExpiringDomainRows.filter((d) => {
      const effective = d.rdapExpiryDate ?? d.renewalDate;
      return effective !== null && effective.getTime() <= opsIn30.getTime();
    }).length;
    const opsCertsExpiring = opsExpiringDomainRows.filter(
      (d) => d.certNotAfter !== null && d.certNotAfter.getTime() <= opsIn30.getTime()
    ).length;

    const opsSeverityRank: Record<string, number> = { SEV1: 0, SEV2: 1, SEV3: 2, SEV4: 3 };
    const opsIncidentsTop = [...opsOpenIncidentRows]
      .sort(
        (a, b) =>
          (opsSeverityRank[a.severity] ?? 9) - (opsSeverityRank[b.severity] ?? 9) ||
          a.detectedAt.getTime() - b.detectedAt.getTime()
      )
      .slice(0, 5);

    operationsKpis = {
      healthyWebsites: opsByHealth.get("HEALTHY") ?? 0,
      degradedWebsites: opsByHealth.get("DEGRADED") ?? 0,
      downWebsites: opsByHealth.get("DOWN") ?? 0,
      activeIncidents: opsActiveIncidents,
      incidentsBySeverity: {
        sev1: opsBySeverity.get("SEV1") ?? 0,
        sev2: opsBySeverity.get("SEV2") ?? 0,
        sev3: opsBySeverity.get("SEV3") ?? 0,
        sev4: opsBySeverity.get("SEV4") ?? 0,
      },
      domainsExpiringSoon: opsDomainsExpiring,
      certsExpiringSoon: opsCertsExpiring,
      maintenanceDueSoon: opsMaintenanceDueCount,
      failedJobs24h: opsFailedJobCount,
      recentDeploymentFailures: opsDeploymentFailureCount,
    };

    operationsData = {
      downWebsitesTop: opsDownConfigs.map((c) => ({
        id: c.websiteId,
        name: c.website.name,
        clientName: c.website.client?.businessName ?? null,
        health: c.currentHealth,
        lastError: c.lastErrorSummary,
        since: c.lastFailureAt ? c.lastFailureAt.toISOString() : null,
      })),
      activeIncidentsTop: opsIncidentsTop.map((i) => ({
        id: i.id,
        displayNumber: `INC-${String(i.number).padStart(4, "0")}`,
        title: i.title,
        severity: i.severity,
        status: i.status,
        detectedAt: i.detectedAt.toISOString(),
      })),
      maintenanceDueTop: opsMaintenanceDueRows.map((r) => ({
        id: r.id,
        websiteName: r.website.name,
        scheduledDate: r.scheduledDate.toISOString(),
        status: r.status,
      })),
      failedJobsTop: opsFailedJobRows.map((j) => ({
        id: j.id,
        jobKey: j.jobKey,
        status: j.status,
        finishedAt: j.finishedAt ? j.finishedAt.toISOString() : null,
        lastError: j.lastError,
      })),
    };
  } catch (err) {
    // Operations metrics must never take the dashboard (or Phase 1-3 fields) down.
    console.error("[dashboard] Operations metrics unavailable:", err instanceof Error ? err.message : err);
  }

  // ------------------------------------------------------------------
  // Phase 5 — founder pipeline/approval KPIs (additive, failure-isolated)
  // ------------------------------------------------------------------
  type FounderKpiKeys = "newLeads30d" | "qualifiedLeads" | "upcomingMeetings" | "briefsAwaitingReview" | "releasesAwaitingApproval" | "maintenanceCompleted30d";
  let founderKpis: Partial<Pick<DashboardData["kpis"], FounderKpiKeys>> = {};
  if (isFounder(user)) {
    try {
      const monthAgo = new Date(now.getTime() - 30 * DAY_MS);
      const [newLeads30d, qualifiedLeads, upcomingMeetings, briefsAwaitingReview, releasesAwaitingApproval, maintenanceCompleted30d] =
        await Promise.all([
          db.client.count({ where: { status: "PROSPECT", archivedAt: null, createdAt: { gte: monthAgo } } }),
          db.client.count({ where: { qualifiedAt: { not: null }, archivedAt: null } }),
          db.meeting.count({ where: { status: "SCHEDULED", scheduledAt: { gte: now } } }),
          db.brief.count({ where: { status: "READY_FOR_REVIEW" } }),
          db.task.count({ where: { status: "APPROVAL_REQUIRED" } }),
          db.maintenanceRun.count({ where: { status: "COMPLETED", completedAt: { gte: monthAgo } } }),
        ]);
      founderKpis = { newLeads30d, qualifiedLeads, upcomingMeetings, briefsAwaitingReview, releasesAwaitingApproval, maintenanceCompleted30d };
    } catch (err) {
      console.error("[dashboard] Founder KPIs unavailable:", err instanceof Error ? err.message : err);
    }
  }

  // ------------------------------------------------------------------
  // Phase 5 — role-specific blocks (each failure-isolated; null = omit)
  // ------------------------------------------------------------------
  let managerBlock: ManagerDashboardData | undefined;
  let developerBlock: DeveloperDashboardData | undefined;
  let financeBlock: FinanceDashboardData | undefined;
  const role = asRole(user.role);
  if (role === "CLIENT_MANAGER") {
    managerBlock = (await getManagerDashboard(user.id)) ?? undefined;
  } else if (role === "WEB_DEVELOPER") {
    developerBlock = (await getDeveloperDashboard(user.id)) ?? undefined;
  } else if (role === "SUPPORT_FINANCE") {
    financeBlock = await getFinanceDashboard(user.id) ?? undefined;
    if (financeBlock && billingRenewals) {
      financeBlock.upcomingRenewals = billingRenewals.slice(0, 5);
    }
  }

  const data: DashboardData = {
    role: user.role, // Phase 5 — lets the UI pick the right dashboard
    kpis: {
      totalClients,
      activeClients,
      liveWebsites,
      websitesInDevelopment,
      activeProjects,
      overdueTasks,
      tasksDueToday,
      openTickets, // real count since Phase 2 (was null before support existed)
      upcomingRenewals: renewalWebsiteIdSet.size,
      outstandingInvoices, // real amount since Phase 3 (null when billing fails)
      recurringRevenue, // MRR since Phase 3 (null when billing fails)
      ...(billingKpis ? { billing: billingKpis } : {}),
      ...(operationsKpis ? { operations: operationsKpis } : {}), // Phase 4 (omitted when the ops block fails)
      ...founderKpis, // Phase 5 founder additions (omitted when the block fails)
    },
    priorityQueue,
    upcomingDeadlines,
    recentActivity,
    ...(billingRenewals ? { billingRenewals } : {}),
    ...(operationsData ? { operations: operationsData } : {}), // Phase 4 ops cards
    ...(managerBlock ? { manager: managerBlock } : {}), // Phase 5 role blocks
    ...(developerBlock ? { developer: developerBlock } : {}),
    ...(financeBlock ? { finance: financeBlock } : {}),
  };

  return jsonOk(data);
});
