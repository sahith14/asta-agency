/**
 * AgencyOS — Notification sweep job (Phase 5, spec §8).
 *
 * Idempotent recurring notifications: every sweep section computes a
 * deterministic dedupKey so re-running the job can never create duplicates
 * (the (userId, dedupKey) unique constraint absorbs repeats). One failing
 * section never kills the sweep — errors are collected and the job reports
 * PARTIAL, staying visible in BackgroundJobRun.
 *
 * Sections:
 *  a. Ticket SLA breach (open, target set, no first response, breached)
 *  b. Maintenance runs due within 3 days (assigned person)
 *  c. Overdue invoices (founder)
 *  d. Failed payments in the last 7 days (founder)
 *  e. Subscriptions renewing within 7 days (founder)
 *  f. Open tasks due within 48 hours (assignee)
 */
import "server-only";
import { db } from "@/lib/db";
import { notifyFounders, notifyUsers } from "@/lib/notify";
import { OPEN_TASK_STATUSES, OPEN_TICKET_STATUSES } from "@/lib/types";

export interface SweepSection {
  section: string;
  notified: number;
  error?: string;
}

async function sweepTicketSla(): Promise<SweepSection> {
  try {
    const now = new Date();
    const tickets = await db.ticket.findMany({
      where: {
        status: { in: [...OPEN_TICKET_STATUSES] },
        slaTargetMinutes: { not: null },
        firstResponseAt: null,
      },
      select: { id: true, number: true, subject: true, slaTargetMinutes: true, createdAt: true, assigneeId: true },
    });
    let notified = 0;
    for (const t of tickets) {
      const due = t.createdAt.getTime() + (t.slaTargetMinutes ?? 0) * 60_000;
      if (due >= now.getTime()) continue;
      notified += await notifyFounders({
        kind: "TICKET_SLA_BREACH",
        title: `SLA breached: TKT-${String(t.number).padStart(4, "0")} has not had a first response`,
        body: `“${t.subject}” breached its ${t.slaTargetMinutes}-minute response target.`,
        entityType: "TICKET",
        entityId: t.id,
        dedupKey: `sla:${t.id}`,
      });
      if (t.assigneeId) {
        notified += await notifyUsers([t.assigneeId], {
          kind: "TICKET_SLA_BREACH",
          title: `SLA breached on your ticket TKT-${String(t.number).padStart(4, "0")}`,
          body: `“${t.subject}” breached its ${t.slaTargetMinutes}-minute response target.`,
          entityType: "TICKET",
          entityId: t.id,
          dedupKey: `sla:${t.id}`,
        });
      }
    }
    return { section: "ticketSla", notified };
  } catch (err) {
    return { section: "ticketSla", notified: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

async function sweepMaintenanceDue(): Promise<SweepSection> {
  try {
    const now = new Date();
    const in3 = new Date(now.getTime() + 3 * 24 * 3_600_000);
    const runs = await db.maintenanceRun.findMany({
      where: { status: "PLANNED", scheduledDate: { gte: now, lte: in3 }, assignedToId: { not: null } },
      select: { id: true, scheduledDate: true, website: { select: { name: true } }, assignedToId: true },
    });
    let notified = 0;
    for (const r of runs) {
      if (!r.assignedToId) continue;
      notified += await notifyUsers([r.assignedToId], {
        kind: "MAINTENANCE_DUE",
        title: `Maintenance due: ${r.website.name}`,
        body: `Scheduled for ${r.scheduledDate.toISOString().slice(0, 10)}.`,
        entityType: "MAINTENANCE_RUN",
        entityId: r.id,
        dedupKey: `maint:${r.id}:${r.scheduledDate.toISOString().slice(0, 10)}`,
      });
    }
    return { section: "maintenanceDue", notified };
  } catch (err) {
    return { section: "maintenanceDue", notified: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

async function sweepOverdueInvoices(): Promise<SweepSection> {
  try {
    const invoices = await db.invoice.findMany({
      where: { status: "OVERDUE" },
      select: { id: true, number: true, dueDate: true, client: { select: { businessName: true } } },
    });
    let notified = 0;
    for (const inv of invoices) {
      notified += await notifyFounders({
        kind: "INVOICE_OVERDUE",
        title: `Invoice INV-${String(inv.number).padStart(4, "0")} is overdue`,
        body: `${inv.client?.businessName ?? "Client"} — due ${inv.dueDate ? inv.dueDate.toISOString().slice(0, 10) : "unknown"}.`,
        entityType: "INVOICE",
        entityId: inv.id,
        dedupKey: `inv:${inv.id}:${inv.dueDate ? inv.dueDate.toISOString().slice(0, 10) : "none"}`,
      });
    }
    return { section: "overdueInvoices", notified };
  } catch (err) {
    return { section: "overdueInvoices", notified: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

async function sweepFailedPayments(): Promise<SweepSection> {
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 3_600_000);
    const payments = await db.payment.findMany({
      where: { status: "FAILED", createdAt: { gte: weekAgo } },
      select: { id: true, amountMinor: true, reference: true, client: { select: { businessName: true } }, allocations: { include: { invoice: { select: { number: true } } } } },
    });
    let notified = 0;
    for (const p of payments) {
      notified += await notifyFounders({
        kind: "PAYMENT_FAILED",
        title: `Payment failed — ${p.client?.businessName ?? "client"}`,
        body: `${p.allocations[0]?.invoice ? `INV-${String(p.allocations[0].invoice.number).padStart(4, "0")} — ` : "Unallocated payment — "}marked failed in the last 7 days.`,
        entityType: "PAYMENT",
        entityId: p.id,
        dedupKey: `payfail:${p.id}`,
      });
    }
    return { section: "failedPayments", notified };
  } catch (err) {
    return { section: "failedPayments", notified: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

async function sweepUpcomingRenewals(): Promise<SweepSection> {
  try {
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 24 * 3_600_000);
    const subs = await db.subscription.findMany({
      where: { status: { in: ["ACTIVE", "PAST_DUE"] }, nextRenewalDate: { gte: now, lte: in7, not: null } },
      select: { id: true, nextRenewalDate: true, client: { select: { businessName: true } }, plan: { select: { name: true } } },
    });
    let notified = 0;
    for (const s of subs) {
      const renewalAt = s.nextRenewalDate;
      if (!renewalAt) continue;
      notified += await notifyFounders({
        kind: "SUBSCRIPTION_RENEWING",
        title: `Subscription renewing: ${s.client?.businessName ?? "client"}`,
        body: `${s.plan?.name ?? "Plan"} renews ${renewalAt.toISOString().slice(0, 10)}.`,
        entityType: "SUBSCRIPTION",
        entityId: s.id,
        dedupKey: `renew:${s.id}:${renewalAt.toISOString().slice(0, 10)}`,
      });
    }
    return { section: "upcomingRenewals", notified };
  } catch (err) {
    return { section: "upcomingRenewals", notified: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

async function sweepTaskDeadlines(): Promise<SweepSection> {
  try {
    const now = new Date();
    const in48 = new Date(now.getTime() + 48 * 3_600_000);
    const tasks = await db.task.findMany({
      where: { status: { in: [...OPEN_TASK_STATUSES] }, dueAt: { gte: now, lte: in48 }, assigneeId: { not: null } },
      select: { id: true, taskNumber: true, title: true, dueAt: true, assigneeId: true },
    });
    let notified = 0;
    for (const t of tasks) {
      if (!t.assigneeId || !t.dueAt) continue;
      notified += await notifyUsers([t.assigneeId], {
        kind: "TASK_DUE_SOON",
        title: `Task due soon: ${t.title}`,
        body: `Due ${t.dueAt.toISOString().slice(0, 16).replace("T", " ")} UTC.`,
        entityType: "TASK",
        entityId: t.id,
        dedupKey: `taskdue:${t.id}:${t.dueAt.toISOString()}`,
      });
    }
    return { section: "taskDeadlines", notified };
  } catch (err) {
    return { section: "taskDeadlines", notified: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Runs every sweep section; returns per-section counts (idempotent). */
export async function runNotificationSweep(): Promise<{ results: Record<string, unknown>; partial?: boolean }> {
  const sections = await Promise.all([
    sweepTicketSla(),
    sweepMaintenanceDue(),
    sweepOverdueInvoices(),
    sweepFailedPayments(),
    sweepUpcomingRenewals(),
    sweepTaskDeadlines(),
  ]);
  const failed = sections.filter((s) => s.error);
  const results = {
    sections: sections.map((s) => ({ section: s.section, notified: s.notified, ...(s.error ? { error: s.error } : {}) })),
    totalNotified: sections.reduce((acc, s) => acc + s.notified, 0),
  };
  return { results, partial: failed.length > 0 };
}
