/**
 * AgencyOS — API route helpers.
 * Structured JSON responses, zod validation, auth guard, safe error handling.
 */
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z, ZodType } from "zod";
import { getSessionUser, type SessionUser } from "@/lib/auth";

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: {
    code: string;
    message: string;
    issues?: { path: string; message: string }[];
  };
}

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiSuccess<T>>({ ok: true, data }, init);
}

export function jsonError(
  code: string,
  message: string,
  status: number,
  issues?: { path: string; message: string }[]
) {
  return NextResponse.json<ApiError>({ ok: false, error: { code, message, issues } }, { status });
}

export class ApiHttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public issues?: { path: string; message: string }[]
  ) {
    super(message);
  }
}

export class ValidationError extends ApiHttpError {
  constructor(message: string, issues?: { path: string; message: string }[]) {
    super(400, "VALIDATION_ERROR", message, issues);
  }
}
export class NotFoundError extends ApiHttpError {
  constructor(message = "Record not found") {
    super(404, "NOT_FOUND", message);
  }
}
export class ConflictError extends ApiHttpError {
  constructor(message: string, issues?: { path: string; message: string }[]) {
    super(409, "CONFLICT", message, issues);
  }
}
export class BadRequestError extends ApiHttpError {
  constructor(message: string) {
    super(400, "BAD_REQUEST", message);
  }
}
export class ForbiddenError extends ApiHttpError {
  constructor(message = "You do not have permission to perform this action.") {
    super(403, "FORBIDDEN", message);
  }
}

/** Wraps a route handler: auth guard + structured error responses. */
export function withAuth<T extends SessionUser = SessionUser>(
  handler: (req: NextRequest, user: T, ctx: { params: Promise<Record<string, string>> }) => Promise<NextResponse>
) {
  return async (req: NextRequest, ctx: { params?: Promise<Record<string, string>> } = {}) => {
    try {
      const user = await getSessionUser();
      if (!user) {
        return jsonError("UNAUTHENTICATED", "Authentication required. Please sign in.", 401);
      }
      const params = ctx?.params ?? Promise.resolve({} as Record<string, string>);
      return await handler(req, user as T, { params });
    } catch (err) {
      if (err instanceof ApiHttpError) {
        return jsonError(err.code, err.message, err.status, err.issues);
      }
      const anyErr = err as { code?: string; message?: string };
      if (anyErr?.code === "P2025") {
        return jsonError("NOT_FOUND", "Record not found", 404);
      }
      if (anyErr?.code === "P2002") {
        return jsonError("CONFLICT", "A record with the same unique value already exists.", 409);
      }
      console.error("[api] Unhandled error:", err);
      return jsonError("INTERNAL_ERROR", "Something went wrong on the server. Please try again.", 500);
    }
  };
}

/** Parses and validates a JSON body with zod; throws ValidationError on failure. */
export async function parseBody<S extends ZodType>(req: NextRequest, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
    throw new ValidationError("Please correct the highlighted fields.", issues);
  }
  return result.data;
}

export function parseQuery(req: NextRequest) {
  const url = new URL(req.url);
  const q = url.searchParams;
  return {
    search: q.get("search")?.trim() || undefined,
    status: q.get("status") || undefined,
    clientId: q.get("clientId") || undefined,
    websiteId: q.get("websiteId") || undefined,
    projectId: q.get("projectId") || undefined,
    priority: q.get("priority") || undefined,
    assigneeId: q.get("assigneeId") || undefined,
    due: q.get("due") || undefined, // overdue | today | week | none
    sort: q.get("sort") || undefined,
    dir: (q.get("dir") === "desc" ? "desc" : "asc") as "asc" | "desc",
    archived: q.get("archived") || undefined, // "true" => include archived
    page: Math.max(1, parseInt(q.get("page") || "1", 10) || 1),
    pageSize: Math.min(100, Math.max(5, parseInt(q.get("pageSize") || "20", 10) || 20)),
  };
}

export type ListQuery = ReturnType<typeof parseQuery>;
