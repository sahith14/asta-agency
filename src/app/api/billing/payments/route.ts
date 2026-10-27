/**
 * AgencyOS — Billing payments API (Phase 3).
 * GET  /api/billing/payments → Paginated<PaymentRecord>
 *      filters: status (CSV), clientId, websiteId (payments allocated to that
 *      website's invoices), method, search (reference/notes);
 *      sort paidAt|createdAt. Allocations carry FIFO-effective amounts.
 * POST /api/billing/payments → record a manual payment (PENDING by default —
 *      initiation ≠ confirmation; only verification reduces balances).
 */
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, jsonOk, parseBody, parseQuery, withAuth } from "@/lib/api";
import { requireModule, requireRoles } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { rateLimit } from "@/lib/rate-limit";
import { getBillingSettings } from "@/lib/billing/settings";
import { recomputeInvoicePaidCache } from "@/lib/billing/invoice-math";
import { createPaymentWithNumber, validatePaymentAllocations } from "@/lib/billing/payments";
import { paymentInclude, toPaymentRecord } from "@/lib/billing/record";
import {
  currencyInput,
  dateInput,
  parseEnumListParam,
  paymentMethodSchema,
  positiveMinorAmount,
} from "@/lib/billing/validate";
import { PAYMENT_METHODS, PAYMENT_STATUSES, type Paginated, type PaymentRecord } from "@/lib/types";

// ---------------------------------------------------------------------------
// GET /api/billing/payments
// ---------------------------------------------------------------------------

const PAYMENT_SORT_FIELDS = ["createdAt", "paidAt"] as const;
type PaymentSortField = (typeof PAYMENT_SORT_FIELDS)[number];

export const GET = withAuth(async (req, user) => {
  // RBAC: payment records are founder + support/finance only.
  requireModule(user, "billing");
  const query = parseQuery(req);
  const sp = new URL(req.url).searchParams;
  const settings = await getBillingSettings();

  const where: Prisma.PaymentWhereInput = {};

  const statuses = parseEnumListParam(sp.get("status"), PAYMENT_STATUSES, "status");
  if (statuses) where.status = { in: statuses };

  if (query.clientId) where.clientId = query.clientId;

  // websiteId scope: payments with at least one allocation onto an invoice of
  // that website (payments have no direct website relation — the allocation
  // join IS the real database relationship).
  if (query.websiteId) where.allocations = { some: { invoice: { websiteId: query.websiteId } } };

  const method = sp.get("method");
  if (method) {
    if (!(PAYMENT_METHODS as readonly string[]).includes(method)) {
      throw new BadRequestError(`Invalid method "${method}". Allowed: ${PAYMENT_METHODS.join(", ")}.`);
    }
    where.method = method;
  }

  const search = query.search ?? (sp.get("q")?.trim() || undefined);
  if (search) {
    where.OR = [{ referenceNum: { contains: search } }, { notes: { contains: search } }];
  }

  const sortValid = (PAYMENT_SORT_FIELDS as readonly string[]).includes(query.sort ?? "");
  const sortField = (sortValid ? query.sort : "createdAt") as PaymentSortField;
  const dir = sortValid ? query.dir : "desc";

  const [rows, total] = await Promise.all([
    db.payment.findMany({
      where,
      include: paymentInclude,
      orderBy: [{ [sortField]: dir }, { createdAt: "desc" }] as Prisma.PaymentOrderByWithRelationInput[],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.payment.count({ where }),
  ]);

  const data: Paginated<PaymentRecord> = {
    items: rows.map((row) => toPaymentRecord(row, settings.paymentRefPrefix)),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
  };
  return jsonOk(data);
});

// ---------------------------------------------------------------------------
// POST /api/billing/payments
// ---------------------------------------------------------------------------

const allocationInputSchema = z.object({
  invoiceId: z.string().min(1),
  amountMinor: positiveMinorAmount(),
});

const createPaymentSchema = z.object({
  clientId: z.string().min(1, "Select a client."),
  amountMinor: positiveMinorAmount(),
  currency: currencyInput.optional(),
  method: paymentMethodSchema.default("BANK_TRANSFER"),
  paidAt: dateInput,
  referenceNum: z.string().trim().max(200).nullish(),
  notes: z.string().max(2000).nullish(),
  allocations: z.array(allocationInputSchema).max(50).optional(),
});

export const POST = withAuth(async (req, user) => {
  // RBAC: recording payments is support/finance (+ founder superuser).
  requireRoles(user, ["SUPPORT_FINANCE"]);
  const limit = rateLimit("payment-create", 60, 60_000);
  if (!limit.ok) {
    throw new BadRequestError(`Too many payment submissions — try again in ${limit.retryAfterSeconds}s.`);
  }

  const body = await parseBody(req, createPaymentSchema);
  const settings = await getBillingSettings();

  const client = await db.client.findUnique({ where: { id: body.clientId }, select: { id: true, currency: true } });
  if (!client) throw new BadRequestError("Client not found.");

  const currency = body.currency ?? client.currency ?? "GBP";
  const now = new Date();

  // paidAt is operator-entered ("when the money moved") — future dates beyond
  // a 1-day tolerance are rejected outright.
  const paidAt = body.paidAt ?? now;
  if (paidAt.getTime() > now.getTime() + 24 * 60 * 60 * 1000) {
    throw new BadRequestError("Payment date cannot be in the future.");
  }

  const allocations = body.allocations ?? [];

  const created = await createPaymentWithNumber((reference) =>
    db.$transaction(async (tx) => {
      // Validate allocations against the live state inside the transaction.
      const validated = await validatePaymentAllocations(tx, {
        paymentClientId: body.clientId,
        paymentAmountMinor: body.amountMinor,
        paymentCurrency: currency,
        allocations,
        invoicePrefix: settings.invoicePrefix,
      });

      const payment = await tx.payment.create({
        data: {
          reference,
          clientId: body.clientId,
          amountMinor: body.amountMinor,
          currency,
          method: body.method,
          status: "PENDING",
          paidAt,
          referenceNum: body.referenceNum ?? null,
          notes: body.notes ?? null,
          createdById: user.id,
        },
      });

      if (validated.normalized.length > 0) {
        await tx.paymentAllocation.createMany({
          data: validated.normalized.map((a) => ({ paymentId: payment.id, invoiceId: a.invoiceId, amountMinor: a.amountMinor })),
        });
      }

      // Keep the paid/pending caches consistent (PENDING does not change
      // paidMinor, but recomputing is the single sanctioned path).
      for (const invoiceId of validated.invoiceIds) {
        await recomputeInvoicePaidCache(tx, invoiceId);
      }

      return payment;
    })
  );

  await logActivity({
    action: "PAYMENT_RECORDED",
    kind: "AUDIT",
    entityType: "PAYMENT",
    entityId: created.id,
    entityLabel: `${settings.paymentRefPrefix}${String(created.reference).padStart(4, "0")}`,
    summary: `Recorded payment ${settings.paymentRefPrefix}${String(created.reference).padStart(4, "0")} (pending verification).`,
    actor: user,
    clientId: created.clientId,
    metadata: {
      method: created.method,
      status: created.status,
      amountMinor: created.amountMinor,
      currency: created.currency,
      allocatedCount: allocations.length,
      referenceNum: body.referenceNum ?? null,
    },
  });

  const full = await db.payment.findUnique({ where: { id: created.id }, include: paymentInclude });
  if (!full) throw new BadRequestError("Payment could not be loaded after creation.");
  return jsonOk(toPaymentRecord(full, settings.paymentRefPrefix), { status: 201 });
});
