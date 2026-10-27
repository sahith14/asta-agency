/**
 * AgencyOS — Billing invoices API (Phase 3).
 * GET  /api/billing/invoices → Paginated<InvoiceRecord>
 *      filters: status (CSV; special "overdue" = unpaid + past due + balance),
 *      clientId, websiteId, projectId, subscriptionId, kind,
 *      search (client business name / notes); sort createdAt|issueDate|dueDate.
 * POST /api/billing/invoices → draft invoice, two modes:
 *      { fromQuoteId } converts an ACCEPTED quote, or free-form line inputs.
 *      Totals are always recomputed server-side from raw line inputs.
 */
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, ValidationError, jsonOk, parseQuery, withAuth } from "@/lib/api";
import { requireModule, requireFounder } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { createWithNumber } from "@/lib/billing-num";
import { displayNumber, getBillingSettings } from "@/lib/billing/settings";
import { startOfToday } from "@/lib/billing/invoice-math";
import {
  computeLineData,
  invoiceInclude,
  lineInputsFromRows,
  loadFullInvoiceRecord,
  toInvoiceRecord,
} from "@/lib/billing/record";
import { addDays, currencyInput, dateInput, linesSchema, parseEnumListParam } from "@/lib/billing/validate";
import {
  INVOICE_KINDS,
  INVOICE_STATUSES,
  UNPAID_INVOICE_STATUSES,
  type InvoiceRecord,
  type Paginated,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// GET /api/billing/invoices
// ---------------------------------------------------------------------------

const INVOICE_SORT_FIELDS = ["createdAt", "issueDate", "dueDate"] as const;
type InvoiceSortField = (typeof INVOICE_SORT_FIELDS)[number];

function buildOrderBy(sortField: InvoiceSortField, dir: "asc" | "desc"): Prisma.InvoiceOrderByWithRelationInput[] {
  switch (sortField) {
    case "issueDate":
      return [{ issueDate: dir }, { createdAt: "desc" }];
    case "dueDate":
      return [{ dueDate: dir }, { createdAt: "desc" }];
    default:
      return [{ createdAt: dir }];
  }
}

export const GET = withAuth(async (req, user) => {
  // RBAC: commercial records are founder + support/finance read.
  requireModule(user, "billing");
  const query = parseQuery(req);
  const sp = new URL(req.url).searchParams;
  const settings = await getBillingSettings();
  const today = startOfToday();

  const where: Prisma.InvoiceWhereInput = {};

  // status: CSV of invoice statuses; special token "overdue" selects unpaid
  // invoices past their due date with a remaining balance (computed).
  const rawStatus = sp.get("status");
  let wantsOverdue = false;
  let statusTokens: string[] | null = null;
  if (rawStatus) {
    const tokens = rawStatus
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    wantsOverdue = tokens.includes("overdue");
    const plain = tokens.filter((t) => t !== "overdue");
    for (const token of plain) {
      if (!(INVOICE_STATUSES as readonly string[]).includes(token)) {
        throw new BadRequestError(`Invalid status "${token}". Allowed: ${INVOICE_STATUSES.join(", ")}, overdue.`);
      }
    }
    statusTokens = plain.length > 0 ? plain : null;
  }

  const orBranches: Prisma.InvoiceWhereInput[] = [];
  if (statusTokens) orBranches.push({ status: { in: statusTokens } });
  if (wantsOverdue) {
    orBranches.push({
      status: { in: [...UNPAID_INVOICE_STATUSES] },
      dueDate: { lt: today },
    });
  }
  if (orBranches.length === 1) Object.assign(where, orBranches[0]);
  else if (orBranches.length > 1) where.OR = orBranches;

  if (query.clientId) where.clientId = query.clientId;
  if (query.websiteId) where.websiteId = query.websiteId;
  if (query.projectId) where.projectId = query.projectId;
  const subscriptionId = sp.get("subscriptionId");
  if (subscriptionId) where.subscriptionId = subscriptionId;

  const kind = sp.get("kind");
  if (kind) {
    if (!(INVOICE_KINDS as readonly string[]).includes(kind)) {
      throw new BadRequestError(`Invalid kind "${kind}". Allowed: ${INVOICE_KINDS.join(", ")}.`);
    }
    where.kind = kind;
  }

  const search = query.search ?? (sp.get("q")?.trim() || undefined);
  if (search) {
    where.OR = [
      ...(where.OR ?? []),
      { notes: { contains: search } },
      { client: { businessName: { contains: search } } },
    ];
  }

  const sortValid = (INVOICE_SORT_FIELDS as readonly string[]).includes(query.sort ?? "");
  const sortField = (sortValid ? query.sort : "createdAt") as InvoiceSortField;
  const dir = sortValid ? query.dir : "desc";

  // When "overdue" is requested, post-filter on the computed balance so a
  // paid-up invoice that merely passed its due date is not listed.
  const needsDerivedFilter = wantsOverdue;

  const [rows, total] = await Promise.all([
    db.invoice.findMany({
      where,
      include: invoiceInclude,
      orderBy: buildOrderBy(sortField, dir),
      ...(needsDerivedFilter ? {} : { skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    }),
    needsDerivedFilter
      ? db.invoice.findMany({ where, select: { id: true } }).then((r) => r.length)
      : db.invoice.count({ where }),
  ]);

  const allRecords = rows.map((row) => toInvoiceRecord(row, settings.invoicePrefix, today));
  const filtered = needsDerivedFilter ? allRecords.filter((r) => r.isOverdue) : allRecords;
  const paged = needsDerivedFilter
    ? filtered.slice((query.page - 1) * query.pageSize, query.page * query.pageSize)
    : filtered;

  const data: Paginated<InvoiceRecord> = {
    items: paged,
    total: needsDerivedFilter ? filtered.length : total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil((needsDerivedFilter ? filtered.length : total) / query.pageSize)),
  };
  return jsonOk(data);
});

// ---------------------------------------------------------------------------
// POST /api/billing/invoices
// ---------------------------------------------------------------------------

const freeFormInvoiceSchema = z.object({
  clientId: z.string().min(1, "Select a client."),
  projectId: z.string().min(1).nullish(),
  websiteId: z.string().min(1).nullish(),
  subscriptionId: z.string().min(1).nullish(),
  issueDate: dateInput,
  dueDate: dateInput,
  currency: currencyInput.optional(),
  taxInclusive: z.boolean().optional(),
  kind: z.enum(INVOICE_KINDS).default("ONE_OFF"),
  notes: z.string().max(5000).nullish(),
  terms: z.string().max(5000).nullish(),
  lines: linesSchema,
});

const fromQuoteSchema = z.object({
  fromQuoteId: z.string().min(1),
});

function parseOrThrow<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    throw new ValidationError("Please correct the highlighted fields.", issues);
  }
  return result.data;
}

export const POST = withAuth(async (req, user) => {
  // RBAC: creating invoices is founder-only.
  requireFounder(user);
  const settings = await getBillingSettings();
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }

  // Mode 1 — convert an accepted quote.
  if (raw && typeof raw === "object" && "fromQuoteId" in raw) {
    const body = parseOrThrow(fromQuoteSchema, raw);
    const record = await createInvoiceFromQuote(body.fromQuoteId, user.id, settings);
    return jsonOk(record, { status: 201 });
  }

  // Mode 2 — free-form draft.
  const body = parseOrThrow(freeFormInvoiceSchema, raw);
  const record = await createFreeFormInvoice(body, user, settings);
  return jsonOk(record, { status: 201 });
});

async function createInvoiceFromQuote(
  quoteId: string,
  userId: string,
  settings: Awaited<ReturnType<typeof getBillingSettings>>
) {
  const quote = await db.quote.findUnique({ where: { id: quoteId }, include: { lines: { orderBy: { position: "asc" } } } });
  if (!quote) throw new BadRequestError("Quote not found.");
  if (quote.status !== "ACCEPTED") {
    throw new BadRequestError("Only accepted quotes can be converted — accept the quote first.");
  }

  const now = new Date();
  const issueDate = now;
  const dueDate = addDays(issueDate, settings.defaultPaymentTermsDays);
  const rawLines = lineInputsFromRows(quote.lines);
  const { rows, totals } = computeLineData(rawLines, quote.taxInclusive);

  // Preserve the quote's scope in the invoice notes; quote stays linked via quoteId.
  const notesParts = [quote.scope ?? null, settings.defaultInvoiceNotes || null].filter(
    (v): v is string => Boolean(v && v.trim())
  );

  const created = await createWithNumber("invoice", (number) =>
    db.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          number,
          clientId: quote.clientId,
          quoteId: quote.id,
          projectId: quote.projectId,
          websiteId: quote.websiteId,
          kind: "ONE_OFF",
          status: "DRAFT",
          issueDate,
          dueDate,
          currency: quote.currency,
          taxInclusive: quote.taxInclusive,
          subtotalMinor: totals.subtotalMinor,
          taxMinor: totals.taxMinor,
          totalMinor: totals.totalMinor,
          notes: notesParts.length > 0 ? notesParts.join("\n\n") : null,
          terms: quote.terms ?? (settings.defaultInvoiceTerms || null),
          createdById: userId,
        },
      });
      await tx.invoiceLineItem.createMany({ data: rows.map((row) => ({ ...row, invoiceId: invoice.id })) });
      return invoice;
    })
  );

  await logActivity({
    action: "INVOICE_CREATED",
    entityType: "INVOICE",
    entityId: created.id,
    entityLabel: displayNumber(settings.invoicePrefix, created.number),
    summary: `Created draft invoice ${displayNumber(settings.invoicePrefix, created.number)} from quote ${displayNumber(settings.quotePrefix, quote.number)}.`,
    actor: null,
    clientId: created.clientId,
    websiteId: created.websiteId,
    projectId: created.projectId,
    metadata: { quoteId: quote.id },
  });

  return loadFullInvoiceRecord(created.id, settings.invoicePrefix);
}

async function createFreeFormInvoice(
  body: z.output<typeof freeFormInvoiceSchema>,
  user: { id: string },
  settings: Awaited<ReturnType<typeof getBillingSettings>>
) {
  const client = await db.client.findUnique({ where: { id: body.clientId }, select: { id: true, currency: true } });
  if (!client) throw new BadRequestError("Client not found.");

  if (body.websiteId) {
    const website = await db.website.findUnique({ where: { id: body.websiteId }, select: { id: true, clientId: true } });
    if (!website) throw new BadRequestError("Website not found.");
    if (website.clientId !== body.clientId) {
      throw new BadRequestError("Website does not belong to the selected client.");
    }
  }
  if (body.projectId) {
    const project = await db.project.findUnique({ where: { id: body.projectId }, select: { id: true, clientId: true } });
    if (!project) throw new BadRequestError("Project not found.");
    if (project.clientId !== body.clientId) {
      throw new BadRequestError("Project does not belong to the selected client.");
    }
  }
  if (body.subscriptionId) {
    const subscription = await db.subscription.findUnique({
      where: { id: body.subscriptionId },
      select: { id: true, clientId: true },
    });
    if (!subscription) throw new BadRequestError("Subscription not found.");
    if (subscription.clientId !== body.clientId) {
      throw new BadRequestError("Subscription does not belong to the selected client.");
    }
  }

  const now = new Date();
  const issueDate = body.issueDate ?? now;
  const dueDate = body.dueDate ?? addDays(issueDate, settings.defaultPaymentTermsDays);
  const currency = body.currency ?? client.currency ?? "GBP";
  const taxInclusive = body.taxInclusive ?? settings.taxInclusiveDefault;

  const { rows, totals } = computeLineData(body.lines, taxInclusive);
  if (totals.totalMinor <= 0) {
    throw new BadRequestError("Invoice total must be greater than zero.");
  }

  const created = await createWithNumber("invoice", (number) =>
    db.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          number,
          clientId: body.clientId,
          projectId: body.projectId ?? null,
          websiteId: body.websiteId ?? null,
          subscriptionId: body.subscriptionId ?? null,
          kind: body.kind,
          status: "DRAFT",
          issueDate,
          dueDate,
          currency,
          taxInclusive,
          subtotalMinor: totals.subtotalMinor,
          taxMinor: totals.taxMinor,
          totalMinor: totals.totalMinor,
          notes: body.notes ?? (settings.defaultInvoiceNotes || null),
          terms: body.terms ?? (settings.defaultInvoiceTerms || null),
          createdById: user.id,
        },
      });
      await tx.invoiceLineItem.createMany({ data: rows.map((row) => ({ ...row, invoiceId: invoice.id })) });
      return invoice;
    })
  );

  await logActivity({
    action: "INVOICE_CREATED",
    entityType: "INVOICE",
    entityId: created.id,
    entityLabel: displayNumber(settings.invoicePrefix, created.number),
    summary: `Created draft invoice ${displayNumber(settings.invoicePrefix, created.number)}.`,
    actor: null,
    clientId: created.clientId,
    websiteId: created.websiteId,
    projectId: created.projectId,
    metadata: { kind: body.kind, lineCount: body.lines.length, currency },
  });

  return loadFullInvoiceRecord(created.id, settings.invoicePrefix);
}
