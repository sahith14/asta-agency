/**
 * AgencyOS — Billing invoice detail API (Phase 3).
 * GET   /api/billing/invoices/[id] → InvoiceDetailData (invoice + derived
 *       amounts + lines + payment rows (FIFO-effective) + activity +
 *       allowed transitions)
 * PATCH /api/billing/invoices/[id] → DRAFT-only edits. Issued invoices are
 *       corrected by voiding and replacing them — never silently rewritten.
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, NotFoundError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { requireModule, requireFounder } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { getBillingSettings, displayNumber } from "@/lib/billing/settings";
import { effectiveAllocations } from "@/lib/money";
import { INVOICE_TRANSITIONS } from "@/lib/types";
import {
  computeLineData,
  invoiceInclude,
  loadFullInvoiceRecord,
  loadEntityActivity,
  toBillingLineRecord,
  toInvoiceRecord,
} from "@/lib/billing/record";
import { dateInput, linesSchema } from "@/lib/billing/validate";
import type { InvoiceDetailData, InvoicePaymentRow } from "@/lib/types";

// ---------------------------------------------------------------------------
// GET /api/billing/invoices/[id]
// ---------------------------------------------------------------------------

export const GET = withAuth(async (_req, user, { params }) => {
  // RBAC: commercial records are founder + support/finance read.
  requireModule(user, "billing");
  const { id } = await params;
  const settings = await getBillingSettings();

  const invoice = await db.invoice.findUnique({
    where: { id },
    include: {
      ...invoiceInclude,
      lines: true,
      allocations: {
        include: {
          payment: {
            select: { id: true, reference: true, status: true, method: true, paidAt: true, amountMinor: true, refundMinor: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!invoice) throw new NotFoundError("Invoice not found.");

  // FIFO refund share runs per payment, so each allocation row reports its
  // effective (post-refund) contribution.
  const byPayment = new Map<string, typeof invoice.allocations>();
  for (const alloc of invoice.allocations) {
    const list = byPayment.get(alloc.paymentId) ?? [];
    list.push(alloc);
    byPayment.set(alloc.paymentId, list);
  }
  const effectiveByAllocation = new Map<string, number>();
  for (const allocs of byPayment.values()) {
    const payment = allocs[0].payment;
    for (const entry of effectiveAllocations(
      payment.amountMinor,
      payment.refundMinor,
      allocs.map((a) => ({ id: a.id, amountMinor: a.amountMinor }))
    )) {
      effectiveByAllocation.set(entry.id, entry.effectiveMinor);
    }
  }

  const payments: InvoicePaymentRow[] = invoice.allocations.map((alloc) => ({
    allocationId: alloc.id,
    paymentId: alloc.paymentId,
    displayNumber: displayNumber(settings.paymentRefPrefix, alloc.payment.reference),
    status: alloc.payment.status,
    method: alloc.payment.method,
    paidAt: alloc.payment.paidAt.toISOString(),
    allocatedMinor: alloc.amountMinor,
    effectiveMinor: effectiveByAllocation.get(alloc.id) ?? alloc.amountMinor,
  }));

  const activity = await loadEntityActivity("INVOICE", invoice.id);

  const data: InvoiceDetailData = {
    invoice: toInvoiceRecord(invoice, settings.invoicePrefix),
    lines: invoice.lines.sort((a, b) => a.position - b.position).map((l) => toBillingLineRecord(l)),
    payments,
    activity,
    allowedTransitions: [...(INVOICE_TRANSITIONS[invoice.status] ?? [])],
  };
  return jsonOk(data);
});

// ---------------------------------------------------------------------------
// PATCH /api/billing/invoices/[id] — DRAFT only
// ---------------------------------------------------------------------------

const patchInvoiceSchema = z.object({
  issueDate: dateInput,
  dueDate: dateInput,
  notes: z.string().max(5000).nullish(),
  terms: z.string().max(5000).nullish(),
  lines: linesSchema.optional(), // replace-all when provided
  websiteId: z.string().min(1).nullish(),
  projectId: z.string().min(1).nullish(),
});

export const PATCH = withAuth(async (req, user, { params }) => {
  // RBAC: invoice edits are founder-only (corrections go via void + replace).
  requireFounder(user);
  const { id } = await params;
  const body = await parseBody(req, patchInvoiceSchema);
  const settings = await getBillingSettings();

  const existing = await db.invoice.findUnique({ where: { id }, include: { lines: true } });
  if (!existing) throw new NotFoundError("Invoice not found.");
  if (existing.status !== "DRAFT") {
    throw new BadRequestError("Only draft invoices can be edited. Issued invoices are corrected by voiding and replacing them.");
  }

  if (body.websiteId) {
    const website = await db.website.findUnique({ where: { id: body.websiteId }, select: { id: true, clientId: true } });
    if (!website) throw new BadRequestError("Website not found.");
    if (website.clientId !== existing.clientId) {
      throw new BadRequestError("Website does not belong to the invoice's client.");
    }
  }
  if (body.projectId) {
    const project = await db.project.findUnique({ where: { id: body.projectId }, select: { id: true, clientId: true } });
    if (!project) throw new BadRequestError("Project not found.");
    if (project.clientId !== existing.clientId) {
      throw new BadRequestError("Project does not belong to the invoice's client.");
    }
  }

  // number / status / paidMinor / currency / tax mode are NOT editable here.
  const { rows, totals } = body.lines
    ? computeLineData(body.lines, existing.taxInclusive)
    : { rows: [], totals: null };

  await db.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id },
      data: {
        ...(body.issueDate !== undefined ? { issueDate: body.issueDate ?? new Date() } : {}),
        ...(body.dueDate !== undefined ? { dueDate: body.dueDate } : {}),
        ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
        ...(body.terms !== undefined ? { terms: body.terms ?? null } : {}),
        ...(body.websiteId !== undefined
          ? { website: body.websiteId ? { connect: { id: body.websiteId } } : { disconnect: true } }
          : {}),
        ...(body.projectId !== undefined
          ? { project: body.projectId ? { connect: { id: body.projectId } } : { disconnect: true } }
          : {}),
        ...(totals
          ? { subtotalMinor: totals.subtotalMinor, taxMinor: totals.taxMinor, totalMinor: totals.totalMinor }
          : {}),
      },
    });
    if (body.lines) {
      await tx.invoiceLineItem.deleteMany({ where: { invoiceId: id } });
      await tx.invoiceLineItem.createMany({ data: rows.map((row) => ({ ...row, invoiceId: id })) });
    }
  });

  await logActivity({
    action: "INVOICE_UPDATED",
    entityType: "INVOICE",
    entityId: id,
    entityLabel: displayNumber(settings.invoicePrefix, existing.number),
    summary: `Updated draft invoice ${displayNumber(settings.invoicePrefix, existing.number)}.`,
    actor: user,
    clientId: existing.clientId,
    websiteId: existing.websiteId,
    projectId: existing.projectId,
    metadata: { fields: Object.keys(body), linesReplaced: Boolean(body.lines) },
  });

  return jsonOk(await loadFullInvoiceRecord(id, settings.invoicePrefix));
});
