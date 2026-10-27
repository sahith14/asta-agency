/**
 * AgencyOS — Monthly maintenance report (Phase 5, spec §5).
 * GET /api/maintenance/runs/[id]/report
 *
 * HONESTY RULE: the report is assembled exclusively from recorded evidence —
 * checklist results, notes, monitoring health-check history for the period,
 * incidents and deployments in scope. Absent data is reported as "No data
 * recorded"; nothing is invented (no fake backup claims, no fake scans).
 *
 * Access: founder (all) / developer (own assigned runs) / support (read).
 */
import { db } from "@/lib/db";
import { ForbiddenError, NotFoundError, jsonOk, withAuth } from "@/lib/api";
import { isFounder, asRole } from "@/lib/rbac";

export const GET = withAuth(async (_req, user, { params }) => {
  const { id } = await params;

  const run = await db.maintenanceRun.findUnique({
    where: { id },
    include: {
      website: { select: { id: true, name: true, client: { select: { id: true, businessName: true } } } },
      schedule: { select: { id: true, name: true, frequency: true } },
      assignedTo: { select: { id: true, displayName: true } },
      items: { orderBy: { position: "asc" } },
    },
  });
  if (!run) throw new NotFoundError("Maintenance run not found.");

  // Access: founder all; developer assigned runs; support read-only.
  if (!isFounder(user)) {
    const role = asRole(user.role);
    if (role === "WEB_DEVELOPER" && run.assignedToId !== user.id) {
      throw new ForbiddenError("This maintenance run is not assigned to you.");
    }
    if (role !== "WEB_DEVELOPER" && role !== "SUPPORT_FINANCE") {
      throw new ForbiddenError("You do not have access to maintenance reports.");
    }
  }

  // Period = the calendar month containing scheduledDate (UTC).
  const periodStart = new Date(
    Date.UTC(run.scheduledDate.getUTCFullYear(), run.scheduledDate.getUTCMonth(), 1)
  );
  const periodEnd = new Date(
    Date.UTC(run.scheduledDate.getUTCFullYear(), run.scheduledDate.getUTCMonth() + 1, 1)
  );

  // Real monitoring history for that website within the period (if monitored).
  const [checksTotal, checksFailed, periodIncidents, periodDeployments] = await Promise.all([
    db.healthCheck.count({
      where: { websiteId: run.websiteId, checkedAt: { gte: periodStart, lt: periodEnd } },
    }),
    db.healthCheck.count({
      where: { websiteId: run.websiteId, checkedAt: { gte: periodStart, lt: periodEnd }, success: false },
    }),
    db.incidentWebsite.findMany({
      where: { websiteId: run.websiteId, incident: { detectedAt: { gte: periodStart, lt: periodEnd } } },
      select: { incident: { select: { id: true, number: true, title: true, severity: true, status: true } } },
    }),
    db.deployment.findMany({
      where: { websiteId: run.websiteId, startedAt: { gte: periodStart, lt: periodEnd } },
      select: { id: true, environment: true, status: true, startedAt: true },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  const CHECKLIST_CATEGORIES = [
    "AVAILABILITY", "SSL_DOMAIN", "BACKUP", "FORMS", "LINKS",
    "UPDATES", "SECURITY", "PERFORMANCE", "GENERAL", "SUMMARY",
  ] as const;

  const checklist = CHECKLIST_CATEGORIES.map((category) => {
    const items = run.items.filter((i) => i.category === category);
    if (items.length === 0) return null;
    return {
      category,
      items: items.map((i) => ({
        label: i.label,
        result: i.result, // PENDING items are rendered as "Not completed" by the UI
        notes: i.notes,
        hasEvidence: i.evidenceDocumentId != null,
      })),
    };
  }).filter(Boolean);

  const failedItems = run.items.filter((i) => i.result === "FAILED" || i.result === "ATTEMPTED");
  const pendingItems = run.items.filter((i) => i.result === "PENDING");
  const issues = [
    ...failedItems.map((i) => `${i.label}: ${i.result}${i.notes ? ` — ${i.notes}` : " (no notes recorded)"}`),
    ...(pendingItems.length > 0
      ? [`${pendingItems.length} checklist item${pendingItems.length > 1 ? "s" : ""} not completed — the report cannot claim these checks were done.`]
      : []),
  ];

  const summaryLines = [
    `Maintenance run ${run.status} for ${run.website.name} (${run.website.client?.businessName ?? "unknown client"}).`,
    run.schedule ? `Schedule: ${run.schedule.name} (${run.schedule.frequency}).` : "Ad-hoc run (no schedule).",
    run.completedAt
      ? `Completed ${run.completedAt.toISOString()}${run.timeSpentMinutes ? ` after ${run.timeSpentMinutes} minutes` : ""}.`
      : "Not yet completed — figures below cover recorded work only.",
    run.workNotes ? `Operator notes: ${run.workNotes}` : "No operator notes recorded.",
    checksTotal > 0
      ? `Monitoring recorded ${checksTotal} health check${checksTotal === 1 ? "" : "s"} this month, ${checksFailed} failed.`
      : "No automated health checks were recorded for this website this month.",
    `Incidents this month: ${periodIncidents.length}. Deployments this month: ${periodDeployments.length}.`,
  ];

  return jsonOk({
    report: {
      runId: run.id,
      runStatus: run.status,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      website: { id: run.website.id, name: run.website.name, clientName: run.website.client?.businessName ?? null },
      scheduleName: run.schedule?.name ?? null,
      assignedTo: run.assignedTo?.displayName ?? null,
      completedAt: run.completedAt ? run.completedAt.toISOString() : null,
      timeSpentMinutes: run.timeSpentMinutes,
      workNotes: run.workNotes,
      summary: summaryLines,
      checklist,
      issues,
      stats: {
        checksTotal,
        checksFailed,
        incidents: periodIncidents.length,
        deployments: periodDeployments.length,
        itemsTotal: run.items.length,
        itemsPassed: run.items.filter((i) => i.result === "PASSED").length,
        itemsFailed: failedItems.length,
        itemsPending: pendingItems.length,
      },
      incidents: periodIncidents.map((iw) => ({
        id: iw.incident.id,
        displayNumber: `INC-${String(iw.incident.number).padStart(4, "0")}`,
        title: iw.incident.title,
        severity: iw.incident.severity,
        status: iw.incident.status,
      })),
      deployments: periodDeployments.map((d) => ({
        id: d.id,
        environment: d.environment,
        status: d.status,
        startedAt: d.startedAt.toISOString(),
      })),
    },
    note: "Assembled from recorded evidence only — items without a recorded result are listed as not completed.",
  });
});
