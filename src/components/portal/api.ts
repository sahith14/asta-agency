/** Small fetch helpers for portal client components. Errors surface the API's
 * friendly message; network/parse failures fall back to a generic message. */

export class ApiClientError extends Error {
  status: number
  code?: string
  constructor(status: number, message: string, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function readError(res: Response): Promise<ApiClientError> {
  let payload: { error?: string; code?: string } | null = null
  try {
    payload = (await res.json()) as { error?: string; code?: string }
  } catch {
    payload = null
  }
  return new ApiClientError(res.status, payload?.error ?? 'Something went wrong — please try again.', payload?.code)
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw await readError(res)
  return (await res.json()) as T
}

export async function apiSend<T>(url: string, method: 'POST' | 'PATCH', body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw await readError(res)
  return (await res.json()) as T
}

export async function apiUpload<T>(url: string, form: FormData): Promise<T> {
  const res = await fetch(url, { method: 'POST', body: form })
  if (!res.ok) throw await readError(res)
  return (await res.json()) as T
}

/** Append ?clientId= for FOUNDER "view as client" mode (audited server-side). */
export function withScope(path: string, clientId?: string | null): string {
  if (!clientId) return path
  return `${path}${path.includes('?') ? '&' : '?'}clientId=${encodeURIComponent(clientId)}`
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong — please try again.'
}
