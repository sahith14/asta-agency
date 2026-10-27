/**
 * AgencyOS — Billing quotes API (Phase 3).
 * GET  /api/billing/quotes → Paginated<QuoteRecord>
 *      filters: status (CSV), clientId, websiteId, projectId,
 *      search (scope/terms/client business name); sort createdAt|issueDate|expiryDate.
 * POST /api/billing/quotes → draft quote; totals recomputed server-side from
 *      raw line inputs (browser totals are never trusted).
 */
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { BadRequestError, jsonOk, parseBody, parseQuery, withAuth } from "@/lib/api";
import { requireModule, requireFounder } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { createWithNumber } from "@/lib/billing-num";
import { displayNumber, getBillingSettings } from "@/lib/billing/settings";
import {
  computeLineData,
  quoteInclude,
  toBillingLineRecord,
  toQuoteRecord,
} from "@/lib/billing/record";
import {
  currencyInput,
  dateInput,
  linesSchema,
  parseEnumListParam,
} from "@/lib/billing/validate";
import { addDays } from "@/lib/billing/validate";
import type { Paginated, QuoteRecord } from "@/lib/types";

// ---------------------------------------------------------------------------
// GET /api/billing/quotes
// ---------------------------------------------------------------------------

const QUOTE_SORT_FIELDS = ["createdAt", "issueDate", "expiryDate"] as const;
type QuoteSortField = (typeof QUOTE_SORT_FIELDS)[number];

export const GET = withAuth(async (req, user) => {
  // RBAC: commercial records are founder + support/finance read.
  requireModule(user, "billing");
  const query = parseQuery(req);
  const sp = new URL(req.url).searchParams;
  const settings = await getBillingSettings();

  const where: Prisma.QuoteWhereInput = {};

  const statuses = parseEnumListParam(sp.get("status"), ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED"], "status");
  if (statuses) where.status = { in: statuses };

  if (query.clientId) where.clientId = query.clientId;
  if (query.websiteId) where.websiteId = query.websiteId;
  if (query.projectId) where.projectId = query.projectId;

  const search = query.search ?? (sp.get("q")?.trim() || undefined);
  if (search) {
    where.OR = [
      { scope: { contains: search } },
      { terms: { contains: search } },
      { client: { businessName: { contains: search } } },
    ];
  }

  const sortValid = (QUOTE_SORT_FIELDS as readonly string[]).includes(query.sort ?? "");
  const sortField = (sortValid ? query.sort : "createdAt") as QuoteSortField;
  const dir = sortValid ? query.dir : "desc";

  const orderBy: Prisma.QuoteOrderByWithRelationInput[] =
    sortField === "createdAt"
      ? [{ createdAt: dir }]
      : sortField === "issueDate"
        ? [{ issueDate: dir }, { createdAt: "desc" }]
        : [{ expiryDate: dir }, { createdAt: "desc" }];

  const [rows, total] = await Promise.all([
    db.quote.findMany({
      where,
      include: quoteInclude,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.quote.count({ where }),
  ]);

  const data: Paginated<QuoteRecord> = {
    items: rows.map((row) => toQuoteRecord(row, settings.quotePrefix)),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
  };
  return jsonOk(data);
});

// ---------------------------------------------------------------------------
// POST /api/billing/quotes — create draft
// ---------------------------------------------------------------------------

const createQuoteSchema = z.object({
  clientId: z.string().min(1, "Select a client."),
  projectId: z.string().min(1).nullish(),
  websiteId: z.string().min(1).nullish(),
  issueDate: dateInput,
  expiryDate: dateInput,
  currency: currencyInput.optional(),
  taxInclusive: z.boolean().optional(),
  scope: z.string().max(5000).nullish(),
  terms: z.string().max(5000).nullish(),
  lines: linesSchema,
});

export const POST = withAuth(async (req, user) => {
  // RBAC: creating quotes is founder-only.
  requireFounder(user);
  const body = await parseBody(req, createQuoteSchema);
  const settings = await getBillingSettings();

  // --- linked record validation ---------------------------------------------
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

  // --- defaults (server-owned) ----------------------------------------------
  const now = new Date();
  const issueDate = body.issueDate ?? now;
  const expiryDate = body.expiryDate ?? addDays(issueDate, settings.defaultQuoteExpiryDays);
  const currency = body.currency ?? client.currency ?? "GBP";
  const taxInclusive = body.taxInclusive ?? settings.taxInclusiveDefault;
  const terms = body.terms !== undefined ? body.terms : settings.defaultQuoteTerms || null;

  // --- server-side money math -----------------------------------------------
  const { rows, totals } = computeLineData(body.lines, taxInclusive);

  // Number allocation retries on P2002 races; the document + its lines are
  // created atomically inside a transaction per attempt.
  const created = await createWithNumber("quote", (number) =>
    db.$transaction(async (tx) => {
      const quote = await tx.quote.create({
        data: {
          number,
          clientId: body.clientId,
          projectId: body.projectId ?? null,
          websiteId: body.websiteId ?? null,
          status: "DRAFT",
          issueDate,
          expiryDate,
          currency,
          taxInclusive,
          subtotalMinor: totals.subtotalMinor,
          taxMinor: totals.taxMinor,
          totalMinor: totals.totalMinor,
          scope: body.scope ?? null,
          terms,
          createdById: user.id,
        },
      });
      await tx.quoteLineItem.createMany({
        data: rows.map((row) => ({ ...row, quoteId: quote.id })),
      });
      return quote;
    })
  );

  await logActivity({
    action: "QUOTE_CREATED",
    entityType: "QUOTE",
    entityId: created.id,
    entityLabel: displayNumber(settings.quotePrefix, created.number),
    summary: `Created draft quote ${displayNumber(settings.quotePrefix, created.number)}.`,
    actor: user,
    clientId: created.clientId,
    websiteId: created.websiteId,
    projectId: created.projectId,
    metadata: { lineCount: body.lines.length, currency },
  });

  const full = await db.quote.findUnique({ where: { id: created.id }, include: { ...quoteInclude, lines: true } });
  if (!full) throw new BadRequestError("Quote could not be loaded after creation.");
  const record = toQuoteRecord(full, settings.quotePrefix);
  record.lines = full.lines
    .sort((a, b) => a.position - b.position)
    .map((l) => toBillingLineRecord(l));
  return jsonOk(record, { status: 201 });
});
